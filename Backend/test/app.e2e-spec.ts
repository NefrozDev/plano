import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AuthUser } from './../src/auth/auth.types';
import type { HealthStatus } from './../src/health/health.service';
import type { GroupDetails, GroupSummary } from './../src/groups/group.types';
import { type TestApp, createTestApp, registerUser } from './e2e-helpers';

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

  it('rejects unsafe browser requests from an untrusted origin', async () => {
    const { cookie } = await registerUser(app, 'jamie.doe');

    await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', cookie)
      .set('Origin', 'https://attacker.example')
      .send({ name: 'Forged' })
      .expect(403);

    // Nothing was created.
    const groups = await request(app.getHttpServer())
      .get('/api/v1/groups')
      .set('Cookie', cookie)
      .expect(200);
    expect(groups.body).toEqual([]);
  });

  it('does not rate limit the health check', async () => {
    const statuses = new Set<number>();
    for (let i = 0; i < 301; i++) {
      const { status } = await request(app.getHttpServer()).get(
        '/api/v1/health',
      );
      statuses.add(status);
    }

    expect([...statuses]).toEqual([200]);
  });

  it('creates several groups for the authenticated user and lists them', async () => {
    const registered = await registerUser(app, 'jamie.doe');
    const cookie = registered.cookie;

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
    const ownerRegistered = await registerUser(app, 'jamie.doe');
    const ownerCookie = ownerRegistered.cookie;

    const memberRegistered = await registerUser(app, 'morgan.doe', {
      firstName: 'Morgan',
    });
    const member = memberRegistered.user;
    const memberCookie = memberRegistered.cookie;

    const visitorRegistered = await registerUser(app, 'robin.doe', {
      firstName: 'Robin',
    });
    const visitor = visitorRegistered.user;
    const visitorCookie = visitorRegistered.cookie;

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
    const registered = await registerUser(app, 'jamie.doe');
    const originalCookie = registered.cookie;

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
