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
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const order_interface_1 = require("./interfaces/order.interface");
let OrdersService = OrdersService_1 = class OrdersService {
    configService;
    logger = new common_1.Logger(OrdersService_1.name);
    ddbClient;
    ddbDocClient;
    tableName;
    constructor(configService) {
        this.configService = configService;
        this.ddbClient = new client_dynamodb_1.DynamoDBClient({
            region: this.configService.get('REGION', 'ap-southeast-1'),
        });
        this.ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(this.ddbClient);
        this.tableName = this.configService.get('ORDERS_TABLE', '');
    }
    async create(orderRequest) {
        const timestamp = new Date().toISOString();
        const order = {
            id: (0, uuid_1.v4)(),
            ...orderRequest,
            status: order_interface_1.OrderStatus.PENDING,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await this.ddbDocClient.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: order,
        }));
        return order;
    }
    async batchCreate(orders) {
        const timestamp = new Date().toISOString();
        const orderItems = orders.map((order) => ({
            id: (0, uuid_1.v4)(),
            ...order,
            status: order_interface_1.OrderStatus.PENDING,
            createdAt: timestamp,
            updatedAt: timestamp,
        }));
        const batchSize = 25;
        const orderIds = [];
        for (let i = 0; i < orderItems.length; i += batchSize) {
            const batch = orderItems.slice(i, i + batchSize);
            await this.ddbDocClient.send(new lib_dynamodb_1.BatchWriteCommand({
                RequestItems: {
                    [this.tableName]: batch.map((item) => ({
                        PutRequest: { Item: item },
                    })),
                },
            }));
            orderIds.push(...batch.map((item) => item.id));
        }
        return orderIds;
    }
    async findById(id) {
        const response = await this.ddbDocClient.send(new lib_dynamodb_1.GetCommand({
            TableName: this.tableName,
            Key: { id },
        }));
        return response.Item;
    }
    async findPendingOrders(limit = 100) {
        const response = await this.ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            IndexName: 'StatusCreatedAtIndex',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': order_interface_1.OrderStatus.PENDING,
            },
            Limit: limit,
            ScanIndexForward: true,
        }));
        return (response.Items || []);
    }
    async updateOrderStatus(orderId, status, additionalAttributes) {
        const updateExpression = [
            'set #status = :status',
            '#updatedAt = :updatedAt',
        ];
        const expressionAttributeNames = {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
        };
        const expressionAttributeValues = {
            ':status': status,
            ':updatedAt': new Date().toISOString(),
        };
        if (additionalAttributes) {
            Object.entries(additionalAttributes).forEach(([key, value], index) => {
                if (key !== 'id' && key !== 'createdAt') {
                    const attrName = `#attr${index}`;
                    const attrValue = `:val${index}`;
                    updateExpression.push(`${attrName} = ${attrValue}`);
                    expressionAttributeNames[attrName] = key;
                    expressionAttributeValues[attrValue] = value;
                }
            });
        }
        const response = await this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { id: orderId },
            UpdateExpression: updateExpression.join(', '),
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
        }));
        return response.Attributes;
    }
    async updateBatchStatus(orderIds, status, batchId) {
        const timestamp = new Date().toISOString();
        const batchSize = 25;
        for (let i = 0; i < orderIds.length; i += batchSize) {
            const batch = orderIds.slice(i, i + batchSize);
            await Promise.all(batch.map((orderId) => this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: this.tableName,
                Key: { id: orderId },
                UpdateExpression: 'set #status = :status, #batchId = :batchId, #updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#status': 'status',
                    '#batchId': 'batchId',
                    '#updatedAt': 'updatedAt',
                },
                ExpressionAttributeValues: {
                    ':status': status,
                    ':batchId': batchId,
                    ':updatedAt': timestamp,
                },
            }))));
        }
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map