import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from './services/queue.service';
import { awsConfig } from '../config/aws.config';

@Module({
  imports: [ConfigModule, awsConfig],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
