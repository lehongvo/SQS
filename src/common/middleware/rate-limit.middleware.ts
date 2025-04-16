import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST'),
      port: this.configService.get('REDIS_PORT'),
      password: this.configService.get('REDIS_PASSWORD'),
    });
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip;
    const key = `rate_limit:${ip}`;
    const windowMs = this.configService.get('RATE_LIMIT_WINDOW_MS') || 60000; // 1 minute default
    const maxRequests =
      this.configService.get('RATE_LIMIT_MAX_REQUESTS') || 100;

    try {
      const requests = await this.redis.incr(key);

      if (requests === 1) {
        await this.redis.expire(key, windowMs / 1000);
      }

      if (requests > maxRequests) {
        throw new HttpException(
          'Too Many Requests',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      next(error);
    }
  }
}
