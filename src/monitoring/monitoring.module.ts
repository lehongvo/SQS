import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { BalanceMonitorService } from './services/balance-monitor.service';

@Module({
  imports: [ConfigModule, PrismaModule, ScheduleModule.forRoot()],
  providers: [BalanceMonitorService],
  exports: [BalanceMonitorService],
})
export class MonitoringModule {}
