import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
export declare class QueueService {
    private readonly sqsClient;
    private readonly configService;
    private readonly logger;
    constructor(sqsClient: SQSClient, configService: ConfigService);
    sendToQueue(message: any): Promise<string>;
    receiveMessages(maxMessages?: number): Promise<any[]>;
    deleteMessage(receiptHandle: string): Promise<void>;
}
