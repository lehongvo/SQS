import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { Worker, WorkerStatus } from './interfaces/worker.interface';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly ddbClient: DynamoDBClient;
  private readonly ddbDocClient: DynamoDBDocumentClient;
  private readonly kmsClient: KMSClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    this.ddbClient = new DynamoDBClient({
      region: this.configService.get('REGION', 'ap-southeast-1'),
    });
    this.ddbDocClient = DynamoDBDocumentClient.from(this.ddbClient);
    this.kmsClient = new KMSClient({
      region: this.configService.get('REGION', 'ap-southeast-1'),
    });
    this.tableName = this.configService.get('WORKERS_TABLE', '');
  }

  async create(kmsKeyId: string): Promise<Worker> {
    // Generate Ethereum address from KMS public key
    // In real implementation, you would derive the ETH address from the KMS key's public key
    // For demonstration purposes, we'll generate a random address
    const address = ethers.Wallet.createRandom().address;

    const timestamp = new Date().toISOString();
    const worker: Worker = {
      id: uuidv4(),
      address,
      kmsKeyId,
      status: WorkerStatus.AVAILABLE,
      nonce: 0,
      balance: '0',
      totalMinted: 0,
      failedTransactions: 0,
      successfulTransactions: 0,
      totalGasUsed: '0',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.ddbDocClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: worker,
      }),
    );

    return worker;
  }

  async getAvailableWorker(): Promise<Worker> {
    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': WorkerStatus.AVAILABLE,
        },
        Limit: 1,
      }),
    );

    if (!response.Items || response.Items.length === 0) {
      throw new NotFoundException('No available workers found');
    }

    const worker = response.Items[0] as Worker;

    // Mark worker as busy
    await this.ddbDocClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: worker.id },
        UpdateExpression: 'set #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': WorkerStatus.BUSY,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    );

    return worker;
  }

  async releaseWorker(workerId: string, data?: Partial<Worker>): Promise<void> {
    const updateExpression = [
      'set #status = :status',
      '#updatedAt = :updatedAt',
    ];
    const expressionAttributeNames = {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues = {
      ':status': WorkerStatus.AVAILABLE,
      ':updatedAt': new Date().toISOString(),
    };

    // Add additional attributes if provided
    if (data) {
      Object.entries(data).forEach(([key, value], index) => {
        if (key !== 'id' && key !== 'createdAt') {
          // Don't update primary key or creation timestamp
          const attrName = `#attr${index}`;
          const attrValue = `:val${index}`;
          updateExpression.push(`${attrName} = ${attrValue}`);
          expressionAttributeNames[attrName] = key;
          expressionAttributeValues[attrValue] = value;
        }
      });
    }

    await this.ddbDocClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: workerId },
        UpdateExpression: updateExpression.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    );
  }

  async getWorkerById(id: string): Promise<Worker | null> {
    const response = await this.ddbDocClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id },
      }),
    );

    return response.Item as Worker | null;
  }

  async incrementNonce(workerId: string): Promise<void> {
    await this.ddbDocClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: workerId },
        UpdateExpression:
          'set #nonce = #nonce + :increment, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#nonce': 'nonce',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':increment': 1,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    );
  }

  async trackSuccessfulMint(workerId: string, gasUsed: string): Promise<void> {
    await this.ddbDocClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: workerId },
        UpdateExpression:
          'set #totalMinted = #totalMinted + :increment, #successfulTransactions = #successfulTransactions + :increment, #totalGasUsed = #totalGasUsed + :gasUsed, #updatedAt = :updatedAt',
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
      }),
    );
  }

  async trackFailedMint(workerId: string): Promise<void> {
    await this.ddbDocClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: workerId },
        UpdateExpression:
          'set #failedTransactions = #failedTransactions + :increment, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#failedTransactions': 'failedTransactions',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':increment': 1,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    );
  }

  async updateBalance(workerId: string, balance: string): Promise<void> {
    await this.ddbDocClient.send(
      new UpdateCommand({
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
      }),
    );
  }

  async signTransaction(
    worker: Worker,
    transaction: ethers.Transaction,
  ): Promise<string> {
    try {
      // Serialize transaction to bytes
      const unsignedTxHex = ethers.hexlify(transaction.unsignedSerialized);

      // Use KMS to sign the transaction hash
      const signResult = await this.kmsClient.send(
        new SignCommand({
          KeyId: worker.kmsKeyId,
          Message: Buffer.from(
            ethers.getBytes(ethers.keccak256(unsignedTxHex)),
          ),
          MessageType: 'DIGEST',
          SigningAlgorithm: 'ECDSA_SHA_256',
        }),
      );

      if (!signResult.Signature) {
        throw new Error('KMS signature is empty');
      }

      // Process KMS signature to EIP-155 Ethereum signature
      // In a real implementation, you would need to convert KMS signature format to Ethereum r, s, v format
      // This is simplified for demonstration
      const signature = Buffer.from(signResult.Signature).toString('hex');

      // In a real implementation you'd extract r, s from the signature and calculate v
      // Here we're simulating the signature creation
      const r = '0x' + signature.substring(0, 64);
      const s = '0x' + signature.substring(64, 128);
      const v = 27; // This should be calculated based on chain ID and recovery logic

      // Create signed transaction
      // In a real implementation, you would use transaction.unsignedSerialized with the signature
      const signedTx = ethers.Transaction.from({
        ...transaction,
        signature: ethers.Signature.from({ r, s, v }),
      });

      return signedTx.serialized;
    } catch (error) {
      this.logger.error(
        `Error signing transaction: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to sign transaction: ${error.message}`);
    }
  }
}
