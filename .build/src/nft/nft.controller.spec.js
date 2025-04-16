"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const nft_controller_1 = require("./nft.controller");
describe('NftController', () => {
    let controller;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            controllers: [nft_controller_1.NftController],
        }).compile();
        controller = module.get(nft_controller_1.NftController);
    });
    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
//# sourceMappingURL=nft.controller.spec.js.map