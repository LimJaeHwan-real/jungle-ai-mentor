import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'movies', method: RequestMethod.GET },
      { path: 'movies/:id', method: RequestMethod.GET },
    ],
  });
  const configuredOrigin = config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173';
  app.enableCors({
    origin: [configuredOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
