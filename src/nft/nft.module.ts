import { Module } from '@nestjs/common';
import { NftController } from './nft.controller';
import { NftService } from './nft.service';
import { OrdersModule } from '../orders/orders.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [OrdersModule, QueueModule],
  controllers: [NftController],
  providers: [NftService],
  exports: [NftService],
})
export class NftModule {}
