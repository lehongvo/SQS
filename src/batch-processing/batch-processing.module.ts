import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { WalletsModule } from '../wallets/wallets.module';
import { BatchProcessingService } from './batch-processing.service';
import { NftMintProcessor } from './processors/nft-mint.processor';

@Module({
  imports: [OrdersModule, WalletsModule],
  providers: [BatchProcessingService, NftMintProcessor],
  exports: [BatchProcessingService],
})
export class BatchProcessingModule {}
