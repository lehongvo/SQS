import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { Worker } from './interfaces/worker.interface';
export declare class WalletsService {
    private readonly configService;
    private readonly logger;
    private readonly ddbClient;
    private readonly ddbDocClient;
    private readonly kmsClient;
    private readonly tableName;
    constructor(configService: ConfigService);
    create(kmsKeyId: string): Promise<Worker>;
    getAvailableWorker(): Promise<Worker>;
    releaseWorker(workerId: string, data?: Partial<Worker>): Promise<void>;
    getWorkerById(id: string): Promise<Worker | null>;
    incrementNonce(workerId: string): Promise<void>;
    trackSuccessfulMint(workerId: string, gasUsed: string): Promise<void>;
    trackFailedMint(workerId: string): Promise<void>;
    updateBalance(workerId: string, balance: string): Promise<void>;
    signTransaction(worker: Worker, transaction: ethers.Transaction): Promise<string>;
}
