import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { Account, AccountStatus } from '@prisma/client';

@Injectable()
export class AccountsService implements OnModuleInit {
  private readonly logger = new Logger(AccountsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // When the module initializes, check if we need to create accounts
    await this.initializeAccounts();
  }

  async initializeAccounts() {
    try {
      // Check existing accounts
      const existingAccounts = await this.prisma.account.findMany();
      this.logger.log(`Found ${existingAccounts.length} existing accounts`);

      // Create accounts until we have 10
      const accountsToCreate = Math.max(0, 10 - existingAccounts.length);
      if (accountsToCreate > 0) {
        this.logger.log(`Creating ${accountsToCreate} new accounts...`);

        for (let i = 0; i < accountsToCreate; i++) {
          const wallet = ethers.Wallet.createRandom();
          const accountId = uuidv4();

          await this.prisma.account.create({
            data: {
              id: accountId,
              address: wallet.address,
              keyReference: wallet.privateKey, // Note: In production, use KMS instead
              status: 'AVAILABLE',
              nonce: 0,
              balance: '0',
              totalMinted: 0,
              failedTransactions: 0,
              successfulTransactions: 0,
              totalGasUsed: '0',
            },
          });

          this.logger.log(
            `Created account ${i + 1}/${accountsToCreate}: ${wallet.address}`,
          );
        }

        this.logger.log(
          `Successfully initialized ${accountsToCreate} new accounts`,
        );
      } else {
        this.logger.log(
          'Account initialization not needed, already have enough accounts',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize accounts: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAccount(address: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { address },
    });
  }

  async getAccountsByStatus(status: AccountStatus): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { status },
    });
  }

  async getAvailableAccount(): Promise<Account> {
    const availableAccounts = await this.getAccountsByStatus('AVAILABLE');
    if (!availableAccounts || availableAccounts.length === 0) {
      throw new Error('No available accounts found');
    }

    // Get the first available account
    const account = availableAccounts[0];

    // Update the account status to BUSY
    await this.updateAccountStatus(account.id, 'BUSY');

    return account;
  }

  async releaseAccount(accountId: string): Promise<void> {
    await this.updateAccountStatus(accountId, 'AVAILABLE');
  }

  async trackFailedMint(accountId: string): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        failedTransactions: {
          increment: 1,
        },
      },
    });
  }

  private async updateAccountStatus(
    accountId: string,
    status: AccountStatus,
  ): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        status,
      },
    });
  }
}
