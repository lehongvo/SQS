import { ScheduledHandler, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { ethers } from 'ethers';

// Constants
const WORKERS_TABLE = process.env.WORKERS_TABLE || '';
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN || '';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS || '';
const AWS_REGION = process.env.REGION || 'ap-southeast-1';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || '';
const CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021',
  10,
);
const CHAIN_NAME = process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon';
const MIN_WORKER_BALANCE = ethers.parseEther('0.1'); // 0.1 ETH
const LOW_BALANCE_THRESHOLD = ethers.parseEther('0.5'); // 0.5 ETH
const TOP_UP_AMOUNT = ethers.parseEther('1'); // 1 ETH

// Enums
enum WorkerStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  DISABLED = 'DISABLED',
}

// Interfaces
interface Worker {
  id: string;
  address: string;
  kmsKeyId: string;
  status: WorkerStatus;
  nonce: number;
  balance: string;
  totalMinted: number;
  failedTransactions: number;
  successfulTransactions: number;
  totalGasUsed: string;
  createdAt: string;
  updatedAt: string;
}

// Initialize clients
const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = new SNSClient({ region: AWS_REGION });

// Initialize blockchain provider
const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: CHAIN_ID,
  name: CHAIN_NAME,
});

/**
 * Main handler for the scheduled event
 */
export const handler: ScheduledHandler = async (
  event: any,
  context: Context,
) => {
  console.log('Starting balance monitoring check');

  try {
    // Get all workers
    const workers = await getAllWorkers();
    console.log(`Found ${workers.length} workers to check`);

    // Get master wallet balance
    const masterBalance = await provider.getBalance(MASTER_WALLET_ADDRESS);
    console.log(
      `Master wallet balance: ${ethers.formatEther(masterBalance)} ETH`,
    );

    // Check if master wallet has low balance
    if (masterBalance < LOW_BALANCE_THRESHOLD) {
      await publishAlert(
        'Master Wallet Low Balance',
        `Master wallet (${MASTER_WALLET_ADDRESS}) has low balance: ${ethers.formatEther(masterBalance)} ETH`,
      );
    }

    // Check each worker's balance and update in DynamoDB
    for (const worker of workers) {
      try {
        const onchainBalance = await provider.getBalance(worker.address);
        console.log(
          `Worker ${worker.id} (${worker.address}) balance: ${ethers.formatEther(onchainBalance)} ETH`,
        );

        // Update balance in DynamoDB
        await updateWorkerBalance(worker.id, onchainBalance.toString());

        // Check if worker has low balance and needs funding
        if (onchainBalance < MIN_WORKER_BALANCE) {
          await publishAlert(
            'Worker Low Balance',
            `Worker ${worker.id} (${worker.address}) has low balance: ${ethers.formatEther(onchainBalance)} ETH. Funding required.`,
          );

          // In a real implementation, you would use your master wallet to fund this worker
          // This would require AWS KMS to sign a transaction from the master wallet

          console.log(
            `Worker ${worker.id} needs funding. Would transfer ${ethers.formatEther(TOP_UP_AMOUNT)} ETH from master wallet.`,
          );
        }
      } catch (error) {
        console.error(
          `Error checking worker ${worker.id} balance: ${error.message}`,
          error.stack,
        );
      }
    }

    console.log('Balance monitoring check completed successfully');
  } catch (error) {
    console.error(`Error in balance monitor: ${error.message}`, error.stack);
    await publishAlert(
      'Balance Monitor Error',
      `Failed to run balance monitoring: ${error.message}`,
    );
    throw error;
  }
};

/**
 * Get all workers from DynamoDB
 */
async function getAllWorkers(): Promise<Worker[]> {
  const response = await ddbDocClient.send(
    new ScanCommand({
      TableName: WORKERS_TABLE,
    }),
  );

  return (response.Items || []) as Worker[];
}

/**
 * Update a worker's balance in DynamoDB
 */
async function updateWorkerBalance(
  workerId: string,
  balance: string,
): Promise<void> {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: WORKERS_TABLE,
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

/**
 * Publish an alert to the SNS topic
 */
async function publishAlert(subject: string, message: string): Promise<void> {
  if (!ALERT_TOPIC_ARN) {
    console.error('Alert Topic ARN not configured');
    return;
  }

  await snsClient.send(
    new PublishCommand({
      TopicArn: ALERT_TOPIC_ARN,
      Subject: `[NFT Mint] ${subject}`,
      Message: message,
    }),
  );
}
