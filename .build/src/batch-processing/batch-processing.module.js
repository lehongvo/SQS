"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchProcessingModule = void 0;
const common_1 = require("@nestjs/common");
const orders_module_1 = require("../orders/orders.module");
const wallets_module_1 = require("../wallets/wallets.module");
const batch_processing_service_1 = require("./batch-processing.service");
const nft_mint_processor_1 = require("./processors/nft-mint.processor");
let BatchProcessingModule = class BatchProcessingModule {
};
exports.BatchProcessingModule = BatchProcessingModule;
exports.BatchProcessingModule = BatchProcessingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            orders_module_1.OrdersModule,
            wallets_module_1.WalletsModule,
        ],
        providers: [batch_processing_service_1.BatchProcessingService, nft_mint_processor_1.NftMintProcessor],
        exports: [batch_processing_service_1.BatchProcessingService],
    })
], BatchProcessingModule);
//# sourceMappingURL=batch-processing.module.js.map