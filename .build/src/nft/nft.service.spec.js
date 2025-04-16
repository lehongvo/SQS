"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const nft_service_1 = require("./nft.service");
describe('NftService', () => {
    let service;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [nft_service_1.NftService],
        }).compile();
        service = module.get(nft_service_1.NftService);
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
//# sourceMappingURL=nft.service.spec.js.map