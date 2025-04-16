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
var WalletsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_kms_1 = require("@aws-sdk/client-kms");
const ethers_1 = require("ethers");
const uuid_1 = require("uuid");
const worker_interface_1 = require("./interfaces/worker.interface");
let WalletsService = WalletsService_1 = class WalletsService {
    configService;
    logger = new common_1.Logger(WalletsService_1.name);
    ddbClient;
    ddbDocClient;
    kmsClient;
    tableName;
    constructor(configService) {
        this.configService = configService;
        this.ddbClient = new client_dynamodb_1.DynamoDBClient({
            region: this.configService.get('REGION', 'ap-southeast-1'),
        });
        this.ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(this.ddbClient);
        this.kmsClient = new client_kms_1.KMSClient({
            region: this.configService.get('REGION', 'ap-southeast-1'),
        });
        this.tableName = this.configService.get('WORKERS_TABLE', '');
    }
    async create(kmsKeyId) {
        const address = ethers_1.ethers.Wallet.createRandom().address;
        const timestamp = new Date().toISOString();
        const worker = {
            id: (0, uuid_1.v4)(),
            address,
            kmsKeyId,
            status: worker_interface_1.WorkerStatus.AVAILABLE,
            nonce: 0,
            balance: '0',
            totalMinted: 0,
            failedTransactions: 0,
            successfulTransactions: 0,
            totalGasUsed: '0',
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await this.ddbDocClient.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: worker,
        }));
        return worker;
    }
    async getAvailableWorker() {
        const response = await this.ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            IndexName: 'StatusIndex',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': worker_interface_1.WorkerStatus.AVAILABLE,
            },
            Limit: 1,
        }));
        if (!response.Items || response.Items.length === 0) {
            throw new common_1.NotFoundException('No available workers found');
        }
        const worker = response.Items[0];
        await this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { id: worker.id },
            UpdateExpression: 'set #status = :status, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status',
                '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
                ':status': worker_interface_1.WorkerStatus.BUSY,
                ':updatedAt': new Date().toISOString(),
            },
        }));
        return worker;
    }
    async releaseWorker(workerId, data) {
        const updateExpression = [
            'set #status = :status',
            '#updatedAt = :updatedAt',
        ];
        const expressionAttributeNames = {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
        };
        const expressionAttributeValues = {
            ':status': worker_interface_1.WorkerStatus.AVAILABLE,
            ':updatedAt': new Date().toISOString(),
        };
        if (data) {
            Object.entries(data).forEach(([key, value], index) => {
                if (key !== 'id' && key !== 'createdAt') {
                    const attrName = `#attr${index}`;
                    const attrValue = `:val${index}`;
                    updateExpression.push(`${attrName} = ${attrValue}`);
                    expressionAttributeNames[attrName] = key;
                    expressionAttributeValues[attrValue] = value;
                }
            });
        }
        await this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { id: workerId },
            UpdateExpression: updateExpression.join(', '),
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        }));
    }
    async getWorkerById(id) {
        const response = await this.ddbDocClient.send(new lib_dynamodb_1.GetCommand({
            TableName: this.tableName,
            Key: { id },
        }));
        return response.Item;
    }
    async incrementNonce(workerId) {
        await this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { id: workerId },
            UpdateExpression: 'set #nonce = #nonce + :increment, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#nonce': 'nonce',
                '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
                ':increment': 1,
                ':updatedAt': new Date().toISOString(),
            },
        }));
    }
    async trackSuccessfulMint(workerId, gasUsed) {
        await this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { id: workerId },
            UpdateExpression: 'set #totalMinted = #totalMinted + :increment, #successfulTransactions = #successfulTransactions + :increment, #totalGasUsed = #totalGasUsed + :gasUsed, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#totalMinted': 'totalMinted',
                '#successfulTransactions': 'successfulTransactions',
                '#totalGasUsed': 'totalGasUsed',
                '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
                ':increment': 1,
                ':gasUsed': gasUsed,
                ':updatedAt': new Date().toISOString(),
            },
        }));
    }
    async trackFailedMint(workerId) {
        await this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { id: workerId },
            UpdateExpression: 'set #failedTransactions = #failedTransactions + :increment, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#failedTransactions': 'failedTransactions',
                '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
                ':increment': 1,
                ':updatedAt': new Date().toISOString(),
            },
        }));
    }
    async updateBalance(workerId, balance) {
        await this.ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { id: workerId },
            UpdateExpression: 'set #balance = :balance, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#balance': 'balance',
                '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
                ':balance': balance,
                ':updatedAt': new Date().toISOString(),
            },
        }));
    }
    async signTransaction(worker, transaction) {
        try {
            const unsignedTxHex = ethers_1.ethers.hexlify(transaction.unsignedSerialized);
            const signResult = await this.kmsClient.send(new client_kms_1.SignCommand({
                KeyId: worker.kmsKeyId,
                Message: Buffer.from(ethers_1.ethers.getBytes(ethers_1.ethers.keccak256(unsignedTxHex))),
                MessageType: 'DIGEST',
                SigningAlgorithm: 'ECDSA_SHA_256',
            }));
            if (!signResult.Signature) {
                throw new Error('KMS signature is empty');
            }
            const signature = Buffer.from(signResult.Signature).toString('hex');
            const r = '0x' + signature.substring(0, 64);
            const s = '0x' + signature.substring(64, 128);
            const v = 27;
            const signedTx = ethers_1.ethers.Transaction.from({
                ...transaction,
                signature: ethers_1.ethers.Signature.from({ r, s, v }),
            });
            return signedTx.serialized;
        }
        catch (error) {
            this.logger.error(`Error signing transaction: ${error.message}`, error.stack);
            throw new Error(`Failed to sign transaction: ${error.message}`);
        }
    }
};
exports.WalletsService = WalletsService;
exports.WalletsService = WalletsService = WalletsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WalletsService);
//# sourceMappingURL=wallets.service.js.map