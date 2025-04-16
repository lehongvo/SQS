import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletsService } from './wallets.service';

@Module({
  imports: [ConfigModule],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
