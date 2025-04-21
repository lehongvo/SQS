import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './services/queue.service';
import { BatchProcessingModule } from '../batch-processing/batch-processing.module';
import { NftMintQueueProcessor } from './processors/nft-mint.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: parseInt(configService.get('REDIS_PORT', '6379')),
          password: configService.get('REDIS_PASSWORD', ''),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'nft-mint',
    }),
    BatchProcessingModule,
  ],
  providers: [QueueService, NftMintQueueProcessor],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
