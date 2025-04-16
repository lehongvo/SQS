"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitMiddleware = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
let RateLimitMiddleware = class RateLimitMiddleware {
    configService;
    redis;
    constructor(configService) {
        this.configService = configService;
        this.redis = new ioredis_1.Redis({
            host: this.configService.get('REDIS_HOST'),
            port: this.configService.get('REDIS_PORT'),
            password: this.configService.get('REDIS_PASSWORD'),
        });
    }
    async use(req, res, next) {
        const ip = req.ip;
        const key = `rate_limit:${ip}`;
        const windowMs = this.configService.get('RATE_LIMIT_WINDOW_MS') || 60000;
        const maxRequests = this.configService.get('RATE_LIMIT_MAX_REQUESTS') || 100;
        try {
            const requests = await this.redis.incr(key);
            if (requests === 1) {
                await this.redis.expire(key, windowMs / 1000);
            }
            if (requests > maxRequests) {
                throw new common_1.HttpException('Too Many Requests', common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
            next();
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            next(error);
        }
    }
};
exports.RateLimitMiddleware = RateLimitMiddleware;
exports.RateLimitMiddleware = RateLimitMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RateLimitMiddleware);
//# sourceMappingURL=rate-limit.middleware.js.map