import { SQSEvent, SQSHandler, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ethers } from 'ethers';
import axios from 'axios';
import { EZDRM_NFT_CONTRACT_ABI } from '../utils/abi';

// Constants
const DEFAULT_GAS_LIMIT = 350000n;
const ORDERS_TABLE = process.env.ORDERS_TABLE || '';
const WORKERS_TABLE = process.env.WORKERS_TABLE || '';
const DEAD_LETTER_QUEUE_URL = process.env.DEAD_LETTER_QUEUE_URL || '';
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN || '';
const AWS_REGION = process.env.REGION || 'ap-southeast-1';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || '';
const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || '';
const CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021',
  10,
);
const CHAIN_NAME = process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon';
const PINATA_URL = process.env.PINATA_URL || '';
const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_API_KEY = process.env.PINATA_API_KEY || '';
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || '';
const PINATA_CLOUD_URL = process.env.PINATA_CLOUD_URL || '';

// Enums
enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

enum WorkerStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  DISABLED = 'DISABLED',
}

// Interfaces
interface OrderItem {
  id: string;
  name: string;
  description: string;
  image: string;
  mintToAddress: string;
  attributes?: Record<string, any>[];
  status: OrderStatus;
  transactionHash?: string;
  tokenId?: string;
  errorMessage?: string;
  batchId?: string;
  createdAt: string;
  updatedAt: string;
}

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

interface MetadataInfo {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

interface PinataResponse {
  success: boolean;
  urlTransactionHash: string | null;
  message: string;
}

// Initialize clients
const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = new SNSClient({ region: AWS_REGION });
const sqsClient = new SQSClient({ region: AWS_REGION });

// Initialize blockchain provider
const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: CHAIN_ID,
  name: CHAIN_NAME,
});

/**
 * Main handler for the SQS event
 */
export const handler: SQSHandler = async (
  event: SQSEvent,
  context: Context,
) => {
  console.log(`Starting order processing with ${event.Records.length} records`);

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      console.log(`Processing message: ${JSON.stringify(message)}`);

      if (message.type === 'SINGLE_ORDER') {
        await processSingleOrder(message.orderId);
      } else if (message.type === 'BATCH_ORDER') {
        await processBatchOrders(message.orderIds);
      } else {
        console.error(`Unknown message type: ${message.type}`);
        await sendToDeadLetterQueue(record.body, 'Unknown message type');
      }
    } catch (error) {
      console.error(`Error processing record: ${error.message}`, error.stack);
      await publishAlert(
        'Order Processing Error',
        `Failed to process SQS message: ${error.message}`,
      );
      await sendToDeadLetterQueue(record.body, error.message);
    }
  }
};

/**
 * Process a single order
 */
async function processSingleOrder(orderId: string): Promise<void> {
  console.log(`Processing single order ${orderId}`);

  try {
    // Get order from DynamoDB
    const order = await getOrder(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status !== OrderStatus.PENDING) {
      console.log(
        `Order ${orderId} is already in ${order.status} state. Skipping.`,
      );
      return;
    }

    // Update order status to PROCESSING
    await updateOrderStatus(orderId, OrderStatus.PROCESSING);

    // Get available worker
    const worker = await getAvailableWorker();
    if (!worker) {
      throw new Error('No available workers found');
    }

    // Check worker balance
    const balance = await provider.getBalance(worker.address);
    if (balance < ethers.parseEther('0.01')) {
      // Minimum balance requirement
      await publishAlert(
        'Low Worker Balance',
        `Worker ${worker.id} (${worker.address}) has low balance: ${ethers.formatEther(balance)} ETH`,
      );
      throw new Error(`Worker ${worker.id} has insufficient balance`);
    }

    // Process the order
    const result = await mintNft(order, worker);

    // Update order with results
    await updateOrderStatus(orderId, OrderStatus.COMPLETED, {
      transactionHash: result.hash,
      tokenId: result.tokenId,
    });

    // Update worker stats
    await updateWorkerStats(worker.id, {
      nonce: worker.nonce + 1,
      totalMinted: worker.totalMinted + 1,
      successfulTransactions: worker.successfulTransactions + 1,
      totalGasUsed: (
        BigInt(worker.totalGasUsed) + BigInt(result.gasUsed)
      ).toString(),
      status: WorkerStatus.AVAILABLE,
    });

    console.log(`Successfully processed order ${orderId}`);
  } catch (error) {
    console.error(
      `Error processing order ${orderId}: ${error.message}`,
      error.stack,
    );

    // Update order as failed
    await updateOrderStatus(orderId, OrderStatus.FAILED, {
      errorMessage: error.message,
    });

    // Mark worker as available again if we got that far
    try {
      const worker = await getCurrentlyProcessingWorker();
      if (worker) {
        await updateWorkerStats(worker.id, {
          failedTransactions: worker.failedTransactions + 1,
          status: WorkerStatus.AVAILABLE,
        });
      }
    } catch (workerError) {
      console.error(`Error updating worker: ${workerError.message}`);
    }

    await publishAlert(
      'Order Processing Failed',
      `Failed to process order ${orderId}: ${error.message}`,
    );

    throw error; // Let the SQS handler decide whether to retry
  }
}

/**
 * Process a batch of orders
 */
async function processBatchOrders(orderIds: string[]): Promise<void> {
  console.log(`Processing batch of ${orderIds.length} orders`);

  if (orderIds.length === 0) {
    console.log('Empty batch, nothing to process');
    return;
  }

  const batchId = `batch-${Date.now()}`;
  console.log(`Batch ID: ${batchId}`);

  try {
    // Get available worker
    const worker = await getAvailableWorker();
    if (!worker) {
      throw new Error('No available workers found');
    }

    // Check worker balance
    const balance = await provider.getBalance(worker.address);
    const estimatedGasNeeded =
      ethers.parseEther('0.01') * BigInt(orderIds.length);
    if (balance < estimatedGasNeeded) {
      await publishAlert(
        'Low Worker Balance for Batch',
        `Worker ${worker.id} (${worker.address}) has low balance for batch: ${ethers.formatEther(balance)} ETH, needed ~${ethers.formatEther(estimatedGasNeeded)} ETH`,
      );
      throw new Error(`Worker ${worker.id} has insufficient balance for batch`);
    }

    // Update all orders to PROCESSING
    for (const orderId of orderIds) {
      await updateOrderStatus(orderId, OrderStatus.PROCESSING, { batchId });
    }

    // Process each order
    let nonce = worker.nonce;
    let successCount = 0;
    let failureCount = 0;
    let totalGasUsed = BigInt(0);

    for (const orderId of orderIds) {
      try {
        const order = await getOrder(orderId);
        if (!order) {
          console.error(`Order ${orderId} not found in batch ${batchId}`);
          continue;
        }

        // Process the order with the current nonce
        const result = await mintNft(order, worker, nonce);

        // Update order with results
        await updateOrderStatus(orderId, OrderStatus.COMPLETED, {
          transactionHash: result.hash,
          tokenId: result.tokenId,
        });

        // Update counters
        successCount++;
        totalGasUsed += BigInt(result.gasUsed);
        nonce++;
      } catch (error) {
        console.error(
          `Error processing order ${orderId} in batch ${batchId}: ${error.message}`,
        );

        // Update order as failed
        await updateOrderStatus(orderId, OrderStatus.FAILED, {
          errorMessage: error.message,
        });

        failureCount++;
      }
    }

    // Update worker stats
    await updateWorkerStats(worker.id, {
      nonce,
      totalMinted: worker.totalMinted + successCount,
      successfulTransactions: worker.successfulTransactions + successCount,
      failedTransactions: worker.failedTransactions + failureCount,
      totalGasUsed: (BigInt(worker.totalGasUsed) + totalGasUsed).toString(),
      status: WorkerStatus.AVAILABLE,
    });

    console.log(
      `Batch ${batchId} completed with ${successCount} successes and ${failureCount} failures`,
    );

    if (failureCount > 0) {
      await publishAlert(
        'Batch Processing Completed with Errors',
        `Batch ${batchId} completed with ${successCount} successes and ${failureCount} failures`,
      );
    }
  } catch (error) {
    console.error(`Error processing batch: ${error.message}`, error.stack);

    // Mark all unprocessed orders as failed
    for (const orderId of orderIds) {
      const order = await getOrder(orderId);
      if (order && order.status === OrderStatus.PROCESSING) {
        await updateOrderStatus(orderId, OrderStatus.FAILED, {
          errorMessage: `Batch processing error: ${error.message}`,
        });
      }
    }

    // Mark worker as available again if we got that far
    try {
      const worker = await getCurrentlyProcessingWorker();
      if (worker) {
        await updateWorkerStats(worker.id, {
          failedTransactions: worker.failedTransactions + 1,
          status: WorkerStatus.AVAILABLE,
        });
      }
    } catch (workerError) {
      console.error(`Error updating worker: ${workerError.message}`);
    }

    await publishAlert(
      'Batch Processing Failed',
      `Failed to process batch: ${error.message}`,
    );

    throw error; // Let the SQS handler decide whether to retry
  }
}

/**
 * Mint an NFT using the given order and worker
 */
async function mintNft(
  order: OrderItem,
  worker: Worker,
  overrideNonce?: number,
): Promise<{ hash: string; tokenId: string; gasUsed: string }> {
  // Prepare metadata
  const metadataInfo: MetadataInfo = {
    name: order.name,
    description: order.description,
    image: order.image,
    attributes: order.attributes as any,
  };

  // Upload to IPFS
  const metadata = await uploadToIPFS(metadataInfo);
  if (!metadata.success || !metadata.urlTransactionHash) {
    throw new Error(`Failed to upload metadata to IPFS: ${metadata.message}`);
  }

  // Get contract interface
  const contract = new ethers.Contract(
    NFT_CONTRACT_ADDRESS,
    EZDRM_NFT_CONTRACT_ABI,
  );

  // Get current gas prices
  const feeData = await provider.getFeeData();
  if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
    throw new Error('Could not get fee data');
  }

  // Create transaction
  const nonce = overrideNonce !== undefined ? overrideNonce : worker.nonce;

  const safeMintData = contract.interface.encodeFunctionData('safeMint', [
    order.mintToAddress,
    metadata.urlTransactionHash,
  ]);

  const transaction = {
    to: NFT_CONTRACT_ADDRESS,
    data: safeMintData,
    gasLimit: DEFAULT_GAS_LIMIT,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    nonce: nonce,
    type: 2, // EIP-1559
    chainId: CHAIN_ID,
  };

  // Sign transaction with KMS
  const signedTx = await signTransactionWithKMS(worker.kmsKeyId, transaction);

  // Send transaction
  const txResponse = await provider.broadcastTransaction(signedTx);
  console.log(`Transaction submitted: ${txResponse.hash}`);

  // Wait for transaction to be mined
  const receipt = await txResponse.wait();
  if (!receipt) {
    throw new Error('Transaction receipt not available');
  }

  // Extract token ID from logs
  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsedLog = contract.interface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      if (parsedLog && parsedLog.name === 'Transfer') {
        tokenId = parsedLog.args[2].toString();
        console.log(`Found tokenId from Transfer event: ${tokenId}`);
        break;
      }
    } catch (error) {
      continue;
    }
  }

  if (!tokenId) {
    throw new Error('Failed to extract token ID from transaction logs');
  }

  return {
    hash: txResponse.hash,
    tokenId,
    gasUsed: receipt.gasUsed.toString(),
  };
}

/**
 * Upload metadata to IPFS via Pinata
 */
async function uploadToIPFS(
  metadataInfo: MetadataInfo,
): Promise<PinataResponse> {
  try {
    if (
      !PINATA_URL ||
      !PINATA_JWT ||
      !PINATA_API_KEY ||
      !PINATA_SECRET_API_KEY ||
      !PINATA_CLOUD_URL
    ) {
      throw new Error('Missing Pinata configuration');
    }

    // Create form data
    const form = new FormData();
    const metadataBlob = new Blob([JSON.stringify(metadataInfo)], {
      type: 'application/json',
    });
    form.append('file', metadataBlob, 'metadata.json');

    // Add pinata options
    const pinataOptions = JSON.stringify({
      cidVersion: 1,
    });
    form.append('pinataOptions', pinataOptions);

    // Upload to Pinata
    const response = await axios.post(PINATA_URL, form, {
      maxBodyLength: Infinity,
      timeout: 5000,
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${PINATA_JWT}`,
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_API_KEY,
      },
    });

    if (!response.data.IpfsHash) {
      throw new Error('Pinata response missing IpfsHash');
    }

    const ipfsUrl = `${PINATA_CLOUD_URL}${response.data.IpfsHash}`;
    return {
      success: true,
      urlTransactionHash: ipfsUrl,
      message: 'Metadata pinned successfully to IPFS',
    };
  } catch (error) {
    console.error('Error uploading to Pinata:', error);
    return {
      success: false,
      urlTransactionHash: null,
      message: error.message || 'Error uploading to Pinata',
    };
  }
}

/**
 * Sign a transaction using AWS KMS
 */
async function signTransactionWithKMS(
  kmsKeyId: string,
  transaction: any,
): Promise<string> {
  // This is a simplified version for demonstration
  // In a real implementation, you would use AWS KMS to sign the transaction
  // Here we're using a random wallet for demonstration

  console.log(`Signing transaction with KMS key: ${kmsKeyId}`);

  // In a real implementation, this would be replaced with KMS signing logic
  const randomWallet = ethers.Wallet.createRandom();

  // Fix the way we create an Ethers Transaction object
  const tx = ethers.Transaction.from(transaction);
  const signedTx = await randomWallet.signTransaction(tx);

  return signedTx;
}

/**
 * Get an order from DynamoDB
 */
async function getOrder(orderId: string): Promise<OrderItem | null> {
  const response = await ddbDocClient.send(
    new GetCommand({
      TableName: ORDERS_TABLE,
      Key: { id: orderId },
    }),
  );

  return response.Item as OrderItem | null;
}

/**
 * Update an order's status in DynamoDB
 */
async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  additionalAttributes?: Record<string, any>,
): Promise<void> {
  const updateExpression = ['set #status = :status', '#updatedAt = :updatedAt'];
  const expressionAttributeNames = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  };
  const expressionAttributeValues = {
    ':status': status,
    ':updatedAt': new Date().toISOString(),
  };

  // Add additional attributes if provided
  if (additionalAttributes) {
    Object.entries(additionalAttributes).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      updateExpression.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = value;
    });
  }

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { id: orderId },
      UpdateExpression: updateExpression.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }),
  );
}

/**
 * Get an available worker from DynamoDB
 */
async function getAvailableWorker(): Promise<Worker | null> {
  const response = await ddbDocClient.send(
    new GetCommand({
      TableName: WORKERS_TABLE,
      Key: { id: 'worker-1' }, // For simplicity, using a fixed worker ID
    }),
  );

  if (!response.Item) {
    return null;
  }

  const worker = response.Item as Worker;

  // Mark worker as busy
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: WORKERS_TABLE,
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

/**
 * Get the currently processing worker (the one marked as BUSY)
 */
async function getCurrentlyProcessingWorker(): Promise<Worker | null> {
  // For simplicity, using a fixed worker ID
  // In a real implementation, you would query for workers with BUSY status
  const response = await ddbDocClient.send(
    new GetCommand({
      TableName: WORKERS_TABLE,
      Key: { id: 'worker-1' },
    }),
  );

  if (!response.Item) {
    return null;
  }

  const worker = response.Item as Worker;

  if (worker.status !== WorkerStatus.BUSY) {
    return null;
  }

  return worker;
}

/**
 * Update worker stats in DynamoDB
 */
async function updateWorkerStats(
  workerId: string,
  updates: Partial<Worker>,
): Promise<void> {
  const updateExpression = ['set #updatedAt = :updatedAt'];
  const expressionAttributeNames = {
    '#updatedAt': 'updatedAt',
  };
  const expressionAttributeValues = {
    ':updatedAt': new Date().toISOString(),
  };

  // Add updates
  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpression.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  });

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: WORKERS_TABLE,
      Key: { id: workerId },
      UpdateExpression: updateExpression.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }),
  );
}

/**
 * Send a message to the Dead Letter Queue
 */
async function sendToDeadLetterQueue(
  messageBody: string,
  error: string,
): Promise<void> {
  if (!DEAD_LETTER_QUEUE_URL) {
    console.error('Dead Letter Queue URL not configured');
    return;
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: DEAD_LETTER_QUEUE_URL,
      MessageBody: JSON.stringify({
        originalMessage: messageBody,
        error,
        timestamp: new Date().toISOString(),
      }),
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
