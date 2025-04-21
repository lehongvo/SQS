import { BatchStatus } from '@prisma/client';

export class Batch {
  id: string;
  status: BatchStatus;
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}
