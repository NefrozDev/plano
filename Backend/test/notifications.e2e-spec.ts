import request from 'supertest';
import type { NotificationsResponse } from '@plano/common';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';

describe('Notifications (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;
  let bob: RegisteredUser;

  const http = () => request(testApp.app.getHttpServer());
  const bell = async (user: RegisteredUser) =>
    (
      await http()
        .get('/api/v1/notifications')
        .set('Cookie', user.cookie)
        .expect(200)
    ).body as NotificationsResponse;

  beforeEach(async () => {
    testApp = await createTestApp();
    ada = await registerUser(testApp.app, 'ada');
    bob = await registerUser(testApp.app, 'bob');
  });

  afterEach(() => testApp.close());

  it('requires a session, a known area and a real notification id', async () => {
    const response = await http().get('/api/v1/notifications').expect(401);
    expect(response.body).toMatchObject({ statusCode: 401 });

    for (const body of [
      {},
      { area: 'mail' },
      { area: 'lists', targetId: '' },
    ]) {
      const refused = await http()
        .post('/api/v1/notifications/read')
        .set('Cookie', ada.cookie)
        .send(body)
        .expect(400);
      expect(refused.body).toMatchObject({ statusCode: 400 });
    }
    const unknown = await http()
      .post('/api/v1/notifications/not-a-uuid/read')
      .set('Cookie', ada.cookie)
      .expect(400);
    expect(unknown.body).toMatchObject({ statusCode: 400 });
  });

  it('keeps a friend request in the recipient’s bell until it is read', async () => {
    await http()
      .post('/api/v1/friends/requests')
      .set('Cookie', ada.cookie)
      .send({ userId: bob.user.id })
      .expect(201);

    const before = await bell(bob);
    expect(before.unread).toEqual({
      friends: 1,
      lists: 0,
      objectives: 0,
      agenda: 0,
    });
    expect(before.items).toEqual([
      {
        id: expect.any(String) as string,
        area: 'friends',
        kind: 'friend.requested',
        targetId: ada.user.id,
        title: '',
        actor: { id: ada.user.id, name: 'Ada Doe', avatarVersion: null },
        count: 1,
        updatedAt: expect.any(String) as string,
        read: false,
      },
    ]);
    expect(JSON.stringify(before)).not.toContain('@');
    expect((await bell(ada)).items).toEqual([]);

    // Someone else cannot read it for them.
    const foreign = await http()
      .post(`/api/v1/notifications/${before.items[0].id}/read`)
      .set('Cookie', ada.cookie)
      .expect(404);
    expect(foreign.body).toMatchObject({ statusCode: 404 });

    await http()
      .post('/api/v1/notifications/read')
      .set('Cookie', bob.cookie)
      .send({ area: 'friends' })
      .expect(204);

    const after = await bell(bob);
    expect(after.unread.friends).toBe(0);
    expect(after.items[0].read).toBe(true);
  });

  it('marks a single notification read from the bell', async () => {
    await http()
      .post('/api/v1/friends/requests')
      .set('Cookie', ada.cookie)
      .send({ userId: bob.user.id })
      .expect(201);
    const [notification] = (await bell(bob)).items;

    await http()
      .post(`/api/v1/notifications/${notification.id}/read`)
      .set('Cookie', bob.cookie)
      .expect(204);

    expect((await bell(bob)).items).toEqual([{ ...notification, read: true }]);
  });
});
