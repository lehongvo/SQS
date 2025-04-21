import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, BatchStatus } from '@prisma/client';
import { ethers } from 'ethers';
import { OrdersService } from '../../orders/orders.service';
import { WalletsService } from '../../wallets/wallets.service';
import { BatchProcessingService } from '../batch-processing.service';
import { MINT_NFT_ABI } from '../../utils/abi';
import { Worker } from '@prisma/client';
import { JsonRpcProvider, Transaction, formatEther } from 'ethers';

@Injectable()
export class NftMintProcessor {
  private readonly logger = new Logger(NftMintProcessor.name);
  private readonly contract: ethers.Contract;
  private readonly retryLimit = 3;

  constructor(
    @Inject('CONTRACT_ADDRESS')
    private readonly contractAddress: string,
    @Inject('PROVIDER')
    private readonly provider: ethers.JsonRpcProvider,
    private readonly ordersService: OrdersService,
    private readonly walletsService: WalletsService,
    private readonly batchService: BatchProcessingService,
    private readonly configService: ConfigService,
  ) {
    this.contract = new ethers.Contract(
      contractAddress,
      MINT_NFT_ABI,
      provider,
    );
  }

  async processOrder(orderId: string): Promise<void> {
    try {
      // Get order details
      const order = await this.ordersService.getOrderById(orderId);
      if (order.status !== OrderStatus.PENDING) {
        this.logger.warn(
          `Order ${orderId} is not in PENDING status. Current status: ${order.status}`,
        );
        return;
      }

      // Get an available worker
      const worker = await this.walletsService.getAvailableWorker();
      this.logger.log(
        `Using worker ${worker.id} (${worker.address}) to process order ${orderId}`,
      );

      // Assign worker to order
      await this.ordersService.assignWorkerToOrder(orderId, worker.id);

      try {
        // Get worker's current nonce
        const nonce = await this.provider.getTransactionCount(worker.address);

        // Check if nonce from blockchain is different from stored nonce
        if (nonce !== worker.nonce) {
          this.logger.warn(
            `Worker ${worker.id} nonce discrepancy: stored=${worker.nonce}, onchain=${nonce}. Using onchain value.`,
          );
        }

        // Prepare mint transaction data
        const mintToAddress = order.mintToAddress;
        const tokenURI = `ipfs://${order.image}`;
        const name = order.name;
        const description = order.description || '';
        const attributes = order.attributes
          ? JSON.stringify(order.attributes)
          : '{}';

        // Encode function data for mintTo function
        const mintToData = this.contract.interface.encodeFunctionData(
          'mintTo',
          [mintToAddress, tokenURI, name, description, attributes],
        );

        // Get gas price with buffer
        const gasPrice = await this.provider.getFeeData();
        const maxFeePerGas = gasPrice.maxFeePerGas
          ? (gasPrice.maxFeePerGas * BigInt(12)) / BigInt(10) // Add 20% buffer
          : undefined;
        const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas
          ? (gasPrice.maxPriorityFeePerGas * BigInt(12)) / BigInt(10) // Add 20% buffer
          : undefined;

        // Estimate gas
        const gasLimit = await this.contract
          .getFunction('mintTo')
          .estimateGas(mintToAddress, tokenURI, name, description, attributes, {
            from: worker.address,
          });

        // Add 20% buffer to gas limit
        const gasLimitWithBuffer = (gasLimit * BigInt(12)) / BigInt(10);

        const network = await this.provider.getNetwork();
        // Create transaction object
        const tx = {
          to: this.contractAddress,
          data: mintToData,
          nonce,
          chainId: network.chainId,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit: gasLimitWithBuffer,
          type: 2, // EIP-1559 transaction
        };

        // Sign transaction with worker wallet
        const signedTx = await this.walletsService.signTransaction(
          worker,
          Transaction.from(tx).serialized,
        );

        // Send transaction
        const txResponse = await this.provider.broadcastTransaction(signedTx);
        this.logger.log(
          `Transaction sent: ${txResponse.hash} for order ${orderId}`,
        );

        // Wait for transaction confirmation
        const receipt = await txResponse.wait();
        this.logger.log(
          `Transaction confirmed: ${receipt?.hash} for order ${orderId}`,
        );

        await this.processTransaction(receipt, orderId, worker);
      } catch (error) {
        // Handle error and mark order as failed
        this.logger.error(
          `Error processing order ${orderId}: ${error.message}`,
          error.stack,
        );

        // Mark order as failed
        await this.ordersService.failOrder(orderId, error.message);

        // Update worker stats for failed transaction
        await this.walletsService.trackFailedMint(worker.id);

        // Update batch stats if this order is part of a batch
        if (order.batchId) {
          await this.batchService.incrementFailedOrders(order.batchId);
        }

        // Release worker
        await this.walletsService.releaseWorker(worker.id);

        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Failed to process order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async processBatch(batchId: string): Promise<void> {
    this.logger.log(`Processing batch ${batchId}`);

    try {
      // Get batch details
      const batch = await this.ordersService.getBatchById(batchId);

      // Get pending orders for this batch
      const pendingOrders =
        await this.ordersService.getOrdersByBatchId(batchId);

      // Update batch status to PROCESSING
      await this.ordersService.updateBatchStatus(
        batchId,
        BatchStatus.PROCESSING,
      );

      this.logger.log(
        `Starting to process ${pendingOrders.length} orders from batch ${batchId}`,
      );

      // Process each order
      let completedCount = 0;
      let failedCount = 0;

      for (const order of pendingOrders.filter(
        (o) => o.status === OrderStatus.PENDING,
      )) {
        try {
          await this.processOrder(order.id);
          completedCount++;
        } catch (error) {
          failedCount++;
          this.logger.error(
            `Failed to process order ${order.id} in batch ${batchId}: ${error.message}`,
            error.stack,
          );
        }

        // Wait a short time between orders to avoid blockchain rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Update batch completion status
      const allOrders = await this.ordersService.getOrdersByBatchId(batchId);
      const remainingPending = allOrders.filter(
        (o) => o.status === OrderStatus.PENDING,
      ).length;

      if (remainingPending === 0) {
        const isCompleted = allOrders.every(
          (o) => o.status === OrderStatus.COMPLETED,
        );

        if (isCompleted) {
          await this.ordersService.updateBatchStatus(
            batchId,
            BatchStatus.COMPLETED,
          );
          this.logger.log(`Batch ${batchId} completed successfully`);
        } else {
          await this.ordersService.updateBatchStatus(
            batchId,
            BatchStatus.FAILED,
          );
          this.logger.warn(`Batch ${batchId} completed with some failures`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing batch ${batchId}: ${error.message}`,
        error.stack,
      );
      await this.ordersService
        .updateBatchStatus(batchId, BatchStatus.FAILED)
        .catch(() => {});
      throw error;
    }
  }

  async processTransaction(
    receipt: ethers.TransactionReceipt | null,
    orderId: string,
    worker: Worker,
  ) {
    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }

    const mintLog = receipt.logs.find(
      (log) => log.address.toLowerCase() === this.contractAddress.toLowerCase(),
    );

    if (!mintLog) {
      throw new Error('Mint log not found in transaction receipt');
    }

    const parsedLog = this.contract.interface.parseLog(mintLog);
    const tokenId = parsedLog?.args[0].toString();

    if (!tokenId) {
      throw new Error('Failed to parse token ID from mint log');
    }

    await this.ordersService.completeOrder(orderId, receipt.hash, tokenId);
    await this.walletsService.trackSuccessfulMint(
      worker.id,
      receipt.gasUsed.toString(),
    );
  }
}
