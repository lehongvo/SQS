"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AWS_CONFIG = exports.awsConfig = void 0;
const config_1 = require("@nestjs/config");
exports.awsConfig = config_1.ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: '.env',
});
exports.AWS_CONFIG = {
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
};
//# sourceMappingURL=aws.config.js.map