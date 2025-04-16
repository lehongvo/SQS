"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var QueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_sqs_1 = require("@aws-sdk/client-sqs");
let QueueService = QueueService_1 = class QueueService {
    sqsClient;
    configService;
    logger = new common_1.Logger(QueueService_1.name);
    constructor(sqsClient, configService) {
        this.sqsClient = sqsClient;
        this.configService = configService;
    }
    async sendToQueue(message) {
        try {
            const queueUrl = this.configService.get('SQS_QUEUE_URL');
            const command = new client_sqs_1.SendMessageCommand({
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
            return result.MessageId;
        }
        catch (error) {
            this.logger.error('Error sending message to queue', error);
            throw error;
        }
    }
    async receiveMessages(maxMessages = 10) {
        try {
            const queueUrl = this.configService.get('SQS_QUEUE_URL');
            const command = new client_sqs_1.ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: maxMessages,
                WaitTimeSeconds: 20,
                MessageAttributeNames: ['All'],
            });
            const result = await this.sqsClient.send(command);
            return result.Messages || [];
        }
        catch (error) {
            this.logger.error('Error receiving messages from queue', error);
            throw error;
        }
    }
    async deleteMessage(receiptHandle) {
        try {
            const queueUrl = this.configService.get('SQS_QUEUE_URL');
            const command = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: receiptHandle,
            });
            await this.sqsClient.send(command);
        }
        catch (error) {
            this.logger.error('Error deleting message from queue', error);
            throw error;
        }
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = QueueService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [client_sqs_1.SQSClient,
        config_1.ConfigService])
], QueueService);
//# sourceMappingURL=queue.service.js.map