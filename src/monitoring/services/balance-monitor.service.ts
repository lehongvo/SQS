import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Wallet } from 'ethers';
import { PrismaService } from '../../prisma/prisma.service';
import { Account } from '@prisma/client';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class BalanceMonitorService {
  private readonly logger = new Logger(BalanceMonitorService.name);
  private readonly minBalance: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: JsonRpcProvider,
    private readonly configService: ConfigService,
  ) {
    this.minBalance = this.configService.get<number>(
      'ACCOUNT_MIN_BALANCE',
      0.1,
    );
  }

  @Cron('*/5 * * * *') // Run every 5 minutes
  async checkBalances() {
    this.logger.log('Starting balance check for all accounts...');

    try {
      const accounts = await this.prisma.account.findMany({
        where: {
          status: {
            not: 'DISABLED',
          },
        },
      });

      for (const account of accounts) {
        try {
          const balance = await this.provider.getBalance(account.address);
          const balanceInEth = balance.toString();

          if (balanceInEth !== account.balance) {
            this.logger.log(
              `Balance changed for account ${account.address}: ${account.balance} -> ${balanceInEth}`,
            );

            await this.prisma.account.update({
              where: { id: account.id },
              data: {
                balance: balanceInEth,
              },
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to check balance for account ${account.address}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log('Balance check completed');
    } catch (error) {
      this.logger.error(
        `Failed to check balances: ${error.message}`,
        error.stack,
      );
    }
  }

  async monitorWorkerBalances() {
    try {
      const accounts = await this.prisma.account.findMany({
        where: {
          status: {
            not: 'DISABLED',
          },
        },
      });

      for (const account of accounts) {
        await this.checkWorkerBalance(account);
      }
    } catch (error) {
      this.logger.error(
        `Failed to monitor account balances: ${error.message}`,
        error.stack,
      );
    }
  }

  private async checkWorkerBalance(account: Account) {
    try {
      const balance = await this.provider.getBalance(account.address);
      const balanceInEth = Number(balance) / 1e18;

      if (balanceInEth < this.minBalance) {
        this.logger.warn(
          `Account ${account.address} balance (${balanceInEth} ETH) is below minimum (${this.minBalance} ETH)`,
        );
        await this.topUpWorker(account, balanceInEth);
      }

      await this.prisma.account.update({
        where: { id: account.id },
        data: {
          balance: balance.toString(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to check balance for account ${account.address}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async topUpWorker(account: Account, currentBalance: number) {
    try {
      const privateKey = this.configService.get<string>('PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('PRIVATE_KEY not configured');
      }

      const wallet = new Wallet(privateKey, this.provider);
      const topUpAmount = this.minBalance - currentBalance + 0.01; // Add 0.01 ETH buffer

      const tx = await wallet.sendTransaction({
        to: account.address,
        value: BigInt(Math.floor(topUpAmount * 1e18)),
      });

      this.logger.log(
        `Topping up account ${account.address} with ${topUpAmount} ETH (tx: ${tx.hash})`,
      );

      await tx.wait();
      this.logger.log(`Top-up transaction confirmed: ${tx.hash}`);
    } catch (error) {
      this.logger.error(
        `Failed to top up account ${account.address}: ${error.message}`,
        error.stack,
      );
    }
  }
}
