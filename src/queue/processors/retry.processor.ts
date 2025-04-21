import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { RetryService } from '../services/retry.service';

@Processor('retry-queue')
export class RetryProcessor {
  private readonly logger = new Logger(RetryProcessor.name);

  constructor(private readonly retryService: RetryService) {}

  @Process('retry-mint')
  async handleRetry(job: Job) {
    const { orderId, retryCount } = job.data;

    this.logger.log(`Processing retry ${retryCount} for order ${orderId}`);

    try {
      await this.retryService.handleRetry(orderId, retryCount);
    } catch (error) {
      this.logger.error(`Failed to process retry for order ${orderId}:`, error);
      throw error; // Let Bull handle the retry
    }
  }
}
