import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JsonRpcProvider,
  Transaction,
  Wallet,
  formatEther,
  parseEther,
  recoverAddress,
  keccak256,
} from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerStatus, Worker } from '@prisma/client';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';
import Redis from 'ioredis';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly kmsClient: KMSClient;
  private readonly provider: JsonRpcProvider;
  private readonly redis: Redis;
  private readonly workerLockTTL: number = 60; // Lock expires after 60 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Initialize KMS client
    this.kmsClient = new KMSClient({
      region: this.configService.get<string>('AWS_REGION', 'ap-southeast-1'),
    });

    // Initialize blockchain provider
    const rpcUrl = this.configService.get<string>('NEXT_PUBLIC_RPC_URL');
    const chainId = parseInt(
      this.configService.get<string>('NEXT_PUBLIC_ALLOWED_CHAIN_ID', '2021'),
      10,
    );
    const chainName = this.configService.get<string>(
      'NEXT_PUBLIC_NAME_OF_CHAIN',
      'saigon',
    );

    this.provider = new JsonRpcProvider(rpcUrl, {
      chainId,
      name: chainName,
    });

    // Initialize Redis client
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(this.configService.get<string>('REDIS_PORT', '6379')),
      password: this.configService.get<string>('REDIS_PASSWORD', ''),
    });
  }

  async createWallet() {
    try {
      const wallet = Wallet.createRandom();
      const worker = await this.prisma.worker.create({
        data: {
          address: wallet.address,
          keyReference: wallet.privateKey,
          status: 'AVAILABLE',
        },
      });

      return {
        address: worker.address,
        status: worker.status,
      };
    } catch (error) {
      this.logger.error('Error creating wallet:', error);
      throw error;
    }
  }

  async getWalletBalance(address: string) {
    try {
      const balance = await this.provider.getBalance(address);
      return balance.toString();
    } catch (error) {
      this.logger.error(`Error getting balance for ${address}:`, error);
      throw error;
    }
  }

  async getAvailableWorker(): Promise<Worker> {
    // Get workers with AVAILABLE status
    const workers = await this.prisma.worker.findMany({
      where: { status: WorkerStatus.AVAILABLE },
      orderBy: { updatedAt: 'asc' },
    });

    if (!workers.length) {
      throw new Error('No available workers found');
    }

    // Try to acquire lock for each worker
    for (const worker of workers) {
      const lockKey = `worker-lock:${worker.id}`;

      // Try to set the lock with NX option (only set if key doesn't exist)
      const acquired = await this.redis.set(
        lockKey,
        'locked',
        'EX',
        this.workerLockTTL,
        'NX',
      );

      if (acquired === 'OK') {
        try {
          // Mark worker as busy in DB
          await this.prisma.worker.update({
            where: { id: worker.id },
            data: { status: WorkerStatus.BUSY },
          });

          this.logger.log(`Acquired worker ${worker.id} with Redis lock`);
          return worker;
        } catch (error) {
          // If DB update fails, release the Redis lock
          await this.redis.del(lockKey);
          throw error;
        }
      }
    }

    throw new Error('Failed to acquire worker lock, all workers are busy');
  }

  async releaseWorker(workerId: string, data?: Partial<Worker>): Promise<void> {
    const lockKey = `worker-lock:${workerId}`;

    // Release Redis lock
    await this.redis.del(lockKey);

    const updateData: any = {
      status: WorkerStatus.AVAILABLE,
      ...data,
    };

    // Update worker status in DB
    await this.prisma.worker.update({
      where: { id: workerId },
      data: updateData,
    });

    this.logger.log(`Released worker ${workerId}`);
  }

  async getWorkerById(id: string): Promise<Worker | null> {
    return this.prisma.worker.findUnique({
      where: { id },
    });
  }

  async incrementNonce(workerId: string): Promise<void> {
    await this.prisma.worker.update({
      where: { id: workerId },
      data: {
        nonce: { increment: 1 },
      },
    });
  }

  async trackSuccessfulMint(workerId: string, gasUsed: string): Promise<void> {
    const worker = await this.prisma.worker.findUnique({
      where: { id: workerId },
      select: { totalGasUsed: true },
    });

    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    const totalGasUsedBigInt = BigInt(worker.totalGasUsed || '0');
    const gasUsedBigInt = BigInt(gasUsed);
    const newTotalGasUsed = (totalGasUsedBigInt + gasUsedBigInt).toString();

    await this.prisma.worker.update({
      where: { id: workerId },
      data: {
        successfulTransactions: { increment: 1 },
        totalMinted: { increment: 1 },
        totalGasUsed: newTotalGasUsed,
      },
    });
  }

  async trackFailedMint(workerId: string): Promise<void> {
    await this.prisma.worker.update({
      where: { id: workerId },
      data: {
        failedTransactions: { increment: 1 },
      },
    });
  }

  async updateBalance(workerId: string, balance: string): Promise<void> {
    await this.prisma.worker.update({
      where: { id: workerId },
      data: {
        balance,
      },
    });
  }

  async signTransaction(worker: Worker, tx: string): Promise<string> {
    const unsignedTx = Transaction.from(tx);
    const txHash = keccak256(unsignedTx.unsignedSerialized);

    const workerWallet = new Wallet(worker.keyReference, this.provider);
    const signedTx = await workerWallet.signTransaction(unsignedTx);

    const message = `Successfully signed transaction for worker ${worker.address}`;
    this.logger.log(message);

    return signedTx;
  }

  async getAllWorkers(): Promise<Worker[]> {
    return this.prisma.worker.findMany();
  }

  private async getAddressFromKeyReference(
    keyReference: string,
  ): Promise<string> {
    // In a real implementation, you would derive the ETH address from the KMS key's public key
    // For demonstration purposes, we'll generate a random address
    // TODO: Implement actual derivation of ETH address from KMS public key
    return Wallet.createRandom().address;
  }

  async fundWorker(workerAddress: string): Promise<string> {
    const topUpAmount = parseEther('1'); // 1 ETH
    const masterWalletKeyId = this.configService.get<string>(
      'MASTER_WALLET_KMS_KEY_ID',
    );
    const masterWalletAddress = this.configService.get<string>(
      'MASTER_WALLET_ADDRESS',
    );

    if (!masterWalletKeyId || !masterWalletAddress) {
      throw new Error('Master wallet configuration not found');
    }

    try {
      this.logger.log(
        `Funding worker ${workerAddress} with ${formatEther(
          topUpAmount,
        )} ETH...`,
      );

      // Get current nonce for master wallet
      const nonce =
        await this.provider.getTransactionCount(masterWalletAddress);

      // Get current gas price with a buffer
      const gasPrice = await this.provider.getFeeData();
      const maxFeePerGas = gasPrice.maxFeePerGas
        ? (gasPrice.maxFeePerGas * BigInt(12)) / BigInt(10) // Add 20% buffer
        : undefined;
      const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas
        ? (gasPrice.maxPriorityFeePerGas * BigInt(12)) / BigInt(10) // Add 20% buffer
        : undefined;

      // Create transaction
      const tx = {
        to: workerAddress,
        value: topUpAmount,
        nonce,
        chainId: (await this.provider.getNetwork()).chainId,
        maxFeePerGas,
        maxPriorityFeePerGas,
        type: 2, // EIP-1559
      };

      // Create a transaction object
      const unsignedTx = Transaction.from(tx);
      const txHash = keccak256(unsignedTx.unsignedSerialized);

      // Sign transaction with KMS
      const response = await this.kmsClient.send(
        new SignCommand({
          KeyId: masterWalletKeyId,
          Message: Buffer.from(txHash.slice(2), 'hex'),
          MessageType: 'DIGEST',
          SigningAlgorithm: 'ECDSA_SHA_256',
        }),
      );

      const signature = response.Signature
        ? Buffer.from(response.Signature).toString('hex')
        : null;
      if (!signature) {
        throw new Error('Failed to sign transaction with KMS');
      }

      const r = `0x${signature.slice(0, 64)}`;
      const s = `0x${signature.slice(64, 128)}`;

      // Calculate v (recovery parameter)
      let v = 0;
      for (let i = 0; i < 2; i++) {
        try {
          const addr = recoverAddress(txHash, { r, s, v: i });
          if (addr.toLowerCase() === masterWalletAddress.toLowerCase()) {
            v = i;
            break;
          }
        } catch (e) {
          // Try next v value
        }
      }

      // Create signed transaction with signature
      const signedTx = Transaction.from({
        ...tx,
        signature: { r, s, v },
      });

      // Send transaction
      const txResponse = await this.provider.broadcastTransaction(
        signedTx.serialized,
      );

      // Wait for transaction confirmation
      const receipt = await txResponse.wait();

      const message = `Successfully funded worker ${workerAddress} with ${formatEther(
        topUpAmount,
      )} ETH. Transaction hash: ${receipt?.hash}`;
      this.logger.log(message);

      return receipt?.hash || txResponse.hash;
    } catch (error) {
      const errorMessage = `Failed to fund worker ${workerAddress}: ${error.message}`;
      this.logger.error(errorMessage, error.stack);
      throw error;
    }
  }
}
