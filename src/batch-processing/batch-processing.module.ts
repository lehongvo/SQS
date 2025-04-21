import { Module } from '@nestjs/common';
import { BatchProcessingService } from './batch-processing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { NftMintProcessor } from './processors/nft-mint.processor';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [PrismaModule, OrdersModule, WalletsModule],
  providers: [BatchProcessingService, NftMintProcessor],
  exports: [BatchProcessingService, NftMintProcessor],
})
export class BatchProcessingModule {}
