import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly sqsClient: SQSClient,
    private readonly configService: ConfigService,
  ) {}

  async sendToQueue(message: any): Promise<string> {
    try {
      const queueUrl = this.configService.get<string>('SQS_QUEUE_URL');
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          Type: {
            DataType: 'String',
            StringValue: 'NFT_MINT',
          },
        },
      });

      const result = await this.sqsClient.send(command);
      return result.MessageId!;
    } catch (error) {
      this.logger.error('Error sending message to queue', error);
      throw error;
    }
  }

  async receiveMessages(maxMessages: number = 10): Promise<any[]> {
    try {
      const queueUrl = this.configService.get<string>('SQS_QUEUE_URL');
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: 20,
        MessageAttributeNames: ['All'],
      });

      const result = await this.sqsClient.send(command);
      return result.Messages || [];
    } catch (error) {
      this.logger.error('Error receiving messages from queue', error);
      throw error;
    }
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const queueUrl = this.configService.get<string>('SQS_QUEUE_URL');
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.sqsClient.send(command);
    } catch (error) {
      this.logger.error('Error deleting message from queue', error);
      throw error;
    }
  }
}
