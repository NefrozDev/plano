import {
  request as httpRequest,
  type ClientRequest,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { ListDetail, LiveEvent } from '@plano/common';
import type { GroupDetails } from './../src/groups/group.types';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';

interface OpenStream {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  /** Resolves with the next named event the server sends. */
  next(): Promise<{ type: string; data: LiveEvent }>;
  close(): void;
}

/** A real EventSource-like connection: supertest would wait for the response to end. */
function openStream(port: number, cookie: string): Promise<OpenStream> {
  return new Promise((resolve, reject) => {
    const queue: { type: string; data: LiveEvent }[] = [];
    const waiting: ((event: { type: string; data: LiveEvent }) => void)[] = [];
    let buffer = '';
    const client: ClientRequest = httpRequest(
      {
        port,
        path: '/api/v1/live/stream',
        headers: { Cookie: cookie, Accept: 'text/event-stream' },
      },
      (response) => {
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          buffer += chunk;
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const type = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (!type || !data || type === 'ping') continue;
            const event = { type, data: JSON.parse(data) as LiveEvent };
            const waiter = waiting.shift();
            if (waiter) waiter(event);
            else queue.push(event);
          }
        });
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          next: () =>
            new Promise((deliver) => {
              const queued = queue.shift();
              if (queued) deliver(queued);
              else waiting.push(deliver);
            }),
          close: () => client.destroy(),
        });
      },
    );
    client.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    client.end();
  });
}

describe('Live updates (e2e)', () => {
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

  it('requires a session', async () => {
    await http().get('/api/v1/live/stream').expect(401);
  });

  it('pushes a change of a shared list to its members as it happens', async () => {
    const group = (
      await http()
        .post('/api/v1/groups')
        .set('Cookie', ada.cookie)
        .send({ name: 'Famille' })
        .expect(201)
    ).body as GroupDetails;
    await http()
      .post('/api/v1/groups/join')
      .set('Cookie', bob.cookie)
      .send({ inviteCode: group.inviteCode })
      .expect(201);
    const list = (
      await http()
        .post('/api/v1/lists')
        .set('Cookie', ada.cookie)
        .send({ name: 'Courses', icon: 'cart', color: '#2ecb70' })
        .expect(201)
    ).body as ListDetail;
    await http()
      .post(`/api/v1/lists/${list.id}/members`)
      .set('Cookie', ada.cookie)
      .send({ userId: bob.user.id, role: 'editor' })
      .expect(201);

    await testApp.app.listen(0);
    const server = testApp.app.getHttpServer() as unknown as Server;
    const { port } = server.address() as AddressInfo;
    const stream = await openStream(port, bob.cookie);
    try {
      expect(stream.status).toBe(200);
      expect(stream.headers['content-type']).toContain('text/event-stream');
      expect(stream.headers['x-accel-buffering']).toBe('no');

      await http()
        .post(`/api/v1/lists/${list.id}/sections`)
        .set('Cookie', ada.cookie)
        .send({ name: 'Frais', color: '#23c666' })
        .expect(201);
      await expect(stream.next()).resolves.toEqual({
        type: 'list.changed',
        data: { type: 'list.changed', listId: list.id },
      });

      await http()
        .delete(`/api/v1/lists/${list.id}`)
        .set('Cookie', ada.cookie)
        .expect(204);
      await expect(stream.next()).resolves.toEqual({
        type: 'list.removed',
        data: { type: 'list.removed', listId: list.id },
      });
    } finally {
      stream.close();
    }
  });

  it('tells someone at once that they got a friend request, and the sender once accepted', async () => {
    await testApp.app.listen(0);
    const server = testApp.app.getHttpServer() as unknown as Server;
    const { port } = server.address() as AddressInfo;
    const bobStream = await openStream(port, bob.cookie);
    const adaStream = await openStream(port, ada.cookie);
    try {
      await http()
        .post('/api/v1/friends/requests')
        .set('Cookie', ada.cookie)
        .send({ userId: bob.user.id })
        .expect(201);
      await expect(bobStream.next()).resolves.toEqual({
        type: 'friend.requested',
        data: {
          type: 'friend.requested',
          user: expect.objectContaining({
            id: ada.user.id,
            username: 'ada',
          }) as unknown,
        },
      });

      const { incoming } = (
        await http()
          .get('/api/v1/friends/requests')
          .set('Cookie', bob.cookie)
          .expect(200)
      ).body as { incoming: { id: string }[] };
      await http()
        .post(`/api/v1/friends/requests/${incoming[0].id}/accept`)
        .set('Cookie', bob.cookie)
        .expect(200);
      const accepted = await adaStream.next();
      expect(accepted).toEqual({
        type: 'friend.accepted',
        data: {
          type: 'friend.accepted',
          user: expect.objectContaining({
            id: bob.user.id,
            username: 'bob',
          }) as unknown,
        },
      });
      // Public profile only: no e-mail address travels with the event.
      expect(JSON.stringify(accepted)).not.toContain('@example.com');
    } finally {
      bobStream.close();
      adaStream.close();
    }
  });
});
