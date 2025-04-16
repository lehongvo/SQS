"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_sns_1 = require("@aws-sdk/client-sns");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const ethers_1 = require("ethers");
const axios_1 = require("axios");
const abi_1 = require("../utils/abi");
const DEFAULT_GAS_LIMIT = 350000n;
const ORDERS_TABLE = process.env.ORDERS_TABLE || '';
const WORKERS_TABLE = process.env.WORKERS_TABLE || '';
const DEAD_LETTER_QUEUE_URL = process.env.DEAD_LETTER_QUEUE_URL || '';
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN || '';
const AWS_REGION = process.env.REGION || 'ap-southeast-1';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || '';
const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || '';
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021', 10);
const CHAIN_NAME = process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon';
const PINATA_URL = process.env.PINATA_URL || '';
const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_API_KEY = process.env.PINATA_API_KEY || '';
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || '';
const PINATA_CLOUD_URL = process.env.PINATA_CLOUD_URL || '';
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PENDING"] = "PENDING";
    OrderStatus["PROCESSING"] = "PROCESSING";
    OrderStatus["COMPLETED"] = "COMPLETED";
    OrderStatus["FAILED"] = "FAILED";
})(OrderStatus || (OrderStatus = {}));
var WorkerStatus;
(function (WorkerStatus) {
    WorkerStatus["AVAILABLE"] = "AVAILABLE";
    WorkerStatus["BUSY"] = "BUSY";
    WorkerStatus["DISABLED"] = "DISABLED";
})(WorkerStatus || (WorkerStatus = {}));
const ddbClient = new client_dynamodb_1.DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient);
const snsClient = new client_sns_1.SNSClient({ region: AWS_REGION });
const sqsClient = new client_sqs_1.SQSClient({ region: AWS_REGION });
const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name: CHAIN_NAME,
});
const handler = async (event, context) => {
    console.log(`Starting order processing with ${event.Records.length} records`);
    for (const record of event.Records) {
        try {
            const message = JSON.parse(record.body);
            console.log(`Processing message: ${JSON.stringify(message)}`);
            if (message.type === 'SINGLE_ORDER') {
                await processSingleOrder(message.orderId);
            }
            else if (message.type === 'BATCH_ORDER') {
                await processBatchOrders(message.orderIds);
            }
            else {
                console.error(`Unknown message type: ${message.type}`);
                await sendToDeadLetterQueue(record.body, 'Unknown message type');
            }
        }
        catch (error) {
            console.error(`Error processing record: ${error.message}`, error.stack);
            await publishAlert('Order Processing Error', `Failed to process SQS message: ${error.message}`);
            await sendToDeadLetterQueue(record.body, error.message);
        }
    }
};
exports.handler = handler;
async function processSingleOrder(orderId) {
    console.log(`Processing single order ${orderId}`);
    try {
        const order = await getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }
        if (order.status !== OrderStatus.PENDING) {
            console.log(`Order ${orderId} is already in ${order.status} state. Skipping.`);
            return;
        }
        await updateOrderStatus(orderId, OrderStatus.PROCESSING);
        const worker = await getAvailableWorker();
        if (!worker) {
            throw new Error('No available workers found');
        }
        const balance = await provider.getBalance(worker.address);
        if (balance < ethers_1.ethers.parseEther('0.01')) {
            await publishAlert('Low Worker Balance', `Worker ${worker.id} (${worker.address}) has low balance: ${ethers_1.ethers.formatEther(balance)} ETH`);
            throw new Error(`Worker ${worker.id} has insufficient balance`);
        }
        const result = await mintNft(order, worker);
        await updateOrderStatus(orderId, OrderStatus.COMPLETED, {
            transactionHash: result.hash,
            tokenId: result.tokenId,
        });
        await updateWorkerStats(worker.id, {
            nonce: worker.nonce + 1,
            totalMinted: worker.totalMinted + 1,
            successfulTransactions: worker.successfulTransactions + 1,
            totalGasUsed: (BigInt(worker.totalGasUsed) + BigInt(result.gasUsed)).toString(),
            status: WorkerStatus.AVAILABLE,
        });
        console.log(`Successfully processed order ${orderId}`);
    }
    catch (error) {
        console.error(`Error processing order ${orderId}: ${error.message}`, error.stack);
        await updateOrderStatus(orderId, OrderStatus.FAILED, {
            errorMessage: error.message,
        });
        try {
            const worker = await getCurrentlyProcessingWorker();
            if (worker) {
                await updateWorkerStats(worker.id, {
                    failedTransactions: worker.failedTransactions + 1,
                    status: WorkerStatus.AVAILABLE,
                });
            }
        }
        catch (workerError) {
            console.error(`Error updating worker: ${workerError.message}`);
        }
        await publishAlert('Order Processing Failed', `Failed to process order ${orderId}: ${error.message}`);
        throw error;
    }
}
async function processBatchOrders(orderIds) {
    console.log(`Processing batch of ${orderIds.length} orders`);
    if (orderIds.length === 0) {
        console.log('Empty batch, nothing to process');
        return;
    }
    const batchId = `batch-${Date.now()}`;
    console.log(`Batch ID: ${batchId}`);
    try {
        const worker = await getAvailableWorker();
        if (!worker) {
            throw new Error('No available workers found');
        }
        const balance = await provider.getBalance(worker.address);
        const estimatedGasNeeded = ethers_1.ethers.parseEther('0.01') * BigInt(orderIds.length);
        if (balance < estimatedGasNeeded) {
            await publishAlert('Low Worker Balance for Batch', `Worker ${worker.id} (${worker.address}) has low balance for batch: ${ethers_1.ethers.formatEther(balance)} ETH, needed ~${ethers_1.ethers.formatEther(estimatedGasNeeded)} ETH`);
            throw new Error(`Worker ${worker.id} has insufficient balance for batch`);
        }
        for (const orderId of orderIds) {
            await updateOrderStatus(orderId, OrderStatus.PROCESSING, { batchId });
        }
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
                const result = await mintNft(order, worker, nonce);
                await updateOrderStatus(orderId, OrderStatus.COMPLETED, {
                    transactionHash: result.hash,
                    tokenId: result.tokenId,
                });
                successCount++;
                totalGasUsed += BigInt(result.gasUsed);
                nonce++;
            }
            catch (error) {
                console.error(`Error processing order ${orderId} in batch ${batchId}: ${error.message}`);
                await updateOrderStatus(orderId, OrderStatus.FAILED, {
                    errorMessage: error.message,
                });
                failureCount++;
            }
        }
        await updateWorkerStats(worker.id, {
            nonce,
            totalMinted: worker.totalMinted + successCount,
            successfulTransactions: worker.successfulTransactions + successCount,
            failedTransactions: worker.failedTransactions + failureCount,
            totalGasUsed: (BigInt(worker.totalGasUsed) + totalGasUsed).toString(),
            status: WorkerStatus.AVAILABLE,
        });
        console.log(`Batch ${batchId} completed with ${successCount} successes and ${failureCount} failures`);
        if (failureCount > 0) {
            await publishAlert('Batch Processing Completed with Errors', `Batch ${batchId} completed with ${successCount} successes and ${failureCount} failures`);
        }
    }
    catch (error) {
        console.error(`Error processing batch: ${error.message}`, error.stack);
        for (const orderId of orderIds) {
            const order = await getOrder(orderId);
            if (order && order.status === OrderStatus.PROCESSING) {
                await updateOrderStatus(orderId, OrderStatus.FAILED, {
                    errorMessage: `Batch processing error: ${error.message}`,
                });
            }
        }
        try {
            const worker = await getCurrentlyProcessingWorker();
            if (worker) {
                await updateWorkerStats(worker.id, {
                    failedTransactions: worker.failedTransactions + 1,
                    status: WorkerStatus.AVAILABLE,
                });
            }
        }
        catch (workerError) {
            console.error(`Error updating worker: ${workerError.message}`);
        }
        await publishAlert('Batch Processing Failed', `Failed to process batch: ${error.message}`);
        throw error;
    }
}
async function mintNft(order, worker, overrideNonce) {
    const metadataInfo = {
        name: order.name,
        description: order.description,
        image: order.image,
        attributes: order.attributes,
    };
    const metadata = await uploadToIPFS(metadataInfo);
    if (!metadata.success || !metadata.urlTransactionHash) {
        throw new Error(`Failed to upload metadata to IPFS: ${metadata.message}`);
    }
    const contract = new ethers_1.ethers.Contract(NFT_CONTRACT_ADDRESS, abi_1.EZDRM_NFT_CONTRACT_ABI);
    const feeData = await provider.getFeeData();
    if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        throw new Error('Could not get fee data');
    }
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
        type: 2,
        chainId: CHAIN_ID,
    };
    const signedTx = await signTransactionWithKMS(worker.kmsKeyId, transaction);
    const txResponse = await provider.broadcastTransaction(signedTx);
    console.log(`Transaction submitted: ${txResponse.hash}`);
    const receipt = await txResponse.wait();
    if (!receipt) {
        throw new Error('Transaction receipt not available');
    }
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
        }
        catch (error) {
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
async function uploadToIPFS(metadataInfo) {
    try {
        if (!PINATA_URL ||
            !PINATA_JWT ||
            !PINATA_API_KEY ||
            !PINATA_SECRET_API_KEY ||
            !PINATA_CLOUD_URL) {
            throw new Error('Missing Pinata configuration');
        }
        const form = new FormData();
        const metadataBlob = new Blob([JSON.stringify(metadataInfo)], {
            type: 'application/json',
        });
        form.append('file', metadataBlob, 'metadata.json');
        const pinataOptions = JSON.stringify({
            cidVersion: 1,
        });
        form.append('pinataOptions', pinataOptions);
        const response = await axios_1.default.post(PINATA_URL, form, {
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
    }
    catch (error) {
        console.error('Error uploading to Pinata:', error);
        return {
            success: false,
            urlTransactionHash: null,
            message: error.message || 'Error uploading to Pinata',
        };
    }
}
async function signTransactionWithKMS(kmsKeyId, transaction) {
    console.log(`Signing transaction with KMS key: ${kmsKeyId}`);
    const randomWallet = ethers_1.ethers.Wallet.createRandom();
    const tx = ethers_1.ethers.Transaction.from(transaction);
    const signedTx = await randomWallet.signTransaction(tx);
    return signedTx;
}
async function getOrder(orderId) {
    const response = await ddbDocClient.send(new lib_dynamodb_1.GetCommand({
        TableName: ORDERS_TABLE,
        Key: { id: orderId },
    }));
    return response.Item;
}
async function updateOrderStatus(orderId, status, additionalAttributes) {
    const updateExpression = ['set #status = :status', '#updatedAt = :updatedAt'];
    const expressionAttributeNames = {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues = {
        ':status': status,
        ':updatedAt': new Date().toISOString(),
    };
    if (additionalAttributes) {
        Object.entries(additionalAttributes).forEach(([key, value], index) => {
            const attrName = `#attr${index}`;
            const attrValue = `:val${index}`;
            updateExpression.push(`${attrName} = ${attrValue}`);
            expressionAttributeNames[attrName] = key;
            expressionAttributeValues[attrValue] = value;
        });
    }
    await ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { id: orderId },
        UpdateExpression: updateExpression.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
    }));
}
async function getAvailableWorker() {
    const response = await ddbDocClient.send(new lib_dynamodb_1.GetCommand({
        TableName: WORKERS_TABLE,
        Key: { id: 'worker-1' },
    }));
    if (!response.Item) {
        return null;
    }
    const worker = response.Item;
    await ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
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
    }));
    return worker;
}
async function getCurrentlyProcessingWorker() {
    const response = await ddbDocClient.send(new lib_dynamodb_1.GetCommand({
        TableName: WORKERS_TABLE,
        Key: { id: 'worker-1' },
    }));
    if (!response.Item) {
        return null;
    }
    const worker = response.Item;
    if (worker.status !== WorkerStatus.BUSY) {
        return null;
    }
    return worker;
}
async function updateWorkerStats(workerId, updates) {
    const updateExpression = ['set #updatedAt = :updatedAt'];
    const expressionAttributeNames = {
        '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues = {
        ':updatedAt': new Date().toISOString(),
    };
    Object.entries(updates).forEach(([key, value], index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpression.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
    });
    await ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: WORKERS_TABLE,
        Key: { id: workerId },
        UpdateExpression: updateExpression.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
    }));
}
async function sendToDeadLetterQueue(messageBody, error) {
    if (!DEAD_LETTER_QUEUE_URL) {
        console.error('Dead Letter Queue URL not configured');
        return;
    }
    await sqsClient.send(new client_sqs_1.SendMessageCommand({
        QueueUrl: DEAD_LETTER_QUEUE_URL,
        MessageBody: JSON.stringify({
            originalMessage: messageBody,
            error,
            timestamp: new Date().toISOString(),
        }),
    }));
}
async function publishAlert(subject, message) {
    if (!ALERT_TOPIC_ARN) {
        console.error('Alert Topic ARN not configured');
        return;
    }
    await snsClient.send(new client_sns_1.PublishCommand({
        TopicArn: ALERT_TOPIC_ARN,
        Subject: `[NFT Mint] ${subject}`,
        Message: message,
    }));
}
//# sourceMappingURL=order-processor.js.map