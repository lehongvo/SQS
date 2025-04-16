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
var BatchProcessingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchProcessingService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const orders_service_1 = require("../orders/orders.service");
const uuid_1 = require("uuid");
const order_interface_1 = require("../orders/interfaces/order.interface");
let BatchProcessingService = BatchProcessingService_1 = class BatchProcessingService {
    ordersService;
    logger = new common_1.Logger(BatchProcessingService_1.name);
    constructor(ordersService) {
        this.ordersService = ordersService;
    }
    async processPendingOrders() {
        this.logger.log('Checking for pending orders to batch process...');
        try {
            const pendingOrders = await this.ordersService.findPendingOrders(100);
            if (pendingOrders.length === 0) {
                this.logger.debug('No pending orders found');
                return;
            }
            this.logger.log(`Found ${pendingOrders.length} pending orders`);
            const batchId = (0, uuid_1.v4)();
            const orderIds = pendingOrders.map((order) => order.id);
            for (const orderId of orderIds) {
                await this.ordersService.updateOrderStatus(orderId, order_interface_1.OrderStatus.PROCESSING, { batchId });
            }
            this.logger.log(`Queued batch ${batchId} with ${orderIds.length} orders for processing`);
        }
        catch (error) {
            this.logger.error('Error processing pending orders', error.stack);
        }
    }
};
exports.BatchProcessingService = BatchProcessingService;
__decorate([
    (0, schedule_1.Cron)('0 * * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BatchProcessingService.prototype, "processPendingOrders", null);
exports.BatchProcessingService = BatchProcessingService = BatchProcessingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], BatchProcessingService);
//# sourceMappingURL=batch-processing.service.js.map