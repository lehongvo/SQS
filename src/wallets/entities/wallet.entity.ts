export class Wallet {
  id: string;
  address: string;
  privateKey?: string; // Chỉ lưu trong bộ nhớ, không lưu vào database
  status: string;
  nonce: number;
  balance: string;
  totalMinted: number;
  failedTransactions: number;
  successfulTransactions: number;
  totalGasUsed: string;
  createdAt: string;
  updatedAt: string;
}
