import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { OrdersService } from '../../orders/orders.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private readonly maxRetries: number;
  private readonly initialDelay: number;

  constructor(
    @InjectQueue('retry-queue') private retryQueue: Queue,
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
  ) {
    this.maxRetries = this.configService.get<number>('MAX_RETRIES', 3);
    this.initialDelay = this.configService.get<number>(
      'RETRY_INITIAL_DELAY_MS',
      60000,
    ); // 1 minute
  }

  async addToRetryQueue(orderId: string, error: string, currentRetryCount = 0) {
    try {
      if (currentRetryCount >= this.maxRetries) {
        // If max retries reached, mark as permanently failed
        await this.ordersService.updateOrderStatus(
          orderId,
          OrderStatus.FAILED,
          {
            errorMessage: `Max retries (${this.maxRetries}) reached. Last error: ${error}`,
          },
        );
        return;
      }

      // Calculate delay with exponential backoff
      const delay = this.initialDelay * Math.pow(2, currentRetryCount);

      // Add to retry queue with delay
      await this.retryQueue.add(
        'retry-mint',
        {
          orderId,
          retryCount: currentRetryCount + 1,
          lastError: error,
        },
        {
          delay,
          attempts: 1, // Each retry is a new job
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      // Update order status to RETRY
      await this.ordersService.updateOrderStatus(
        orderId,
        'RETRY' as OrderStatus,
        {
          errorMessage: `Scheduled for retry ${currentRetryCount + 1}/${this.maxRetries}. Last error: ${error}`,
        },
      );

      this.logger.log(
        `Order ${orderId} scheduled for retry ${currentRetryCount + 1}/${this.maxRetries} in ${delay}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule retry for order ${orderId}:`,
        error,
      );
      throw error;
    }
  }

  async handleRetry(orderId: string, retryCount: number) {
    try {
      // Get order details
      const order = await this.ordersService.getOrderById(orderId);

      // Update status to PENDING for reprocessing
      await this.ordersService.updateOrderStatus(orderId, OrderStatus.PENDING);

      // Add back to main processing queue
      // This will be implemented in the queue service
      // await this.queueService.addMintJob(orderId);

      this.logger.log(
        `Retry ${retryCount}/${this.maxRetries} initiated for order ${orderId}`,
      );
    } catch (error) {
      this.logger.error(`Retry failed for order ${orderId}:`, error);
      // If retry handling fails, schedule another retry
      await this.addToRetryQueue(orderId, error.message, retryCount);
    }
  }
}
