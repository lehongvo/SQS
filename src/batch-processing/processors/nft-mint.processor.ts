import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ethers } from 'ethers';
import { EZDRM_NFT_CONTRACT_ABI } from '../../utils/abi';
import { DEFAULT_GAS_LIMIT } from '../../utils/constant';
import { OrdersService } from '../../orders/orders.service';
import { WalletsService } from '../../wallets/wallets.service';
import { OrderStatus } from '../../orders/entities/order.entity';
import { MetadataInfo } from '../../utils/contract';
import axios from 'axios';

interface PinataResponse {
  success: boolean;
  urlTransactionHash: string | null;
  message: string;
}

@Processor('nft-minting')
export class NftMintProcessor {
  private readonly logger = new Logger(NftMintProcessor.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly walletsService: WalletsService,
  ) {}

  @Process('process-batch')
  async processBatch(job: Job<{ batchId: string; orderIds: string[] }>) {
    const { batchId, orderIds } = job.data;
    this.logger.log(
      `Processing batch ${batchId} with ${orderIds.length} orders`,
    );

    try {
      // Get available wallet
      const wallet = await this.walletsService.getAvailableWallet();
      this.logger.log(`Using wallet ${wallet.address} for batch ${batchId}`);

      // Get wallet with private key
      const walletWithKey = await this.walletsService.getWalletWithPrivateKey(
        wallet.id,
      );

      // Setup provider and contract
      const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_RPC_URL,
        {
          chainId: parseInt(
            process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021',
            10,
          ),
          name: process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon',
        },
      );

      const ethersWallet = new ethers.Wallet(
        walletWithKey.privateKey,
        provider,
      );
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS!,
        EZDRM_NFT_CONTRACT_ABI,
        ethersWallet,
      );

      // Get current nonce
      const onchainNonce = await provider.getTransactionCount(wallet.address);
      const nonce = Math.max(wallet.nonce, onchainNonce);

      // Process each order in batch sequentially (for ERC-721)
      // If using ERC-1155, you could use batch minting function instead
      let currentNonce = nonce;
      let totalGasUsed = 0;

      for (const orderId of orderIds) {
        try {
          const result = await this.processIndividualOrder(
            orderId,
            contract,
            currentNonce,
            ethersWallet,
            provider,
          );

          if (result.success) {
            totalGasUsed += result.gasUsed || 0;
            currentNonce++;
          }
        } catch (error) {
          this.logger.error(`Error processing order ${orderId}`, error);
          // Continue with next order
        }
      }

      // Update wallet
      await this.walletsService.releaseWallet(wallet.id, {
        nonce: currentNonce,
      });

      this.logger.log(
        `Batch ${batchId} completed. Total gas used: ${totalGasUsed}`,
      );
    } catch (error) {
      this.logger.error(`Error processing batch ${batchId}`, error);
      throw error;
    }
  }

  private async processIndividualOrder(
    orderId: string,
    contract: ethers.Contract,
    nonce: number,
    wallet: ethers.Wallet,
    provider: ethers.JsonRpcProvider,
  ): Promise<{ success: boolean; gasUsed?: number }> {
    try {
      // Get order details
      const order = await this.ordersService.findOrderById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      if (order.status !== OrderStatus.PROCESSING) {
        this.logger.log(
          `Order ${orderId} is not in PROCESSING state, skipping`,
        );
        return { success: false };
      }

      // Prepare metadata
      const metadataInfo: MetadataInfo = {
        name: order.name,
        description: order.description,
        image: order.image,
        attributes: order.attributes,
      };

      // Upload metadata to IPFS
      const metadata = await this.uploadToIPFS(metadataInfo);
      if (!metadata.success || !metadata.urlTransactionHash) {
        throw new Error(
          `Failed to upload metadata to IPFS: ${metadata.message}`,
        );
      }

      // Get current gas prices
      const feeData = await provider.getFeeData();
      if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        throw new Error('Could not get fee data');
      }

      // Mint NFT
      const tx = await contract.safeMint(
        order.mintToAddress,
        metadata.urlTransactionHash,
        {
          gasLimit: DEFAULT_GAS_LIMIT,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          nonce: nonce,
        },
      );

      // Wait for transaction
      const receipt = await tx.wait();

      // Extract token ID from logs
      let tokenId = null;
      for (const log of receipt.logs) {
        try {
          const parsedLog = contract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });

          if (parsedLog && parsedLog.name === 'Transfer') {
            tokenId = parsedLog.args[2].toString();
            break;
          }
        } catch (error) {
          continue;
        }
      }

      // Update order status
      await this.ordersService.updateOrderStatus(
        orderId,
        OrderStatus.COMPLETED,
        {
          transactionHash: tx.hash,
          tokenId: tokenId,
        },
      );

      this.logger.log(
        `Successfully minted NFT for order ${orderId}. Transaction: ${tx.hash}. Token ID: ${tokenId}`,
      );

      return {
        success: true,
        gasUsed: Number(receipt.gasUsed || 0),
      };
    } catch (error) {
      this.logger.error(`Error processing order ${orderId}`, error);

      // Update order status to FAILED
      await this.ordersService.updateOrderStatus(orderId, OrderStatus.FAILED, {
        errorMessage: error.message || 'Unknown error',
      });

      return { success: false };
    }
  }

  private async uploadToIPFS(
    metadataInfo: MetadataInfo,
  ): Promise<PinataResponse> {
    try {
      // Validate environment variables
      const url = process.env.PINATA_URL;
      const JWT = process.env.PINATA_JWT;
      const PINATA_API_KEY = process.env.PINATA_API_KEY;
      const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;
      const PINATA_CLOUD_URL = process.env.PINATA_CLOUD_URL;

      if (
        !url ||
        !JWT ||
        !PINATA_API_KEY ||
        !PINATA_SECRET_API_KEY ||
        !PINATA_CLOUD_URL
      ) {
        console.error('Missing Pinata configuration');
        return {
          success: false,
          urlTransactionHash: null,
          message: 'Missing Pinata configuration in environment variables',
        };
      }

      // Create form data
      const form = new FormData();
      const metadataBlob = new Blob([JSON.stringify(metadataInfo)], {
        type: 'application/json',
      });
      form.append('file', metadataBlob, 'metadata.json');

      // Add pinata options - simplified for speed
      const pinataOptions = JSON.stringify({
        cidVersion: 1,
      });
      form.append('pinataOptions', pinataOptions);

      // Upload to Pinata
      const response = await axios.post(url, form, {
        maxBodyLength: Infinity,
        timeout: 5000,
        headers: {
          'Content-Type': `multipart/form-data`,
          Authorization: `Bearer ${JWT}`,
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
      });

      if (!response.data.IpfsHash) {
        console.error('Pinata response missing IpfsHash:', response.data);
        return {
          success: false,
          urlTransactionHash: null,
          message: 'Failed to get IPFS hash from Pinata',
        };
      }

      const ipfsUrl = `${PINATA_CLOUD_URL}${response.data.IpfsHash}`;
      return {
        success: true,
        urlTransactionHash: ipfsUrl,
        message: 'Metadata pinned successfully to IPFS',
      };
    } catch (error: any) {
      console.error('Error when uploading to Pinata:', {
        message: error.message,
        response: error.response?.data,
      });
      return {
        success: false,
        urlTransactionHash: null,
        message:
          error.response?.data?.error?.details ||
          error.message ||
          'Error uploading to Pinata',
      };
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} of type ${job.name} failed with error: ${error.message}`,
      error.stack,
    );
  }
}
