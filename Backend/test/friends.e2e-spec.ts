import request from 'supertest';
import type {
  Contact,
  FriendRequests,
  ListDetail,
  UserSearchResult,
} from '@plano/common';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';

describe('Friends and contacts (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;
  let bob: RegisteredUser;

  const http = () => request(testApp.app.getHttpServer());

  beforeEach(async () => {
    testApp = await createTestApp();
    ada = await registerUser(testApp.app, 'ada');
    bob = await registerUser(testApp.app, 'bob');
  });

  afterEach(() => testApp.close());

  it('requires a session and a valid search query', async () => {
    await http().get('/api/v1/friends').expect(401);
    await http().get('/api/v1/contacts').expect(401);
    for (const query of ['q=b', 'q=bo%25', 'q=bob&role=admin', '']) {
      await http()
        .get(`/api/v1/friends/search?${query}`)
        .set('Cookie', ada.cookie)
        .expect(400);
    }
  });

  it('finds, requests and accepts a friend, who then becomes a contact to share with', async () => {
    const [found] = (
      await http()
        .get('/api/v1/friends/search?q=BO')
        .set('Cookie', ada.cookie)
        .expect(200)
    ).body as UserSearchResult[];
    expect(found).toEqual({
      id: bob.user.id,
      username: 'bob',
      firstName: 'Bob',
      lastName: 'Doe',
      relation: 'none',
    });

    await http()
      .post('/api/v1/friends/requests')
      .set('Cookie', ada.cookie)
      .send({ userId: found.id })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({ status: 'pending' });
      });
    const requests = (
      await http()
        .get('/api/v1/friends/requests')
        .set('Cookie', bob.cookie)
        .expect(200)
    ).body as FriendRequests;
    expect(requests.incoming.map(({ user }) => user.id)).toEqual([ada.user.id]);

    // A pending request is no contact yet: sharing a list is refused.
    const list = (
      await http()
        .post('/api/v1/lists')
        .set('Cookie', ada.cookie)
        .send({ name: 'Courses', icon: 'cart', color: '#2ecb70' })
        .expect(201)
    ).body as ListDetail;
    const share = () =>
      http()
        .post(`/api/v1/lists/${list.id}/members`)
        .set('Cookie', ada.cookie)
        .send({ userId: bob.user.id, role: 'viewer' });
    await share().expect(400);

    await http()
      .post(`/api/v1/friends/requests/${requests.incoming[0].id}/accept`)
      .set('Cookie', bob.cookie)
      .expect(200);
    await http()
      .get('/api/v1/contacts')
      .set('Cookie', ada.cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body as Contact[]).toEqual([
          expect.objectContaining({
            id: bob.user.id,
            friend: true,
            groups: [],
          }),
        ]);
      });
    await share().expect(201);
    await http()
      .get(`/api/v1/lists/${list.id}`)
      .set('Cookie', bob.cookie)
      .expect(200);

    // Unfriending revokes the shared list at once.
    await http()
      .delete(`/api/v1/friends/${ada.user.id}`)
      .set('Cookie', bob.cookie)
      .expect(204);
    await http()
      .get(`/api/v1/lists/${list.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);
    await http()
      .delete(`/api/v1/friends/${ada.user.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);
  });
});
