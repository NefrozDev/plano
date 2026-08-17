import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AllowedOriginGuard } from './allowed-origin.guard';

function contextFor(
  method: string,
  headers: Record<string, string | undefined> = {},
): ExecutionContext {
  const request = {
    method,
    get: (name: string) => headers[name.toLowerCase()],
  } as Pick<Request, 'method' | 'get'>;

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AllowedOriginGuard', () => {
  const guard = new AllowedOriginGuard(
    new ConfigService({ FRONTEND_URL: 'https://plano.example/app' }),
  );

  it('allows safe methods and non-browser clients without origin headers', () => {
    expect(guard.canActivate(contextFor('GET'))).toBe(true);
    expect(guard.canActivate(contextFor('POST'))).toBe(true);
  });

  it('allows the configured origin from Origin or Referer', () => {
    expect(
      guard.canActivate(
        contextFor('POST', { origin: 'https://plano.example' }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        contextFor('POST', {
          referer: 'https://plano.example/register?source=test',
        }),
      ),
    ).toBe(true);
  });

  it('rejects unsafe requests from a foreign origin', () => {
    expect(() =>
      guard.canActivate(
        contextFor('DELETE', { origin: 'https://attacker.example' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('falls back to the local frontend for invalid configuration', () => {
    const fallbackGuard = new AllowedOriginGuard(
      new ConfigService({ FRONTEND_URL: 'not a URL' }),
    );

    expect(
      fallbackGuard.canActivate(
        contextFor('POST', { origin: 'http://localhost:4200' }),
      ),
    ).toBe(true);
  });
});
