import { NftService } from './nft.service';
import { MintNftDto } from './dto/mint-nft.dto';
export declare class NftController {
    private readonly nftService;
    constructor(nftService: NftService);
    mintNft(mintNftDto: MintNftDto): Promise<{
        success: boolean;
        data: {
            hash: string;
            uri: string | null;
        };
        message: string;
    }>;
}
