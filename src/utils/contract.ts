import { ethers } from 'ethers';
import { EZDRM_NFT_CONTRACT_ABI } from './abi';
import axios from 'axios';
import { DEFAULT_GAS_LIMIT } from './constant';

interface PinataResponse {
  success: boolean;
  urlTransactionHash: string | null;
  message: string;
}

export interface MetadataInfo {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

// Singleton provider and contract instances
let providerInstance: ethers.JsonRpcProvider | null = null;
let contractInstance: ethers.Contract | null = null;
let walletInstance: ethers.Wallet | null = null;

// Cache for gas prices - refresh every 10 blocks
let cachedFeeData: ethers.FeeData | null = null;
let lastFeeUpdateBlock = 0;

/**
 * Initialize the blockchain connection
 * This should be called when the app starts
 */
export const initializeBlockchainConnection = () => {
  try {
    // Parse chain ID properly and ensure it's a valid number
    const chainId = parseInt(
      process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID || '2021',
      10,
    );
    if (isNaN(chainId)) {
      throw new Error(
        `Invalid chain ID: ${process.env.NEXT_PUBLIC_ALLOWED_CHAIN_ID}`,
      );
    }

    // Ensure network name is a non-empty string
    const networkName = process.env.NEXT_PUBLIC_NAME_OF_CHAIN || 'saigon';
    if (!networkName) {
      throw new Error('Network name is required');
    }

    // Create provider with validated network params
    providerInstance = new ethers.JsonRpcProvider(
      process.env.NEXT_PUBLIC_RPC_URL,
      {
        chainId,
        name: networkName,
      },
      { staticNetwork: true },
    );

    walletInstance = new ethers.Wallet(
      process.env.PRIVATE_KEY!,
      providerInstance,
    );
    contractInstance = new ethers.Contract(
      process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS!,
      EZDRM_NFT_CONTRACT_ABI,
      walletInstance,
    );

    console.log('Blockchain connection initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing blockchain connection:', error);
    return false;
  }
};

/**
 * Get the current fee data, with caching
 */
const getFeeDataWithCache = async () => {
  if (!providerInstance) {
    await initializeBlockchainConnection();
  }

  try {
    const latestBlock = await providerInstance!.getBlock('latest');
    if (!latestBlock) throw new Error('Could not get latest block');

    // If we have cached data and it's recent enough, use it
    if (
      cachedFeeData &&
      latestBlock.number - lastFeeUpdateBlock < 10 // Cache for 10 blocks
    ) {
      return {
        feeData: cachedFeeData,
        latestBlock,
      };
    }

    // Otherwise refresh the cache
    const feeData = await providerInstance!.getFeeData();
    if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
      throw new Error('Could not get fee data');
    }

    cachedFeeData = feeData;
    lastFeeUpdateBlock = latestBlock.number;

    return {
      feeData,
      latestBlock,
    };
  } catch (error) {
    console.error('Error getting fee data:', error);
    throw error;
  }
};

// Pre-calculated gas limit for common operations - can be adjusted based on contract
export const mintNft = async (
  metadataInfo: MetadataInfo,
  mintToAddress: string,
): Promise<{
  hash: string;
  uri: string | null;
  // tokenId: string;
  // blockNumber: number;
}> => {
  try {
    // Make sure we have our singleton instances
    if (!providerInstance || !contractInstance || !walletInstance) {
      await initializeBlockchainConnection();
    }

    // Use Promise.all for concurrent operations
    const [{ feeData, latestBlock }, metadata] = await Promise.all([
      getFeeDataWithCache(),
      uploadFileToAppPinata(metadataInfo),
    ]);

    const uri = metadata.urlTransactionHash;

    // Apply EIP-1559 transaction with proper gasLimit
    const tx = await contractInstance!.safeMint(mintToAddress, uri, {
      gasLimit: DEFAULT_GAS_LIMIT, // Apply the gas limit here
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      from: walletInstance!.address,
    });

    // console.log('Transaction submitted:', tx.hash);

    // // For very fast response, you could return the hash immediately and handle confirmation separately
    // // But for now we'll still wait for receipt to maintain compatibility
    // const receipt = await tx.wait();

    // let tokenId = '0';
    // // Process logs more efficiently with early return
    // for (const log of receipt.logs) {
    //   try {
    //     const parsedLog = contractInstance!.interface.parseLog({
    //       topics: log.topics,
    //       data: log.data,
    //     });

    //     if (parsedLog && parsedLog.name === 'Transfer') {
    //       // Transfer(address from, address to, uint256 tokenId)
    //       tokenId = parsedLog.args[2].toString();
    //       console.log('Found tokenId from Transfer event:', tokenId);
    //       break;
    //     }
    //   } catch (error) {
    //     continue;
    //   }
    // }

    return {
      hash: tx.hash,
      uri: uri,
      // tokenId,
      // blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error('Error in mintNft:', error);
    throw error;
  }
};

// Improved Pinata upload function with timeout and optimized headers
const uploadFileToAppPinata = async (
  metadataInfo: MetadataInfo,
): Promise<PinataResponse> => {
  try {
    // Validate environment variables
    const url = process.env.PINATA_URL;
    const JWT = process.env.PINATA_JWT;
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;
    const PINATA_CLOUD_URL = process.env.PINATA_CLOUD_URL;

    if (
      !url ||
      !JWT ||
      !PINATA_API_KEY ||
      !PINATA_SECRET_API_KEY ||
      !PINATA_CLOUD_URL
    ) {
      console.error('Missing Pinata configuration');
      return {
        success: false,
        urlTransactionHash: null,
        message: 'Missing Pinata configuration in environment variables',
      };
    }

    // Create form data
    const form = new FormData();
    const metadataBlob = new Blob([JSON.stringify(metadataInfo)], {
      type: 'application/json',
    });
    form.append('file', metadataBlob, 'metadata.json');

    // Add pinata options - simplified for speed
    const pinataOptions = JSON.stringify({
      cidVersion: 1,
    });
    form.append('pinataOptions', pinataOptions);

    // Upload to Pinata with timeout
    const response = await axios.post(url, form, {
      maxBodyLength: Infinity,
      timeout: 5000, // 5 second timeout
      headers: {
        'Content-Type': `multipart/form-data`,
        Authorization: `Bearer ${JWT}`,
        // Use only one auth method to reduce header size
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
  } catch (error: any) {
    console.error('Error when uploading to Pinata:', {
      message: error.message,
      response: error.response?.data,
    });
    return {
      success: false,
      urlTransactionHash: null,
      message:
        error.response?.data?.error?.details ||
        error.message ||
        'Error uploading to Pinata',
    };
  }
};
