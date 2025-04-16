"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const dotenv = require("dotenv");
const contract_1 = require("./utils/contract");
async function bootstrap() {
    dotenv.config();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe());
    const blockchainInitialized = (0, contract_1.initializeBlockchainConnection)();
    if (!blockchainInitialized) {
        console.warn('⚠️ Blockchain connection initialization failed! Check your configurations.');
    }
    else {
        console.log('✅ Blockchain connection initialized successfully!');
    }
    await app.listen(process.env.PORT ?? 3000);
    console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
//# sourceMappingURL=main.js.map