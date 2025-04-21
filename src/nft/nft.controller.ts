import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { NftService } from './nft.service';
import { MintNftDto } from './dto/mint-nft.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('nft')
export class NftController {
  constructor(private readonly nftService: NftService) {}

  @Post('mint')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  async mintNft(@Body() mintNftDto: MintNftDto) {
    return this.nftService.mintNft(mintNftDto);
  }

  @Post('batch-mint')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  async batchMint(@Body() mintNftDtos: MintNftDto[]) {
    return this.nftService.batchMint(mintNftDtos);
  }
}
