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
  Param,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard)
  async createOrder(@Body() mintNftDto: MintNftDto) {
    try {
      // Create order in database
      const order = await this.ordersService.create({
        mintToAddress: mintNftDto.mintToAddress,
        name: mintNftDto.name,
        description: mintNftDto.description || '',
        image: mintNftDto.image,
        attributes: mintNftDto.attributes,
        status: 'PENDING',
      });

      return {
        success: true,
        orderId: order.id,
        status: order.status,
      };
    } catch (error) {
      this.logger.error('Error creating order:', error);
      throw error;
    }
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard)
  async createBatchOrders(@Body() orders: MintNftDto[]) {
    try {
      const orderData = orders.map((order) => ({
        mintToAddress: order.mintToAddress,
        name: order.name,
        description: order.description || '',
        image: order.image,
        attributes: order.attributes || {},
        status: OrderStatus.PENDING,
      }));

      const count = await this.ordersService.batchCreate(orderData);

      return {
        success: true,
        count,
        message: `Created ${count} orders successfully`,
      };
    } catch (error) {
      this.logger.error('Error creating batch orders:', error);
      throw error;
    }
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  async getOrder(@Param('id') id: string) {
    try {
      const order = await this.ordersService.findById(id);
      return order;
    } catch (error) {
      this.logger.error(`Error getting order ${id}:`, error);
      throw error;
    }
  }

  @Get()
  @UseGuards(ApiKeyGuard)
  async getPendingOrders(@Query('limit') limit: number = 10) {
    try {
      const orders = await this.ordersService.findPendingOrders(limit);
      return orders;
    } catch (error) {
      this.logger.error('Error getting pending orders:', error);
      throw error;
    }
  }
}
