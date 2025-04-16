import { ConfigService } from '@nestjs/config';
import { OrderItem, OrderRequest, OrderStatus } from './interfaces/order.interface';
export declare class OrdersService {
    private readonly configService;
    private readonly logger;
    private readonly ddbClient;
    private readonly ddbDocClient;
    private readonly tableName;
    constructor(configService: ConfigService);
    create(orderRequest: OrderRequest): Promise<OrderItem>;
    batchCreate(orders: OrderRequest[]): Promise<string[]>;
    findById(id: string): Promise<OrderItem | null>;
    findPendingOrders(limit?: number): Promise<OrderItem[]>;
    updateOrderStatus(orderId: string, status: OrderStatus, additionalAttributes?: Partial<OrderItem>): Promise<OrderItem | null>;
    updateBatchStatus(orderIds: string[], status: OrderStatus, batchId: string): Promise<void>;
}
