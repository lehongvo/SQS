import { IsString, IsOptional, IsObject } from 'class-validator';
import { Prisma } from '@prisma/client';

export class MintNftDto {
  @IsString()
  mintToAddress: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  image: string;

  @IsObject()
  @IsOptional()
  attributes?: Prisma.JsonObject;
}
