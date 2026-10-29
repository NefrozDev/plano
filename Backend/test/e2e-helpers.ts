import { INestApplication } from '@nestjs/common';
import {
  Test,
  TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from './../src/app.config';
import { AppModule } from './../src/app.module';
import type { AuthUser } from './../src/auth/auth.types';
import { createTestDatabase } from './../src/database/testing/test-database';

export const validRegistration = {
  firstName: 'Jamie',
  lastName: 'Doe',
  username: 'jamie.doe',
  email: 'jamie@example.com',
  password: 'correct horse battery staple',
  acceptedTerms: true,
};

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

/** Replaces providers of the real AppModule, e.g. the mailer. */
export type ModuleOverrides = (
  builder: TestingModuleBuilder,
) => TestingModuleBuilder;

async function startApp(
  databaseUrl: string,
  overrides: ModuleOverrides = (builder) => builder,
): Promise<INestApplication<App>> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SCRYPT_COST = '1024';
  process.env.AUTH_SCRYPT_BLOCK_SIZE = '8';
  process.env.AUTH_SCRYPT_PARALLELIZATION = '1';

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

/** Registers `username` and returns the user with their session cookie. */
export async function registerUser(
  app: INestApplication<App>,
  username: string,
): Promise<RegisteredUser> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      ...validRegistration,
      firstName: username.charAt(0).toUpperCase() + username.slice(1),
      username,
      email: `${username}@example.com`,
    })
    .expect(201);
  return {
    user: response.body as AuthUser,
    cookie: cookiePair(readSetCookie(response.headers)[0]),
  };
}
