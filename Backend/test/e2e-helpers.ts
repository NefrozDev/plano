import { INestApplication } from '@nestjs/common';
import {
  Test,
  TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';
import { App } from 'supertest/types';
import { configureApp } from './../src/app.config';
import { AppModule } from './../src/app.module';
import { randomUUID } from 'node:crypto';
import { SESSION_COOKIE_NAME } from './../src/auth/auth.constants';
import { AuthService } from './../src/auth/auth.service';
import type { AuthUser } from './../src/auth/auth.types';
import type { IdentityClaims } from './../src/auth/oidc-client.service';
import { TEST_ISSUER } from './fake-identity';
import { createTestDatabase } from './../src/database/testing/test-database';

export function readSetCookie(headers: Record<string, unknown>): string[] {
  const value = headers['set-cookie'];

  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error('Expected a Set-Cookie response header.');
  }

  return value;
}

export function cookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(';', 1)[0];
}

export interface TestApp {
  app: INestApplication<App>;
  /** Stops the app and starts a fresh one on the same database. */
  restart(): Promise<INestApplication<App>>;
  close(): Promise<void>;
}

/** Replaces providers of the real AppModule, e.g. the identity service. */
export type ModuleOverrides = (
  builder: TestingModuleBuilder,
) => TestingModuleBuilder;

async function startApp(
  databaseUrl: string,
  overrides: ModuleOverrides = (builder) => builder,
): Promise<INestApplication<App>> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.OIDC_ISSUER = TEST_ISSUER;
  process.env.OIDC_CLIENT_ID = 'plano';

  const moduleFixture: TestingModule = await overrides(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

/** The real AppModule with the runtime HTTP setup, on a throwaway database. */
export async function createTestApp(
  overrides?: ModuleOverrides,
): Promise<TestApp> {
  const database = await createTestDatabase();
  const testApp: TestApp = {
    app: await startApp(database.url, overrides),
    restart: async () => {
      await testApp.app.close();
      testApp.app = await startApp(database.url, overrides);
      return testApp.app;
    },
    close: async () => {
      await testApp.app.close();
      await database.drop();
    },
  };
  return testApp;
}

export interface RegisteredUser {
  user: AuthUser;
  cookie: string;
}

/**
 * Signs `username` in as the identity service would have, and returns the user
 * with their Plano session cookie.
 */
export async function registerUser(
  app: INestApplication<App>,
  username: string,
  overrides: Partial<IdentityClaims> = {},
): Promise<RegisteredUser> {
  const issued = await app.get(AuthService).signIn({
    sub: randomUUID(),
    username,
    firstName: username.charAt(0).toUpperCase() + username.slice(1),
    lastName: 'Doe',
    email: `${username}@example.com`,
    locale: null,
    sid: null,
    ...overrides,
  });
  return {
    user: issued.user,
    cookie: `${SESSION_COOKIE_NAME}=${issued.token}`,
  };
}
