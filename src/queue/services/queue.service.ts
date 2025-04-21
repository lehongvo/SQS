import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(@InjectQueue('nft-mint') private readonly nftMintQueue: Queue) {}

  async addMintJob(data: any): Promise<string> {
    try {
      const job = await this.nftMintQueue.add('mint-nft', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        timeout: 180000, // 3 minutes timeout
      });

      this.logger.log(`Added NFT mint job ${job.id} to queue`);
      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Error adding mint job to queue: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async addBatchJob(batchId: string, priority = 10): Promise<string> {
    try {
      const job = await this.nftMintQueue.add(
        'process-batch',
        { batchId },
        {
          attempts: 2,
          priority,
          backoff: {
            type: 'exponential',
            delay: 10000,
          },
          removeOnComplete: true,
          timeout: 600000, // 10 minutes timeout for batch processing
        },
      );

      this.logger.log(
        `Added batch processing job ${job.id} for batch ${batchId} to queue`,
      );
      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Error adding batch job to queue: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getQueueStatus(): Promise<any> {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.nftMintQueue.getWaitingCount(),
        this.nftMintQueue.getActiveCount(),
        this.nftMintQueue.getCompletedCount(),
        this.nftMintQueue.getFailedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        total: waiting + active + completed + failed,
      };
    } catch (error) {
      this.logger.error(
        `Error getting queue status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async clearQueue(): Promise<void> {
    try {
      await this.nftMintQueue.empty();
      this.logger.log('Queue cleared successfully');
    } catch (error) {
      this.logger.error(`Error clearing queue: ${error.message}`, error.stack);
      throw error;
    }
  }
}
