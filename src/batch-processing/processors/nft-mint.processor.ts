import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, BatchStatus, Account } from '@prisma/client';
import { ethers } from 'ethers';
import { OrdersService } from '../../orders/orders.service';
import { WalletsService } from '../../wallets/wallets.service';
import { BatchProcessingService } from '../batch-processing.service';
import { MINT_NFT_ABI } from '../../utils/abi';
import { JsonRpcProvider, Transaction, formatEther, parseEther } from 'ethers';
import { RetryService } from '../../queue/services/retry.service';
import { AccountsService } from '../../accounts/accounts.service';
import { FundService } from '../../fund/services/fund.service';

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
    private readonly retryService: RetryService,
    private readonly accountsService: AccountsService,
    private readonly fundService: FundService,
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

      // Check for orders waiting for funding (using errorMessage as temporary solution)
      if (
        order.status === OrderStatus.PENDING &&
        order.errorMessage?.includes('Waiting for account funding')
      ) {
        this.logger.log(`Order ${orderId} is waiting for funding to complete.`);
        return;
      }

      if (order.status !== OrderStatus.PENDING) {
        this.logger.warn(
          `Order ${orderId} is not in PENDING status. Current status: ${order.status}`,
        );
        return;
      }

      // Get an available account
      const account = await this.accountsService.getAvailableAccount();
      this.logger.log(
        `Using account ${account.id} (${account.address}) to process order ${orderId}`,
      );

      // Assign account to order
      await this.ordersService.assignAccountToOrder(orderId, account.id);

      try {
        // Get worker's current nonce
        const nonce = await this.provider.getTransactionCount(account.address);

        // Check if nonce from blockchain is different from stored nonce
        if (nonce !== account.nonce) {
          this.logger.warn(
            `Account ${account.id} nonce discrepancy: stored=${account.nonce}, onchain=${nonce}. Using onchain value.`,
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
            from: account.address,
          });

        // Add 20% buffer to gas limit
        const gasLimitWithBuffer = (gasLimit * BigInt(12)) / BigInt(10);

        // Calculate total gas cost estimation
        const gasCost =
          gasLimitWithBuffer *
          (maxFeePerGas || gasPrice.gasPrice || parseEther('0.000000001'));

        // Check account balance
        const accountBalance = await this.provider.getBalance(account.address);

        // If balance is less than required gas cost plus buffer
        const requiredBalance = gasCost + parseEther('0.01'); // Add 0.01 ETH as buffer

        if (accountBalance < requiredBalance) {
          this.logger.warn(
            `Account ${account.id} has insufficient balance: ${formatEther(accountBalance)} ETH, ` +
              `needed ~${formatEther(requiredBalance)} ETH`,
          );

          // Release the account first
          await this.accountsService.releaseAccount(account.id);

          // Add fund request to queue
          await this.fundService.addFundRequest(
            orderId,
            account.id,
            requiredBalance.toString(),
          );

          this.logger.log(
            `Added fund request for account ${account.id} (order: ${orderId}). ` +
              `Order waiting for funding.`,
          );
          return;
        }

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

        // Update order status to PROCESSING
        await this.ordersService.updateOrderStatus(
          orderId,
          OrderStatus.PROCESSING,
        );

        // Sign transaction with account wallet
        const signedTx = await this.walletsService.signTransaction(
          account,
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

        await this.processTransaction(receipt, orderId, account);

        // Release account
        await this.accountsService.releaseAccount(account.id);
      } catch (error) {
        this.logger.error(
          `Error processing order ${orderId}: ${error.message}`,
          error.stack,
        );

        // Add to retry queue instead of marking as failed immediately
        await this.retryService.addToRetryQueue(orderId, error.message);

        // Update account stats for failed transaction
        await this.accountsService.trackFailedMint(account.id);

        // Update batch stats if this order is part of a batch
        if (order.batchId) {
          await this.batchService.incrementFailedOrders(order.batchId);
        }

        // Release account
        await this.accountsService.releaseAccount(account.id);

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
    account: Account,
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
      account.id,
      receipt.gasUsed.toString(),
    );
  }
}
