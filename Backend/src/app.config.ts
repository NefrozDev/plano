import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { type Express, text } from 'express';

export function configureApp(app: INestApplication): void {
  // In production, requests arrive through Mailcow's nginx and Caddy on private
  // Docker networks. Trusting only private and loopback hops makes req.ip the
  // real client (used by rate limiting) while a client-supplied
  // X-Forwarded-For entry is never trusted.
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', 'loopback, uniquelocal');
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:4200',
    credentials: true,
  });
  app.use(cookieParser());
  // The identity service sends deletion notices as a signed token, not JSON.
  app.use(
    '/api/v1/auth/account-deleted',
    text({ type: 'application/secevent+jwt', limit: '16kb' }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
