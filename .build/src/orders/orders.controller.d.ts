import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { MintNftDto } from '../nft/dto/mint-nft.dto';
import { OrderBatchRequest, OrderStatus } from './interfaces/order.interface';
export declare class OrdersController {
    private readonly ordersService;
    private readonly configService;
    private readonly logger;
    private readonly sqsClient;
    private readonly queueUrl;
    constructor(ordersService: OrdersService, configService: ConfigService);
    createOrder(mintNftDto: MintNftDto): Promise<{
        success: boolean;
        data: {
            orderId: string;
            status: OrderStatus;
        };
        message: string;
    }>;
    createBatchOrders(batchRequest: OrderBatchRequest): Promise<{
        success: boolean;
        data: {
            orderIds: string[];
            count: number;
        };
        message: string;
    }>;
    getOrder(id: string): Promise<{
        success: boolean;
        data: import("./interfaces/order.interface").OrderItem;
    }>;
    getPendingOrders(limit?: number): Promise<{
        success: boolean;
        data: import("./interfaces/order.interface").OrderItem[];
        count: number;
    }>;
}
