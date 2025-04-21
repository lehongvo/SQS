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
var NftMintProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NftMintProcessor = void 0;
const common_1 = require("@nestjs/common");
const ethers_1 = require("ethers");
const abi_1 = require("../../utils/abi");
const constant_1 = require("../../utils/constant");
const orders_service_1 = require("../../orders/orders.service");
const wallets_service_1 = require("../../wallets/wallets.service");
const order_interface_1 = require("../../orders/interfaces/order.interface");
const axios_1 = require("axios");
let NftMintProcessor = NftMintProcessor_1 = class NftMintProcessor {
    ordersService;
    walletsService;
    logger = new common_1.Logger(NftMintProcessor_1.name);
    constructor(ordersService, walletsService) {
        this.ordersService = ordersService;
        this.walletsService = walletsService;
    }
    async processBatch(batchId, orderIds) {
        this.logger.log(`Processing batch ${batchId} with ${orderIds.length} orders`);
        try {
            const worker = await this.getWorker();
            this.logger.log(`Using worker ${worker.address} for batch ${batchId}`);
            const provider = new ethers_1.ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL, {
                chainId: parseInt(process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021', 10),
                name: process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon',
            });
            const walletInstance = new ethers_1.ethers.Wallet(worker.kmsKeyId || '', provider);
            const contract = new ethers_1.ethers.Contract(process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS, abi_1.EZDRM_NFT_CONTRACT_ABI, walletInstance);
            const onchainNonce = await provider.getTransactionCount(worker.address);
            const nonce = Math.max(worker.nonce, onchainNonce);
            let currentNonce = nonce;
            let totalGasUsed = 0n;
            for (const orderId of orderIds) {
                try {
                    const result = await this.processIndividualOrder(orderId, contract, currentNonce, walletInstance, provider);
                    if (result.success) {
                        totalGasUsed += BigInt(result.gasUsed || 0);
                        currentNonce++;
                    }
                }
                catch (error) {
                    this.logger.error(`Error processing order ${orderId}`, error);
                }
            }
            this.releaseWorker(worker.id, { nonce: currentNonce });
            this.logger.log(`Batch ${batchId} completed. Total gas used: ${totalGasUsed}`);
        }
        catch (error) {
            this.logger.error(`Error processing batch ${batchId}`, error);
            throw error;
        }
    }

    async processIndividualOrder(orderId, contract, nonce, wallet, provider) {
        try {
            const order = await this.ordersService.findById(orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found`);
            }
            if (order.status !== order_interface_1.OrderStatus.PROCESSING) {
                this.logger.log(`Order ${orderId} is not in PROCESSING state, skipping`);
                return { success: false };
            }
            const metadataInfo = {
                name: order.name,
                description: order.description,
                image: order.image,
                attributes: order.attributes?.map((attr) => ({
                    trait_type: attr.trait_type,
                    value: attr.value,
                })),
            };
            const metadata = await this.uploadToIPFS(metadataInfo);
            if (!metadata.success || !metadata.urlTransactionHash) {
                throw new Error(`Failed to upload metadata to IPFS: ${metadata.message}`);
            }
            const feeData = await provider.getFeeData();
            if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
                throw new Error('Could not get fee data');
            }
            const tx = await contract.safeMint(order.mintToAddress, metadata.urlTransactionHash, {
                gasLimit: constant_1.DEFAULT_GAS_LIMIT,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
                nonce: nonce,
            });
            const receipt = await tx.wait();
            let tokenId = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = contract.interface.parseLog({
                        topics: log.topics,
                        data: log.data,
                    });
                    if (parsedLog && parsedLog.name === 'Transfer') {
                        tokenId = parsedLog.args[2].toString();
                        break;
                    }
                }
                catch (error) {
                    continue;
                }
            }
            await this.ordersService.updateOrderStatus(orderId, order.status, {
                transactionHash: tx.hash,
                tokenId: tokenId ? String(tokenId) : undefined,
            });
            this.logger.log(`Successfully minted NFT for order ${orderId}. Transaction: ${tx.hash}. Token ID: ${tokenId}`);
            return {
                success: true,
                gasUsed: Number(receipt.gasUsed || 0),
            };
        }
        catch (error) {
            this.logger.error(`Error processing order ${orderId}`, error);
            await this.ordersService.updateOrderStatus(orderId, order_interface_1.OrderStatus.FAILED, {
                errorMessage: error.message || 'Unknown error',
            });
            return { success: false };
        }
    }
    async uploadToIPFS(metadataInfo) {
        try {
            const url = process.env.PINATA_URL;
            const JWT = process.env.PINATA_JWT;
            const PINATA_API_KEY = process.env.PINATA_API_KEY;
            const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;
            const PINATA_CLOUD_URL = process.env.PINATA_CLOUD_URL;
            if (!url ||
                !JWT ||
                !PINATA_API_KEY ||
                !PINATA_SECRET_API_KEY ||
                !PINATA_CLOUD_URL) {
                console.error('Missing Pinata configuration');
                return {
                    success: false,
                    urlTransactionHash: null,
                    message: 'Missing Pinata configuration in environment variables',
                };
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
            const response = await axios_1.default.post(url, form, {
                maxBodyLength: Infinity,
                timeout: 5000,
                headers: {
                    'Content-Type': `multipart/form-data`,
                    Authorization: `Bearer ${JWT}`,
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_API_KEY,
                },
            });
            if (!response.data.IpfsHash) {
                console.error('Pinata response missing IpfsHash:', response.data);
                return {
                    success: false,
                    urlTransactionHash: null,
                    message: 'Failed to get IPFS hash from Pinata',
                };
            }
            const ipfsUrl = `${PINATA_CLOUD_URL}${response.data.IpfsHash}`;
            return {
                success: true,
                urlTransactionHash: ipfsUrl,
                message: 'Metadata pinned successfully to IPFS',
            };
        }
        catch (error) {
            console.error('Error when uploading to Pinata:', {
                message: error.message,
                response: error.response?.data,
            });
            return {
                success: false,
                urlTransactionHash: null,
                message: error.response?.data?.error?.details ||
                    error.message ||
                    'Error uploading to Pinata',
            };
        }
    }
    async getWorker() {
        return {
            id: 'worker-1',
            address: '0x123456789',
            kmsKeyId: process.env.PRIVATE_KEY || '',
            status: 'AVAILABLE',
            nonce: 0,
            balance: '0',
            totalMinted: 0,
            failedTransactions: 0,
            successfulTransactions: 0,
            totalGasUsed: '0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }
    async releaseWorker(workerId, data) {
        this.logger.log(`Released worker ${workerId} with data: ${JSON.stringify(data)}`);
    }
};
exports.NftMintProcessor = NftMintProcessor;
exports.NftMintProcessor = NftMintProcessor = NftMintProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
    wallets_service_1.WalletsService])
], NftMintProcessor);
//# sourceMappingURL=nft-mint.processor.js.map