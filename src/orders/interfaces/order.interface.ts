export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface OrderItem {
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

export interface OrderRequest {
  name: string;
  description: string;
  image: string;
  mintToAddress: string;
  attributes?: Record<string, any>[];
}

export interface OrderBatchRequest {
  orders: OrderRequest[];
}
