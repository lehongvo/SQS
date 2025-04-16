import { OrdersService } from '../orders/orders.service';
export declare class BatchProcessingService {
    private readonly ordersService;
    private readonly logger;
    constructor(ordersService: OrdersService);
    processPendingOrders(): Promise<void>;
}
