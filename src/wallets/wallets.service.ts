import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  JsonRpcProvider,
  Wallet,
  TransactionRequest,
  TransactionResponse,
} from 'ethers';
import { Account, AccountStatus } from '@prisma/client';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly provider: JsonRpcProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const rpcUrl = this.configService.get<string>('NEXT_PUBLIC_RPC_URL');
    this.provider = new JsonRpcProvider(rpcUrl);
  }

  async createWallet(): Promise<Account> {
    try {
      const wallet = Wallet.createRandom();
      const account = await this.prisma.account.create({
        data: {
          address: wallet.address,
          keyReference: wallet.privateKey,
          status: 'AVAILABLE',
          balance: '0',
          nonce: 0,
          totalMinted: 0,
          failedTransactions: 0,
          successfulTransactions: 0,
          totalGasUsed: '0',
        },
      });

      this.logger.log(`Created new account: ${account.address}`);
      return account;
    } catch (error) {
      this.logger.error(
        `Failed to create account: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getWalletByAddress(address: string): Promise<Account | null> {
    try {
      return await this.prisma.account.findUnique({
        where: { address },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get account by address ${address}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getWalletById(id: string): Promise<Account | null> {
    try {
      return await this.prisma.account.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get account by ID ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateWalletStatus(
    id: string,
    status: AccountStatus,
  ): Promise<Account> {
    try {
      return await this.prisma.account.update({
        where: { id },
        data: { status },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update account ${id} status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAvailableWallet(): Promise<Account | null> {
    try {
      return await this.prisma.account.findFirst({
        where: {
          status: 'AVAILABLE',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get available account: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async sendTransaction(
    accountId: string,
    txRequest: TransactionRequest,
  ): Promise<TransactionResponse> {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      const wallet = new Wallet(account.keyReference, this.provider);
      const tx = await wallet.sendTransaction(txRequest);
      await tx.wait();

      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to send transaction from account ${accountId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getBalance(accountId: string): Promise<bigint> {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      const balance = await this.provider.getBalance(account.address);
      await this.prisma.account.update({
        where: { id: accountId },
        data: { balance: balance.toString() },
      });

      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to get balance for account ${accountId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateWalletNonce(accountId: string, nonce: number): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { nonce },
    });
  }

  async trackFailedTransaction(accountId: string): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        failedTransactions: {
          increment: 1,
        },
      },
    });
  }

  async trackSuccessfulTransaction(
    accountId: string,
    gasUsed: bigint,
  ): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        successfulTransactions: {
          increment: 1,
        },
        totalGasUsed: (BigInt(gasUsed) + BigInt(0)).toString(),
      },
    });
  }
}
