import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { INestApplication } from '@nestjs/common';
import { Context, Handler } from 'aws-lambda';
import serverlessExpress from 'serverless-http';
import express from 'express';
import { AppModule } from './app.module';

let cachedServer: any;
let app: INestApplication;

async function bootstrap(): Promise<Handler> {
  if (!app) {
    const expressApp = express();
    app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
      logger: ['error', 'warn', 'log'],
    });
    app.enableCors();
    await app.init();
  }

  return serverlessExpress(app.getHttpAdapter().getInstance());
}

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: any,
) => {
  // Keep the Lambda warm
  context.callbackWaitsForEmptyEventLoop = false;

  if (!cachedServer) {
    cachedServer = await bootstrap();
  }

  return cachedServer(event, context, callback);
};
