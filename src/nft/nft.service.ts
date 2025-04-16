import { Injectable, BadRequestException } from '@nestjs/common';
import { mintNft, MetadataInfo } from '../utils/contract';
import { MintNftDto } from './dto/mint-nft.dto';

@Injectable()
export class NftService {
  async mintNft(mintNftDto: MintNftDto) {
    try {
      const { mintToAddress, ...metadataInfo } = mintNftDto;

      const result = await mintNft(metadataInfo as MetadataInfo, mintToAddress);

      return {
        success: true,
        data: result,
        message: 'NFT minted successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to mint NFT');
    }
  }
}
