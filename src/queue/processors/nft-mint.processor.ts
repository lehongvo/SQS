import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NftMintProcessor as BatchNftMintProcessor } from '../../batch-processing/processors/nft-mint.processor';

@Injectable()
@Processor('nft-mint')
export class NftMintQueueProcessor {
  private readonly logger = new Logger(NftMintQueueProcessor.name);

  constructor(private readonly nftMintProcessor: BatchNftMintProcessor) {}

  @Process('mint-nft')
  async processMintJob(job: Job<{ orderId: string }>) {
    this.logger.log(
      `Processing mint job ${job.id} for order ${job.data.orderId}`,
    );

    try {
      await this.nftMintProcessor.processOrder(job.data.orderId);
      this.logger.log(
        `Successfully processed mint job ${job.id} for order ${job.data.orderId}`,
      );
      return { success: true, orderId: job.data.orderId };
    } catch (error) {
      this.logger.error(
        `Failed to process mint job ${job.id} for order ${job.data.orderId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('process-batch')
  async processBatchJob(job: Job<{ batchId: string }>) {
    this.logger.log(
      `Processing batch job ${job.id} for batch ${job.data.batchId}`,
    );

    try {
      await this.nftMintProcessor.processBatch(job.data.batchId);
      this.logger.log(
        `Successfully processed batch job ${job.id} for batch ${job.data.batchId}`,
      );
      return { success: true, batchId: job.data.batchId };
    } catch (error) {
      this.logger.error(
        `Failed to process batch job ${job.id} for batch ${job.data.batchId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
