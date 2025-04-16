import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];

    // Check if API key is valid
    if (!apiKey || apiKey !== process.env.API_MINT_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
