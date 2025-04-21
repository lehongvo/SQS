import { Injectable, Logger } from '@nestjs/common';
import { BatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Batch } from './entities/batch.entity';

@Injectable()
export class BatchProcessingService {
  private readonly logger = new Logger(BatchProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createBatch(): Promise<Batch> {
    try {
      const batch = await this.prisma.batch.create({
        data: {
          status: BatchStatus.PENDING,
          totalOrders: 0,
          completedOrders: 0,
          failedOrders: 0,
        },
      });

      this.logger.log(`Created new batch ${batch.id}`);
      return batch;
    } catch (error) {
      this.logger.error(
        `Failed to create batch: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getBatchById(id: string): Promise<Batch | null> {
    try {
      return await this.prisma.batch.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get batch ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async addOrderToBatch(batchId: string): Promise<void> {
    try {
      await this.prisma.batch.update({
        where: { id: batchId },
        data: {
          totalOrders: {
            increment: 1,
          },
        },
      });

      this.logger.log(`Added order to batch ${batchId}`);
    } catch (error) {
      this.logger.error(
        `Failed to add order to batch ${batchId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateBatchStatus(batchId: string, status: BatchStatus): Promise<void> {
    try {
      const updateData: Prisma.BatchUpdateInput = { status };

      // If the batch is completed or failed, set the completedAt date
      if (status === BatchStatus.COMPLETED || status === BatchStatus.FAILED) {
        updateData.completedAt = new Date();
      }

      await this.prisma.batch.update({
        where: { id: batchId },
        data: updateData,
      });

      this.logger.log(`Updated batch ${batchId} status to ${status}`);
    } catch (error) {
      this.logger.error(
        `Failed to update batch ${batchId} status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async incrementCompletedOrders(batchId: string): Promise<void> {
    try {
      const batch = await this.prisma.batch.update({
        where: { id: batchId },
        data: {
          completedOrders: {
            increment: 1,
          },
        },
      });

      // Check if all orders are processed
      if (batch.completedOrders + batch.failedOrders === batch.totalOrders) {
        // If all orders are completed, mark batch as COMPLETED
        if (batch.failedOrders === 0) {
          await this.updateBatchStatus(batchId, BatchStatus.COMPLETED);
        }
        // If there are some failed orders, mark the batch as FAILED
        else {
          await this.updateBatchStatus(batchId, BatchStatus.FAILED);
        }
      }

      this.logger.log(`Incremented completed orders for batch ${batchId}`);
    } catch (error) {
      this.logger.error(
        `Failed to increment completed orders for batch ${batchId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async incrementFailedOrders(batchId: string): Promise<void> {
    try {
      const batch = await this.prisma.batch.update({
        where: { id: batchId },
        data: {
          failedOrders: {
            increment: 1,
          },
        },
      });

      // Check if all orders are processed
      if (batch.completedOrders + batch.failedOrders === batch.totalOrders) {
        // If all orders are completed, mark batch as COMPLETED
        if (batch.failedOrders === 0) {
          await this.updateBatchStatus(batchId, BatchStatus.COMPLETED);
        }
        // If there are some failed orders, mark the batch as FAILED
        else {
          await this.updateBatchStatus(batchId, BatchStatus.FAILED);
        }
      }

      this.logger.log(`Incremented failed orders for batch ${batchId}`);
    } catch (error) {
      this.logger.error(
        `Failed to increment failed orders for batch ${batchId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllBatches(): Promise<Batch[]> {
    try {
      return await this.prisma.batch.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get all batches: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
