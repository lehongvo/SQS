import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { WalletsService } from '../../wallets/wallets.service';
import { OrdersService } from '../../orders/orders.service';

@Injectable()
@Processor('fund-queue')
export class FundProcessor {
  private readonly logger = new Logger(FundProcessor.name);

  constructor(
    private readonly walletsService: WalletsService,
    private readonly ordersService: OrdersService,
  ) {}

  @Process('fund-account')
  async processFundRequest(job: Job) {
    try {
      const { orderId, accountId, estimatedGas } = job.data;

      this.logger.log(
        `Processing fund request for account ${accountId} (order: ${orderId})`,
      );

      // Get account details
      const account = await this.walletsService.getWorkerById(accountId);
      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      // Fund the account with enough ETH for the transaction
      job.progress(25);
      this.logger.log(
        `Funding account ${accountId} (${account.address}) with estimated gas needed: ${estimatedGas}`,
      );

      const txHash = await this.walletsService.fundWorker(account.address);

      job.progress(75);
      this.logger.log(
        `Account ${accountId} funded successfully. Transaction hash: ${txHash}`,
      );

      // Update account balance
      const newBalance = await this.walletsService.getWalletBalance(
        account.address,
      );
      await this.walletsService.updateBalance(accountId, newBalance);

      // Update order status back to PENDING to continue processing
      await this.ordersService.updateOrderStatus(orderId, 'PENDING');

      job.progress(100);
      this.logger.log(
        `Fund request completed for account ${accountId} (order: ${orderId})`,
      );

      return { success: true, transactionHash: txHash };
    } catch (error) {
      this.logger.error(
        `Error processing fund request: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
