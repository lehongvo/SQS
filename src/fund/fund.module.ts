import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { FundService } from './services/fund.service';
import { FundProcessor } from './processors/fund.processor';
import { AccountsModule } from '../accounts/accounts.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'fund-queue',
    }),
    AccountsModule,
    WalletsModule,
  ],
  providers: [FundService, FundProcessor],
  exports: [FundService],
})
export class FundModule {}
