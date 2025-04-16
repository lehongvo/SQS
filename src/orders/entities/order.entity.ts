import { OrderStatus } from '../interfaces/order.interface';

export class Order {
  id: string;
  name: string;
  description: string;
  image: string;
  mintToAddress: string;
  attributes?: Record<string, any>[];
  status: OrderStatus;
  transactionHash?: string;
  tokenId?: string;
  errorMessage?: string;
  batchId?: string;
  createdAt: string;
  updatedAt: string;
}
