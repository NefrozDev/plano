import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from './../src/app.config';
import { AppModule } from './../src/app.module';
import type { AuthUser } from './../src/auth/auth.types';
import type { HealthStatus } from './../src/health/health.service';
import type { GroupSummary } from './../src/groups/group.types';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

const validRegistration = {
  firstName: 'Jamie',
  lastName: 'Doe',
  username: 'jamie.doe',
  email: 'jamie@example.com',
  password: 'correct horse battery staple',
  acceptedTerms: true,
};

function readSetCookie(headers: Record<string, unknown>): string[] {
  const value = headers['set-cookie'];

  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error('Expected a Set-Cookie response header.');
  }

  return value;
}

function cookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(';', 1)[0];
}

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();

  configureApp(app);
  await app.init();

  return app;
}

describe('Plano API (e2e)', () => {
  let app: INestApplication<App>;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `plano-e2e-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = databasePath;
    process.env.AUTH_SCRYPT_COST = '1024';
    process.env.AUTH_SCRYPT_BLOCK_SIZE = '8';
    process.env.AUTH_SCRYPT_PARALLELIZATION = '1';
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
    await rm(databasePath, { force: true });
  });

  it('reports API health', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const body = response.body as unknown as HealthStatus;

    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('registers a user and restores the persistent cookie session', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);
    const user = registration.body as unknown as AuthUser;
    const setCookie = readSetCookie(registration.headers)[0];

    expect(user).toEqual({
      id: expect.any(String) as string,
      firstName: 'Jamie',
      lastName: 'Doe',
      username: 'jamie.doe',
      email: 'jamie@example.com',
    });
    expect(registration.body).not.toHaveProperty('password');
    expect(registration.body).not.toHaveProperty('passwordHash');
    expect(setCookie).toContain('plano_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/api/v1');
    expect(setCookie).toMatch(/Max-Age=\d+/);

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', cookiePair(setCookie))
      .expect(200)
      .expect(user);
  });

  it('rejects invalid and unexpected registration fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...validRegistration,
        acceptedTerms: false,
        administrator: true,
      })
      .expect(400);
  });

  it('normalizes unique email addresses and usernames', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...validRegistration,
        username: 'someone.else',
        email: ' JAMIE@EXAMPLE.COM ',
      })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...validRegistration,
        username: 'JAMIE.DOE',
        email: 'other@example.com',
      })
      .expect(409);
  });

  it('serializes concurrent registrations for the single-connection database', async () => {
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(validRegistration),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          ...validRegistration,
          username: 'grace.hopper',
          email: 'grace@example.com',
        }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('rejects unsafe browser requests from an untrusted origin', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://attacker.example')
      .send(validRegistration)
      .expect(403);
  });

  it('logs in and uses the same response for unknown users and bad passwords', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'JAMIE.DOE', password: validRegistration.password })
      .expect(200);

    expect(login.body).toMatchObject({ username: 'jamie.doe' });
    expect(readSetCookie(login.headers)[0]).toContain('HttpOnly');

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'jamie.doe', password: 'definitely-wrong' })
      .expect(401);
    const unknownUser = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'unknown.user', password: 'definitely-wrong' })
      .expect(401);

    expect(wrongPassword.body as ErrorResponse).toEqual(
      unknownUser.body as ErrorResponse,
    );
  });

  it('revokes the session and clears the cookie on logout', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);
    const originalCookie = cookiePair(readSetCookie(registration.headers)[0]);
    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', originalCookie)
      .expect(204);

    expect(readSetCookie(logout.headers)[0]).toContain('plano_session=;');

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', originalCookie)
      .expect(401);

    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(204);
  });

  it('creates and restores a group for the authenticated user', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);
    const cookie = cookiePair(readSetCookie(registration.headers)[0]);

    await request(app.getHttpServer()).get('/api/v1/groups/me').expect(401);

    const creation = await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', cookie)
      .send({ name: '  Les Explorateurs  ' })
      .expect(201);
    const group = creation.body as unknown as GroupSummary;

    expect(group).toMatchObject({
      id: expect.any(String) as string,
      name: 'Les Explorateurs',
      role: 'owner',
    });
    expect(group.inviteCode).toMatch(/^[A-Z0-9_-]{8}$/);

    await request(app.getHttpServer())
      .get('/api/v1/groups/me')
      .set('Cookie', cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ id: group.id, role: 'owner' });
      });

    await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', cookie)
      .send({ name: 'Un autre groupe' })
      .expect(409);
  });

  it('keeps a valid user session after the backend restarts', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);
    const originalCookie = cookiePair(readSetCookie(registration.headers)[0]);

    await app.close();
    app = await createApp();

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', originalCookie)
      .expect(200)
      .expect((response) => {
        const user = response.body as unknown as AuthUser;
        expect(user.username).toBe('jamie.doe');
      });
  });
});
