import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletsService } from './wallets.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
