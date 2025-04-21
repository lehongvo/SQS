import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './services/queue.service';
import { RetryService } from './services/retry.service';
import { RetryProcessor } from './processors/retry.processor';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: 'nft-mint',
      },
      {
        name: 'retry-queue',
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
    ),
    OrdersModule,
  ],
  providers: [QueueService, RetryService, RetryProcessor],
  exports: [QueueService, RetryService],
})
export class QueueModule {}
