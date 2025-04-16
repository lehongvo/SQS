export declare class Wallet {
    id: string;
    address: string;
    privateKey?: string;
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
