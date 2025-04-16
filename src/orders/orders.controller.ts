import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Query,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { OrdersService } from './orders.service';
import { MintNftDto } from '../nft/dto/mint-nft.dto';
import {
  OrderRequest,
  OrderBatchRequest,
  OrderStatus,
} from './interfaces/order.interface';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {
    this.sqsClient = new SQSClient({
      region: this.configService.get('REGION', 'ap-southeast-1'),
    });
    this.queueUrl = this.configService.get('NFT_MINT_QUEUE_URL', '');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard)
  async createOrder(@Body() mintNftDto: MintNftDto) {
    try {
      // Create the order in DynamoDB
      const orderRequest: OrderRequest = {
        name: mintNftDto.name,
        description: mintNftDto.description,
        image: mintNftDto.image,
        mintToAddress: mintNftDto.mintToAddress,
        attributes: mintNftDto.attributes,
      };

      const order = await this.ordersService.create(orderRequest);

      // Send message to SQS for processing
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({
            orderId: order.id,
            type: 'SINGLE_ORDER',
          }),
        }),
      );

      return {
        success: true,
        data: {
          orderId: order.id,
          status: order.status,
        },
        message: 'Order created successfully and queued for processing',
      };
    } catch (error) {
      this.logger.error(`Error creating order: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to create order: ${error.message}`);
    }
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard)
  async createBatchOrders(@Body() batchRequest: OrderBatchRequest) {
    try {
      if (!batchRequest.orders || batchRequest.orders.length === 0) {
        throw new BadRequestException(
          'Batch request must contain at least one order',
        );
      }

      if (batchRequest.orders.length > 100) {
        throw new BadRequestException('Batch request cannot exceed 100 orders');
      }

      // Create all orders in DynamoDB
      const orderIds = await this.ordersService.batchCreate(
        batchRequest.orders,
      );

      // Send batch message to SQS for processing
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({
            orderIds,
            type: 'BATCH_ORDER',
          }),
        }),
      );

      return {
        success: true,
        data: {
          orderIds,
          count: orderIds.length,
        },
        message: 'Batch orders created successfully and queued for processing',
      };
    } catch (error) {
      this.logger.error(
        `Error creating batch orders: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to create batch orders: ${error.message}`,
      );
    }
  }

  @Get()
  @UseGuards(ApiKeyGuard)
  async getOrder(@Query('id') id: string) {
    try {
      if (!id) {
        throw new BadRequestException('Order ID is required');
      }

      const order = await this.ordersService.findById(id);

      if (!order) {
        throw new BadRequestException(`Order with ID ${id} not found`);
      }

      return {
        success: true,
        data: order,
      };
    } catch (error) {
      this.logger.error(`Error getting order: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to get order: ${error.message}`);
    }
  }

  @Get('pending')
  @UseGuards(ApiKeyGuard)
  async getPendingOrders(@Query('limit') limit: number = 100) {
    try {
      const orders = await this.ordersService.findPendingOrders(limit);

      return {
        success: true,
        data: orders,
        count: orders.length,
      };
    } catch (error) {
      this.logger.error(
        `Error getting pending orders: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to get pending orders: ${error.message}`,
      );
    }
  }
}
