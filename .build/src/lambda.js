"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const core_1 = require("@nestjs/core");
const platform_express_1 = require("@nestjs/platform-express");
const serverless_http_1 = require("serverless-http");
const express_1 = require("express");
const app_module_1 = require("./app.module");
let cachedServer;
let app;
async function bootstrap() {
    if (!app) {
        const expressApp = (0, express_1.default)();
        app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_express_1.ExpressAdapter(expressApp), {
            logger: ['error', 'warn', 'log'],
        });
        app.enableCors();
        await app.init();
    }
    return (0, serverless_http_1.default)(app.getHttpAdapter().getInstance());
}
const handler = async (event, context, callback) => {
    context.callbackWaitsForEmptyEventLoop = false;
    if (!cachedServer) {
        cachedServer = await bootstrap();
    }
    return cachedServer(event, context, callback);
};
exports.handler = handler;
//# sourceMappingURL=lambda.js.map