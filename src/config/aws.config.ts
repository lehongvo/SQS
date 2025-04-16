import { ConfigModule } from '@nestjs/config';

export const awsConfig = ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
});

export const AWS_CONFIG = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};
