"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OrdersController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const api_key_guard_1 = require("../guards/api-key.guard");
const orders_service_1 = require("./orders.service");
const mint_nft_dto_1 = require("../nft/dto/mint-nft.dto");
let OrdersController = OrdersController_1 = class OrdersController {
    ordersService;
    configService;
    logger = new common_1.Logger(OrdersController_1.name);
    sqsClient;
    queueUrl;
    constructor(ordersService, configService) {
        this.ordersService = ordersService;
        this.configService = configService;
        this.sqsClient = new client_sqs_1.SQSClient({
            region: this.configService.get('REGION', 'ap-southeast-1'),
        });
        this.queueUrl = this.configService.get('NFT_MINT_QUEUE_URL', '');
    }
    async createOrder(mintNftDto) {
        try {
            const orderRequest = {
                name: mintNftDto.name,
                description: mintNftDto.description,
                image: mintNftDto.image,
                mintToAddress: mintNftDto.mintToAddress,
                attributes: mintNftDto.attributes,
            };
            const order = await this.ordersService.create(orderRequest);
            await this.sqsClient.send(new client_sqs_1.SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify({
                    orderId: order.id,
                    type: 'SINGLE_ORDER',
                }),
            }));
            return {
                success: true,
                data: {
                    orderId: order.id,
                    status: order.status,
                },
                message: 'Order created successfully and queued for processing',
            };
        }
        catch (error) {
            this.logger.error(`Error creating order: ${error.message}`, error.stack);
            throw new common_1.BadRequestException(`Failed to create order: ${error.message}`);
        }
    }
    async createBatchOrders(batchRequest) {
        try {
            if (!batchRequest.orders || batchRequest.orders.length === 0) {
                throw new common_1.BadRequestException('Batch request must contain at least one order');
            }
            if (batchRequest.orders.length > 100) {
                throw new common_1.BadRequestException('Batch request cannot exceed 100 orders');
            }
            const orderIds = await this.ordersService.batchCreate(batchRequest.orders);
            await this.sqsClient.send(new client_sqs_1.SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify({
                    orderIds,
                    type: 'BATCH_ORDER',
                }),
            }));
            return {
                success: true,
                data: {
                    orderIds,
                    count: orderIds.length,
                },
                message: 'Batch orders created successfully and queued for processing',
            };
        }
        catch (error) {
            this.logger.error(`Error creating batch orders: ${error.message}`, error.stack);
            throw new common_1.BadRequestException(`Failed to create batch orders: ${error.message}`);
        }
    }
    async getOrder(id) {
        try {
            if (!id) {
                throw new common_1.BadRequestException('Order ID is required');
            }
            const order = await this.ordersService.findById(id);
            if (!order) {
                throw new common_1.BadRequestException(`Order with ID ${id} not found`);
            }
            return {
                success: true,
                data: order,
            };
        }
        catch (error) {
            this.logger.error(`Error getting order: ${error.message}`, error.stack);
            throw new common_1.BadRequestException(`Failed to get order: ${error.message}`);
        }
    }
    async getPendingOrders(limit = 100) {
        try {
            const orders = await this.ordersService.findPendingOrders(limit);
            return {
                success: true,
                data: orders,
                count: orders.length,
            };
        }
        catch (error) {
            this.logger.error(`Error getting pending orders: ${error.message}`, error.stack);
            throw new common_1.BadRequestException(`Failed to get pending orders: ${error.message}`);
        }
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mint_nft_dto_1.MintNftDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Post)('batch'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "createBatchOrders", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Get)('pending'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getPendingOrders", null);
exports.OrdersController = OrdersController = OrdersController_1 = __decorate([
    (0, common_1.Controller)('orders'),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
        config_1.ConfigService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map