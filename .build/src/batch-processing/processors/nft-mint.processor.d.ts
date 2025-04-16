import { OrdersService } from '../../orders/orders.service';
import { WalletsService } from '../../wallets/wallets.service';
export declare class NftMintProcessor {
    private readonly ordersService;
    private readonly walletsService;
    private readonly logger;
    constructor(ordersService: OrdersService, walletsService: WalletsService);
    processBatch(batchId: string, orderIds: string[]): Promise<void>;
    private processIndividualOrder;
    private uploadToIPFS;
    private getWorker;
    private releaseWorker;
}
