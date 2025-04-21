import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WalletsService } from '../../wallets/wallets.service';
import { OrdersService } from '../../orders/orders.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class FundService {
  private readonly logger = new Logger(FundService.name);

  constructor(
    @InjectQueue('fund-queue') private readonly fundQueue: Queue,
    private readonly walletsService: WalletsService,
    private readonly ordersService: OrdersService,
  ) {}

  async addFundRequest(
    orderId: string,
    accountId: string,
    estimatedGas: string,
  ): Promise<string> {
    try {
      const job = await this.fundQueue.add(
        'fund-account',
        {
          orderId,
          accountId,
          estimatedGas,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          timeout: 120000, // 2 minutes timeout
        },
      );

      this.logger.log(
        `Added fund request job ${job.id} for account ${accountId} (order: ${orderId})`,
      );

      // Update order status to PENDING - for now we use PENDING since PENDING_FUND is not available
      await this.ordersService.updateOrderStatus(orderId, OrderStatus.PENDING, {
        errorMessage: 'Waiting for account funding',
      });

      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Error adding fund request to queue: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async checkFundingStatus(jobId: string): Promise<any> {
    try {
      const job = await this.fundQueue.getJob(jobId);
      if (!job) {
        return { status: 'unknown', message: 'Job not found' };
      }

      const state = await job.getState();
      return {
        id: job.id,
        status: state,
        data: job.data,
        progress: job.progress(),
        attemptsMade: job.attemptsMade,
      };
    } catch (error) {
      this.logger.error(
        `Error checking fund request status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
