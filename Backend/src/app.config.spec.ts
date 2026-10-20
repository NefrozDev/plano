import type { Mock } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { configureApp } from './app.config';

function httpAdapterWith(set: Mock) {
  return { getInstance: () => ({ set }) };
}

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
    const set = vi.fn();
    const setGlobalPrefix = vi.fn();
    const enableCors = vi.fn();
    const use = vi.fn();
    const useGlobalPipes = vi.fn();
    const app = {
      getHttpAdapter: () => httpAdapterWith(set),
      setGlobalPrefix,
      enableCors,
      use,
      useGlobalPipes,
    } as unknown as INestApplication;

    configureApp(app);

    expect(set).toHaveBeenCalledWith('trust proxy', 'loopback, uniquelocal');
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
    const enableCors = vi.fn();
    const app = {
      getHttpAdapter: () => httpAdapterWith(vi.fn()),
      setGlobalPrefix: vi.fn(),
      enableCors,
      use: vi.fn(),
      useGlobalPipes: vi.fn(),
    } as unknown as INestApplication;

    configureApp(app);

    expect(enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'http://localhost:4200' }),
    );
  });
});
