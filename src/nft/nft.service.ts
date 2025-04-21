import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MintNftDto } from './dto/mint-nft.dto';
import { OrdersService } from '../orders/orders.service';
import { QueueService } from '../queue/services/queue.service';
import { v4 as uuidv4 } from 'uuid';
import { BatchMintDto } from './dto/batch-mint.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class NftService {
  private readonly logger = new Logger(NftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly queueService: QueueService,
  ) {}

  async mintNft(mintNftDto: MintNftDto) {
    try {
      const order = await this.prisma.order.create({
        data: {
          mintToAddress: mintNftDto.mintToAddress,
          name: mintNftDto.name,
          description: mintNftDto.description,
          image: mintNftDto.image,
          attributes: mintNftDto.attributes || {},
          status: 'PENDING',
        },
      });

      return order;
    } catch (error) {
      this.logger.error('Error creating NFT mint order:', error);
      throw error;
    }
  }

  async batchMintNft(mintDto: BatchMintDto) {
    try {
      const batch = await this.prisma.batch.create({
        data: {
          status: 'PENDING',
          totalOrders: mintDto.orders.length,
          orders: {
            create: mintDto.orders.map((order) => ({
              mintToAddress: order.mintToAddress,
              name: order.name,
              description: order.description,
              image: order.image,
              attributes: order.attributes || {},
              status: 'PENDING',
            })),
          },
        },
        include: {
          orders: true,
        },
      });

      return batch;
    } catch (error) {
      this.logger.error('Error creating batch NFT mint orders:', error);
      throw error;
    }
  }

  async batchMint(mintDtos: MintNftDto[]) {
    try {
      if (!mintDtos.length) {
        throw new BadRequestException('No NFTs provided for batch mint');
      }

      // Create batch record
      const batchId = uuidv4();
      const batch = await this.ordersService.createBatch({
        id: batchId,
        totalOrders: mintDtos.length,
      });

      this.logger.log(
        `Created batch ${batchId} with ${mintDtos.length} NFTs to mint`,
      );

      // Create orders for all NFTs in batch
      for (const mintDto of mintDtos) {
        await this.ordersService.createBatchOrder(batchId, {
          id: uuidv4(),
          mintToAddress: mintDto.mintToAddress,
          name: mintDto.name,
          description: mintDto.description || '',
          image: mintDto.image,
          attributes: mintDto.attributes || {},
        });
      }

      // Add batch processing job to queue
      const jobId = await this.queueService.addBatchJob(batchId);

      return {
        success: true,
        data: {
          batchId,
          jobId,
          totalOrders: mintDtos.length,
          status: 'pending',
        },
        message: 'Batch mint job added to queue successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to create batch mint: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        error.message || 'Failed to create batch mint',
      );
    }
  }
}
