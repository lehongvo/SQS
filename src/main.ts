import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { initializeBlockchainConnection } from './utils/contract';

async function bootstrap() {
  // Load environment variables
  dotenv.config();

  const app = await NestFactory.create(AppModule);

  // Add validation pipe to validate incoming requests
  app.useGlobalPipes(new ValidationPipe());

  // Initialize blockchain connection once at startup
  const blockchainInitialized = initializeBlockchainConnection();
  if (!blockchainInitialized) {
    console.warn(
      '⚠️ Blockchain connection initialization failed! Check your configurations.',
    );
  } else {
    console.log('✅ Blockchain connection initialized successfully!');
  }

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
