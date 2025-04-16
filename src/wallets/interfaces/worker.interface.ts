export enum WorkerStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  DISABLED = 'DISABLED',
}

export interface Worker {
  id: string;
  address: string;
  kmsKeyId: string;
  status: WorkerStatus;
  nonce: number;
  balance: string; // BigNumber as string
  totalMinted: number;
  failedTransactions: number;
  successfulTransactions: number;
  totalGasUsed: string; // BigNumber as string
  createdAt: string;
  updatedAt: string;
}
