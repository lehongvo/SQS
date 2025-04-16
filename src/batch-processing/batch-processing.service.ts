import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { v4 as uuidv4 } from 'uuid';
import { OrderStatus } from '../orders/interfaces/order.interface';

@Injectable()
export class BatchProcessingService {
  private readonly logger = new Logger(BatchProcessingService.name);

  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Cron job runs every minute to check for pending orders
   * and queue them for processing in batches
   */
  @Cron('0 * * * * *') // Run every minute
  async processPendingOrders() {
    this.logger.log('Checking for pending orders to batch process...');

    try {
      // Get pending orders (max 100)
      const pendingOrders = await this.ordersService.findPendingOrders(100);

      if (pendingOrders.length === 0) {
        this.logger.debug('No pending orders found');
        return;
      }

      this.logger.log(`Found ${pendingOrders.length} pending orders`);

      // Create a batch ID
      const batchId = uuidv4();

      // Get order IDs
      const orderIds = pendingOrders.map((order) => order.id);

      // Update all orders to PROCESSING
      for (const orderId of orderIds) {
        await this.ordersService.updateOrderStatus(orderId, OrderStatus.PROCESSING, { batchId });
      }

      this.logger.log(
        `Queued batch ${batchId} with ${orderIds.length} orders for processing`,
      );
    } catch (error) {
      this.logger.error('Error processing pending orders', error.stack);
    }
  }
}
