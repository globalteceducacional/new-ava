import './load-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);

  // Necessário atrás de Caddy/nginx para req.ip e rate limit por IP.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (
    trustProxy === '1' ||
    trustProxy === 'true' ||
    config.get('NODE_ENV') === 'production'
  ) {
    const http = app.getHttpAdapter().getInstance() as {
      set?: (key: string, value: unknown) => void;
    };
    http.set?.('trust proxy', 1);
  }

  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3001';
  if (webOrigin === '*' || webOrigin === 'true') {
    throw new Error('WEB_ORIGIN inválido para credentials CORS');
  }

  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
