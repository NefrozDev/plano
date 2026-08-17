import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { configureApp } from './app.config';

describe('configureApp', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  it('applies the version prefix, credentialed CORS, cookies, and validation', () => {
    process.env.FRONTEND_URL = 'https://plano.example';
    const setGlobalPrefix = jest.fn();
    const enableCors = jest.fn();
    const use = jest.fn();
    const useGlobalPipes = jest.fn();
    const app = {
      setGlobalPrefix,
      enableCors,
      use,
      useGlobalPipes,
    } as unknown as INestApplication;

    configureApp(app);

    expect(setGlobalPrefix).toHaveBeenCalledWith('api/v1');
    expect(enableCors).toHaveBeenCalledWith({
      origin: 'https://plano.example',
      credentials: true,
    });
    expect(use).toHaveBeenCalledWith(expect.any(Function));
    expect(useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
  });

  it('uses the local Angular origin by default', () => {
    delete process.env.FRONTEND_URL;
    const enableCors = jest.fn();
    const app = {
      setGlobalPrefix: jest.fn(),
      enableCors,
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
    } as unknown as INestApplication;

    configureApp(app);

    expect(enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'http://localhost:4200' }),
    );
  });
});
