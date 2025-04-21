import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Transaction, Wallet } from 'ethers';
import { PrismaService } from '../../prisma/prisma.service';
import { Worker } from '@prisma/client';

@Injectable()
export class BalanceMonitorService {
  private readonly logger = new Logger(BalanceMonitorService.name);
  private readonly provider: JsonRpcProvider;
  private readonly minBalance: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const rpcUrl = this.configService.get<string>('NEXT_PUBLIC_RPC_URL');
    this.provider = new JsonRpcProvider(rpcUrl);
    this.minBalance = this.configService.get<number>('WORKER_MIN_BALANCE', 0.1);
  }

  async monitorWorkerBalances() {
    try {
      const workers = await this.prisma.worker.findMany({
        where: {
          status: 'AVAILABLE',
        },
      });

      for (const worker of workers) {
        await this.checkWorkerBalance(worker);
      }
    } catch (error) {
      this.logger.error('Error monitoring worker balances:', error);
      throw error;
    }
  }

  private async checkWorkerBalance(worker: Worker) {
    try {
      const balance = await this.provider.getBalance(worker.address);
      const balanceInEth = Number(balance) / 1e18;

      if (balanceInEth < this.minBalance) {
        await this.topUpWorker(worker, balanceInEth);
      }

      await this.prisma.worker.update({
        where: { id: worker.id },
        data: {
          balance: balance.toString(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Error checking balance for worker ${worker.id}:`,
        error,
      );
      throw error;
    }
  }

  private async topUpWorker(worker: Worker, currentBalance: number) {
    try {
      const privateKey = this.configService.get<string>('PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('PRIVATE_KEY not configured');
      }

      const masterWallet = new Wallet(privateKey, this.provider);

      const topUpAmount = (this.minBalance - currentBalance + 0.1) * 1e18;
      const tx = await masterWallet.sendTransaction({
        to: worker.address,
        value: BigInt(Math.floor(topUpAmount)),
      });

      await tx.wait();

      this.logger.log(
        `Topped up worker ${worker.id} with ${topUpAmount / 1e18} ETH`,
      );
    } catch (error) {
      this.logger.error(`Error topping up worker ${worker.id}:`, error);
      throw error;
    }
  }
}
