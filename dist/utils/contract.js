"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintNft = void 0;
const ethers_1 = require("ethers");
const abi_1 = require("./abi");
const axios_1 = require("axios");
const mintNft = async (metadataInfo, mintToAddress) => {
    try {
        const chainId = parseInt(process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021', 10);
        if (isNaN(chainId)) {
            throw new Error(`Invalid chain ID: ${process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID}`);
        }
        const networkName = process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon';
        if (!networkName) {
            throw new Error('Network name is required');
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL, {
            chainId,
            name: networkName,
        }, { staticNetwork: true });
        const wallet = new ethers_1.ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const contract = new ethers_1.ethers.Contract(process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS, abi_1.EZDRM_NFT_CONTRACT_ABI, wallet);
        const [latestBlock, feeData, metadata] = await Promise.all([
            provider.getBlock('latest'),
            provider.getFeeData(),
            uploadFileToAppPinata(metadataInfo),
        ]);
        if (!latestBlock)
            throw new Error('Could not get latest block');
        const baseFee = latestBlock.baseFeePerGas;
        if (!baseFee)
            throw new Error('Could not get base fee');
        if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
            throw new Error('Could not get fee data');
        }
        const uri = metadata.urlTransactionHash;
        const etmGas = await contract.safeMint.estimateGas(mintToAddress, uri, {
            from: wallet.address,
        });
        const tx = await contract.safeMint(mintToAddress, uri, {
            gasLimit: etmGas,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            from: wallet.address,
        });
        const receipt = await tx.wait();
        let tokenId = '0';
        for (const log of receipt.logs) {
            try {
                const parsedLog = contract.interface.parseLog({
                    topics: log.topics,
                    data: log.data,
                });
                if (parsedLog && parsedLog.name === 'Transfer') {
                    tokenId = parsedLog.args[2].toString();
                    console.log('Found tokenId from Transfer event:', tokenId);
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        return {
            hash: tx.hash,
            uri: uri,
            tokenId,
            blockNumber: receipt.blockNumber,
        };
    }
    catch (error) {
        console.error('Error in mintNft:', error);
        throw error;
    }
};
exports.mintNft = mintNft;
const uploadFileToAppPinata = async (metadataInfo) => {
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
            console.error('Missing Pinata configuration:', {
                url: !!url,
                jwt: !!JWT,
                apiKey: !!PINATA_API_KEY,
                secretKey: !!PINATA_SECRET_API_KEY,
                cloudUrl: !!PINATA_CLOUD_URL,
            });
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
            customPinPolicy: {
                regions: [
                    {
                        id: 'FRA1',
                        desiredReplicationCount: 1,
                    },
                    {
                        id: 'NYC1',
                        desiredReplicationCount: 1,
                    },
                ],
            },
        });
        form.append('pinataOptions', pinataOptions);
        const response = await axios_1.default.post(url, form, {
            maxBodyLength: Infinity,
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
        console.error('Error when mint nft:', {
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
};
//# sourceMappingURL=contract.js.map