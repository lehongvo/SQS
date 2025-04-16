"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_sns_1 = require("@aws-sdk/client-sns");
const ethers_1 = require("ethers");
const WORKERS_TABLE = process.env.WORKERS_TABLE || '';
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN || '';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS || '';
const AWS_REGION = process.env.REGION || 'ap-southeast-1';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || '';
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021', 10);
const CHAIN_NAME = process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon';
const MIN_WORKER_BALANCE = ethers_1.ethers.parseEther('0.1');
const LOW_BALANCE_THRESHOLD = ethers_1.ethers.parseEther('0.5');
const TOP_UP_AMOUNT = ethers_1.ethers.parseEther('1');
var WorkerStatus;
(function (WorkerStatus) {
    WorkerStatus["AVAILABLE"] = "AVAILABLE";
    WorkerStatus["BUSY"] = "BUSY";
    WorkerStatus["DISABLED"] = "DISABLED";
})(WorkerStatus || (WorkerStatus = {}));
const ddbClient = new client_dynamodb_1.DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient);
const snsClient = new client_sns_1.SNSClient({ region: AWS_REGION });
const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name: CHAIN_NAME,
});
const handler = async (event, context) => {
    console.log('Starting balance monitoring check');
    try {
        const workers = await getAllWorkers();
        console.log(`Found ${workers.length} workers to check`);
        const masterBalance = await provider.getBalance(MASTER_WALLET_ADDRESS);
        console.log(`Master wallet balance: ${ethers_1.ethers.formatEther(masterBalance)} ETH`);
        if (masterBalance < LOW_BALANCE_THRESHOLD) {
            await publishAlert('Master Wallet Low Balance', `Master wallet (${MASTER_WALLET_ADDRESS}) has low balance: ${ethers_1.ethers.formatEther(masterBalance)} ETH`);
        }
        for (const worker of workers) {
            try {
                const onchainBalance = await provider.getBalance(worker.address);
                console.log(`Worker ${worker.id} (${worker.address}) balance: ${ethers_1.ethers.formatEther(onchainBalance)} ETH`);
                await updateWorkerBalance(worker.id, onchainBalance.toString());
                if (onchainBalance < MIN_WORKER_BALANCE) {
                    await publishAlert('Worker Low Balance', `Worker ${worker.id} (${worker.address}) has low balance: ${ethers_1.ethers.formatEther(onchainBalance)} ETH. Funding required.`);
                    console.log(`Worker ${worker.id} needs funding. Would transfer ${ethers_1.ethers.formatEther(TOP_UP_AMOUNT)} ETH from master wallet.`);
                }
            }
            catch (error) {
                console.error(`Error checking worker ${worker.id} balance: ${error.message}`, error.stack);
            }
        }
        console.log('Balance monitoring check completed successfully');
    }
    catch (error) {
        console.error(`Error in balance monitor: ${error.message}`, error.stack);
        await publishAlert('Balance Monitor Error', `Failed to run balance monitoring: ${error.message}`);
        throw error;
    }
};
exports.handler = handler;
async function getAllWorkers() {
    const response = await ddbDocClient.send(new lib_dynamodb_1.ScanCommand({
        TableName: WORKERS_TABLE,
    }));
    return (response.Items || []);
}
async function updateWorkerBalance(workerId, balance) {
    await ddbDocClient.send(new lib_dynamodb_1.UpdateCommand({
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
//# sourceMappingURL=balance-monitor.js.map