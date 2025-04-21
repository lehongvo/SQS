import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { MintNftDto } from './mint-nft.dto';

export class BatchMintDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MintNftDto)
  orders: MintNftDto[];
}
