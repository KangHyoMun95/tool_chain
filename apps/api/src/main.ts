import "dotenv/config";
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGINS!.split(","), credentials: true });
  app.enableShutdownHooks();                       // để onModuleDestroy chạy khi tắt
  await app.listen(Number(process.env.API_PORT ?? 4000));
}
await bootstrap();
