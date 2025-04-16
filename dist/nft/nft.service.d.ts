import { MintNftDto } from './dto/mint-nft.dto';
export declare class NftService {
    mintNft(mintNftDto: MintNftDto): Promise<{
        success: boolean;
        data: {
            hash: string;
            uri: string | null;
            tokenId: string;
            blockNumber: number;
        };
        message: string;
    }>;
}
