import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AuthUser } from './../src/auth/auth.types';
import type { HealthStatus } from './../src/health/health.service';
import type { GroupDetails, GroupSummary } from './../src/groups/group.types';
import {
  type TestApp,
  cookiePair,
  createTestApp,
  readSetCookie,
  registerUser,
  validRegistration,
} from './e2e-helpers';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

describe('Plano API (e2e)', () => {
  let app: INestApplication<App>;
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterEach(() => testApp.close());

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
      locale: 'fr',
      avatarVersion: null,
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

  it('rate limits repeated login attempts from the same client', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'unknown.user', password: 'definitely-wrong' });

    for (let i = 0; i < 10; i++) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not rate limit the health check', async () => {
    for (let i = 0; i < 301; i++) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
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

  it('creates several groups for the authenticated user and lists them', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);
    const cookie = cookiePair(readSetCookie(registration.headers)[0]);

    await request(app.getHttpServer()).get('/api/v1/groups').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/groups')
      .set('Cookie', cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });

    const creation = await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', cookie)
      .send({ name: '  Famille proche  ' })
      .expect(201);
    const family = creation.body as unknown as GroupSummary;
    expect(family).toMatchObject({
      id: expect.any(String) as string,
      name: 'Famille proche',
      role: 'owner',
    });
    expect(family.inviteCode).toMatch(/^[A-Z0-9_-]{8}$/);

    const work = (
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', cookie)
        .send({ name: 'Travail' })
        .expect(201)
    ).body as unknown as GroupDetails;
    expect(work.id).not.toBe(family.id);

    await request(app.getHttpServer())
      .get('/api/v1/groups')
      .set('Cookie', cookie)
      .expect(200)
      .expect((response) => {
        const groups = response.body as unknown as GroupDetails[];
        expect(groups.map(({ name, role }) => ({ name, role }))).toEqual([
          { name: 'Famille proche', role: 'owner' },
          { name: 'Travail', role: 'owner' },
        ]);
        expect(groups.every((group) => group.members.length === 1)).toBe(true);
      });
    await request(app.getHttpServer())
      .get(`/api/v1/groups/${work.id}`)
      .set('Cookie', cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ id: work.id, name: 'Travail' });
      });
    await request(app.getHttpServer())
      .get('/api/v1/groups/not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
  });

  it('handles joining, group administration, ownership transfer, and departure', async () => {
    const ownerRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);
    const ownerCookie = cookiePair(readSetCookie(ownerRegistration.headers)[0]);

    const memberRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...validRegistration,
        firstName: 'Morgan',
        username: 'morgan.doe',
        email: 'morgan@example.com',
      })
      .expect(201);
    const member = memberRegistration.body as unknown as AuthUser;
    const memberCookie = cookiePair(
      readSetCookie(memberRegistration.headers)[0],
    );

    const visitorRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...validRegistration,
        firstName: 'Robin',
        username: 'robin.doe',
        email: 'robin@example.com',
      })
      .expect(201);
    const visitor = visitorRegistration.body as unknown as AuthUser;
    const visitorCookie = cookiePair(
      readSetCookie(visitorRegistration.headers)[0],
    );

    const createdGroup = (
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', ownerCookie)
        .send({ name: 'Les Explorateurs' })
        .expect(201)
    ).body as unknown as GroupDetails;
    const groupUrl = `/api/v1/groups/${createdGroup.id}`;

    // Someone else's group is invisible until they join it.
    await request(app.getHttpServer())
      .get(groupUrl)
      .set('Cookie', memberCookie)
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/groups/join')
      .set('Cookie', memberCookie)
      .send({ inviteCode: 'ZZZZZZZZ' })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/v1/groups/join')
      .set('Cookie', memberCookie)
      .send({ inviteCode: createdGroup.inviteCode.toLowerCase() })
      .expect(201)
      .expect((response) => {
        const group = response.body as unknown as GroupDetails;
        expect(group.role).toBe('member');
        expect(group.members).toHaveLength(2);
      });
    await request(app.getHttpServer())
      .post('/api/v1/groups/join')
      .set('Cookie', memberCookie)
      .send({ inviteCode: createdGroup.inviteCode })
      .expect(409);

    await request(app.getHttpServer())
      .patch(groupUrl)
      .set('Cookie', memberCookie)
      .send({ name: 'Nom interdit' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(groupUrl)
      .set('Cookie', ownerCookie)
      .send({ name: '  Nouveau nom  ' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ name: 'Nouveau nom' });
      });

    const rotation = await request(app.getHttpServer())
      .post(`${groupUrl}/invite-code`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const rotatedGroup = rotation.body as unknown as GroupDetails;
    expect(rotatedGroup.inviteCode).not.toBe(createdGroup.inviteCode);

    await request(app.getHttpServer())
      .post('/api/v1/groups/join')
      .set('Cookie', visitorCookie)
      .send({ inviteCode: createdGroup.inviteCode })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/groups/join')
      .set('Cookie', visitorCookie)
      .send({ inviteCode: rotatedGroup.inviteCode })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`${groupUrl}/owner`)
      .set('Cookie', ownerCookie)
      .send({ userId: member.id })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ role: 'member' });
      });

    await request(app.getHttpServer())
      .delete(groupUrl)
      .set('Cookie', ownerCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${groupUrl}/leave`)
      .set('Cookie', ownerCookie)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/groups')
      .set('Cookie', ownerCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });

    await request(app.getHttpServer())
      .delete(`${groupUrl}/members/not-a-uuid`)
      .set('Cookie', memberCookie)
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${groupUrl}/members/${visitor.id}`)
      .set('Cookie', memberCookie)
      .expect(204);
    await request(app.getHttpServer())
      .get(groupUrl)
      .set('Cookie', memberCookie)
      .expect(200)
      .expect((response) => {
        const group = response.body as unknown as GroupDetails;
        expect(group.role).toBe('owner');
        expect(group.members).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .delete(groupUrl)
      .set('Cookie', memberCookie)
      .expect(204);
    await request(app.getHttpServer())
      .get(groupUrl)
      .set('Cookie', memberCookie)
      .expect(404);
  });

  it('scopes owner actions to the group they target', async () => {
    const ada = await registerUser(app, 'ada');
    const bob = await registerUser(app, 'bob');
    const adaGroup = (
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', ada.cookie)
        .send({ name: 'Famille' })
        .expect(201)
    ).body as unknown as GroupDetails;
    const bobGroup = (
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Cookie', bob.cookie)
        .send({ name: 'Travail' })
        .expect(201)
    ).body as unknown as GroupDetails;
    await request(app.getHttpServer())
      .post('/api/v1/groups/join')
      .set('Cookie', bob.cookie)
      .send({ inviteCode: adaGroup.inviteCode })
      .expect(201);

    // Owning one group gives no rights on another: Bob is only a member of Ada's.
    await request(app.getHttpServer())
      .patch(`/api/v1/groups/${adaGroup.id}`)
      .set('Cookie', bob.cookie)
      .send({ name: 'Pris' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/groups/${bobGroup.id}`)
      .set('Cookie', ada.cookie)
      .send({ name: 'Pris' })
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/v1/groups')
      .set('Cookie', bob.cookie)
      .expect(200)
      .expect((response) => {
        const groups = response.body as unknown as GroupDetails[];
        expect(groups.map(({ name, role }) => ({ name, role }))).toEqual([
          { name: 'Travail', role: 'owner' },
          { name: 'Famille', role: 'member' },
        ]);
      });
  });

  it('keeps a valid user session after the backend restarts', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validRegistration)
      .expect(201);
    const originalCookie = cookiePair(readSetCookie(registration.headers)[0]);

    app = await testApp.restart();

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
