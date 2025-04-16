import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  OrderItem,
  OrderRequest,
  OrderStatus,
} from './interfaces/order.interface';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly ddbClient: DynamoDBClient;
  private readonly ddbDocClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    this.ddbClient = new DynamoDBClient({
      region: this.configService.get('REGION', 'ap-southeast-1'),
    });
    this.ddbDocClient = DynamoDBDocumentClient.from(this.ddbClient);
    this.tableName = this.configService.get('ORDERS_TABLE', '');
  }

  async create(orderRequest: OrderRequest): Promise<OrderItem> {
    const timestamp = new Date().toISOString();
    const order: OrderItem = {
      id: uuidv4(),
      ...orderRequest,
      status: OrderStatus.PENDING,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.ddbDocClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: order,
      }),
    );

    return order;
  }

  async batchCreate(orders: OrderRequest[]): Promise<string[]> {
    const timestamp = new Date().toISOString();
    const orderItems = orders.map((order) => ({
      id: uuidv4(),
      ...order,
      status: OrderStatus.PENDING,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    // DynamoDB BatchWrite supports max 25 items at once
    const batchSize = 25;
    const orderIds: string[] = [];

    for (let i = 0; i < orderItems.length; i += batchSize) {
      const batch = orderItems.slice(i, i + batchSize);

      await this.ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: batch.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        }),
      );

      orderIds.push(...batch.map((item) => item.id));
    }

    return orderIds;
  }

  async findById(id: string): Promise<OrderItem | null> {
    const response = await this.ddbDocClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id },
      }),
    );

    return response.Item as OrderItem | null;
  }

  async findPendingOrders(limit = 100): Promise<OrderItem[]> {
    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'StatusCreatedAtIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': OrderStatus.PENDING,
        },
        Limit: limit,
        ScanIndexForward: true, // true for ascending (oldest first)
      }),
    );

    return (response.Items || []) as OrderItem[];
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    additionalAttributes?: Partial<OrderItem>,
  ): Promise<OrderItem | null> {
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

    // Add additional attributes if provided
    if (additionalAttributes) {
      Object.entries(additionalAttributes).forEach(([key, value], index) => {
        if (key !== 'id' && key !== 'createdAt') {
          // Don't update primary key or creation timestamp
          const attrName = `#attr${index}`;
          const attrValue = `:val${index}`;
          updateExpression.push(`${attrName} = ${attrValue}`);
          expressionAttributeNames[attrName] = key;
          expressionAttributeValues[attrValue] = value;
        }
      });
    }

    const response = await this.ddbDocClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: orderId },
        UpdateExpression: updateExpression.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    return response.Attributes as OrderItem | null;
  }

  async updateBatchStatus(
    orderIds: string[],
    status: OrderStatus,
    batchId: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    // DynamoDB BatchWrite supports max 25 items at once
    const batchSize = 25;

    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batch = orderIds.slice(i, i + batchSize);

      // For batch updates, we have to update one by one because
      // BatchWriteCommand doesn't support UpdateRequest
      await Promise.all(
        batch.map((orderId) =>
          this.ddbDocClient.send(
            new UpdateCommand({
              TableName: this.tableName,
              Key: { id: orderId },
              UpdateExpression:
                'set #status = :status, #batchId = :batchId, #updatedAt = :updatedAt',
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
            }),
          ),
        ),
      );
    }
  }
}
