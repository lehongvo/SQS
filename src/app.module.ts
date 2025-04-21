import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NftModule } from './nft/nft.module';
import { OrdersModule } from './orders/orders.module';
import { WalletsModule } from './wallets/wallets.module';
import { QueueModule } from './queue/queue.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { BatchProcessingModule } from './batch-processing/batch-processing.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    NftModule,
    OrdersModule,
    WalletsModule,
    QueueModule,
    BatchProcessingModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
