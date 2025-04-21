import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { OrderStatus, Prisma, BatchStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.OrderCreateInput) {
    return this.prisma.order.create({
      data,
    });
  }

  async batchCreate(orders: Prisma.OrderCreateManyInput[]) {
    const result = await this.prisma.order.createMany({
      data: orders,
    });
    return result.count;
  }

  async findById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
    });
  }

  async findPendingOrders(limit: number = 10) {
    return this.prisma.order.findMany({
      where: {
        status: 'PENDING',
      },
      take: limit,
    });
  }

  async updateStatus(id: string, status: string, errorMessage?: string) {
    return this.prisma.order.update({
      where: { id },
      data: {
        status: status as any,
        errorMessage,
      },
    });
  }

  async getOrderById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    data: Partial<Prisma.OrderUpdateInput> = {},
  ) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...data,
      },
    });
  }

  async getOrdersByStatus(status: OrderStatus) {
    return this.prisma.order.findMany({
      where: { status },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async createBatch(data: { id: string; totalOrders: number }) {
    return this.prisma.batch.create({
      data: {
        id: data.id,
        totalOrders: data.totalOrders,
        status: BatchStatus.PENDING,
      },
    });
  }

  async createBatchOrder(batchId: string, orderData: Prisma.OrderCreateInput) {
    const { worker, batch, ...orderDataWithoutRelations } = orderData;

    return this.prisma.order.create({
      data: {
        ...orderDataWithoutRelations,
        id: uuidv4(),
        status: OrderStatus.PENDING,
        batch: {
          connect: {
            id: batchId,
          },
        },
      },
    });
  }

  async assignWorkerToOrder(orderId: string, workerId: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        workerId,
        status: OrderStatus.PROCESSING,
      },
    });
  }

  async completeOrder(
    orderId: string,
    transactionHash: string,
    tokenId: string,
  ) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETED,
        transactionHash,
        tokenId,
      },
    });
  }

  async failOrder(orderId: string, errorMessage: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.FAILED,
        errorMessage,
      },
    });
  }

  async getOrdersByBatchId(batchId: string) {
    return this.prisma.order.findMany({
      where: { batchId },
    });
  }

  async getOrderStats() {
    const pendingCount = await this.prisma.order.count({
      where: { status: OrderStatus.PENDING },
    });

    const processingCount = await this.prisma.order.count({
      where: { status: OrderStatus.PROCESSING },
    });

    const completedCount = await this.prisma.order.count({
      where: { status: OrderStatus.COMPLETED },
    });

    const failedCount = await this.prisma.order.count({
      where: { status: OrderStatus.FAILED },
    });

    return {
      pending: pendingCount,
      processing: processingCount,
      completed: completedCount,
      failed: failedCount,
      total: pendingCount + processingCount + completedCount + failedCount,
    };
  }

  async getBatchById(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch with ID ${batchId} not found`);
    }

    return batch;
  }

  async updateBatchStatus(batchId: string, status: BatchStatus) {
    return this.prisma.batch.update({
      where: { id: batchId },
      data: { status },
    });
  }
}
