"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintNft = exports.initializeBlockchainConnection = void 0;
const ethers_1 = require("ethers");
const abi_1 = require("./abi");
const axios_1 = require("axios");
const constant_1 = require("./constant");
let providerInstance = null;
let contractInstance = null;
let walletInstance = null;
let cachedFeeData = null;
let lastFeeUpdateBlock = 0;
const initializeBlockchainConnection = () => {
    try {
        const chainId = parseInt(process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021', 10);
        if (isNaN(chainId)) {
            throw new Error(`Invalid chain ID: ${process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID}`);
        }
        const networkName = process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon';
        if (!networkName) {
            throw new Error('Network name is required');
        }
        providerInstance = new ethers_1.ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL, {
            chainId,
            name: networkName,
        }, { staticNetwork: true });
        walletInstance = new ethers_1.ethers.Wallet(process.env.PRIVATE_KEY, providerInstance);
        contractInstance = new ethers_1.ethers.Contract(process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS, abi_1.EZDRM_NFT_CONTRACT_ABI, walletInstance);
        console.log('Blockchain connection initialized successfully');
        return true;
    }
    catch (error) {
        console.error('Error initializing blockchain connection:', error);
        return false;
    }
};
exports.initializeBlockchainConnection = initializeBlockchainConnection;
const getFeeDataWithCache = async () => {
    if (!providerInstance) {
        await (0, exports.initializeBlockchainConnection)();
    }
    try {
        const latestBlock = await providerInstance.getBlock('latest');
        if (!latestBlock)
            throw new Error('Could not get latest block');
        if (cachedFeeData &&
            latestBlock.number - lastFeeUpdateBlock < 10) {
            return {
                feeData: cachedFeeData,
                latestBlock,
            };
        }
        const feeData = await providerInstance.getFeeData();
        if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
            throw new Error('Could not get fee data');
        }
        cachedFeeData = feeData;
        lastFeeUpdateBlock = latestBlock.number;
        return {
            feeData,
            latestBlock,
        };
    }
    catch (error) {
        console.error('Error getting fee data:', error);
        throw error;
    }
};
const mintNft = async (metadataInfo, mintToAddress) => {
    try {
        if (!providerInstance || !contractInstance || !walletInstance) {
            await (0, exports.initializeBlockchainConnection)();
        }
        const [{ feeData, latestBlock }, metadata] = await Promise.all([
            getFeeDataWithCache(),
            uploadFileToAppPinata(metadataInfo),
        ]);
        const uri = metadata.urlTransactionHash;
        const tx = await contractInstance.safeMint(mintToAddress, uri, {
            gasLimit: constant_1.DEFAULT_GAS_LIMIT,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            from: walletInstance.address,
        });
        return {
            hash: tx.hash,
            uri: uri,
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
};
//# sourceMappingURL=contract.js.map