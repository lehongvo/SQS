"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NftService = void 0;
const common_1 = require("@nestjs/common");
const contract_1 = require("../utils/contract");
let NftService = class NftService {
    async mintNft(mintNftDto) {
        try {
            const { mintToAddress, ...metadataInfo } = mintNftDto;
            const result = await (0, contract_1.mintNft)(metadataInfo, mintToAddress);
            return {
                success: true,
                data: result,
                message: 'NFT minted successfully',
            };
        }
        catch (error) {
            throw new common_1.BadRequestException(error.message || 'Failed to mint NFT');
        }
    }
};
exports.NftService = NftService;
exports.NftService = NftService = __decorate([
    (0, common_1.Injectable)()
], NftService);
//# sourceMappingURL=nft.service.js.map