import type { ListDetail, ObjectiveDetail } from '@plano/common';
import request from 'supertest';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';

describe('Objective lists (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;
  let bob: RegisteredUser;

  const http = () => request(testApp.app.getHttpServer());
  const objective = async (user: RegisteredUser) =>
    (
      await http()
        .post('/api/v1/objectives')
        .set('Cookie', user.cookie)
        .send({
          title: 'Voyage',
          category: 'other',
          completion: 'list',
          startDate: '2026-10-01',
        })
        .expect(201)
    ).body as ObjectiveDetail;
  const read = async (id: string) =>
    (
      await http()
        .get(`/api/v1/objectives/${id}`)
        .set('Cookie', ada.cookie)
        .expect(200)
    ).body as ObjectiveDetail;

  beforeEach(async () => {
    testApp = await createTestApp();
    ada = await registerUser(testApp.app, 'ada');
    bob = await registerUser(testApp.app, 'bob');
  });

  afterEach(() => testApp.close());

  it('creates a linked list whose checked items complete the objective', async () => {
    const { id } = await objective(ada);

    const created = (
      await http()
        .post(`/api/v1/objectives/${id}/lists/new`)
        .set('Cookie', ada.cookie)
        .send({ name: 'Valise', icon: 'suitcase', color: '#3264ed' })
        .expect(201)
    ).body as ObjectiveDetail;
    expect(created.lists).toEqual([
      expect.objectContaining({ name: 'Valise', done: 0, total: 0 }),
    ]);
    const listId = created.lists[0].id;

    const section = (
      await http()
        .post(`/api/v1/lists/${listId}/sections`)
        .set('Cookie', ada.cookie)
        .send({ name: 'Tout', color: '#3264ed' })
        .expect(201)
    ).body as ListDetail['sections'][number];
    const entry = (
      await http()
        .post(`/api/v1/lists/${listId}/sections/${section.id}/entries`)
        .set('Cookie', ada.cookie)
        .send({ name: 'Passeport' })
        .expect(201)
    ).body as { id: string };
    await http()
      .patch(`/api/v1/lists/${listId}/entries/${entry.id}`)
      .set('Cookie', ada.cookie)
      .send({ done: true })
      .expect(200);

    await vi.waitFor(async () =>
      expect(await read(id)).toMatchObject({
        status: 'completed',
        percent: 100,
      }),
    );
  });

  it('links and unlinks an existing list, refusing bad ids and other people’s lists', async () => {
    const { id } = await objective(ada);
    const list = (
      await http()
        .post('/api/v1/lists')
        .set('Cookie', ada.cookie)
        .send({ name: 'Papiers', icon: 'home', color: '#3264ed' })
        .expect(201)
    ).body as ListDetail;
    const bobs = (
      await http()
        .post('/api/v1/lists')
        .set('Cookie', bob.cookie)
        .send({ name: 'De Bob', icon: 'home', color: '#3264ed' })
        .expect(201)
    ).body as ListDetail;

    const invalid = await http()
      .post(`/api/v1/objectives/${id}/lists`)
      .set('Cookie', ada.cookie)
      .send({ listId: 'nope' })
      .expect(400);
    expect(invalid.body).toMatchObject({ statusCode: 400 });
    const foreign = await http()
      .post(`/api/v1/objectives/${id}/lists`)
      .set('Cookie', ada.cookie)
      .send({ listId: bobs.id })
      .expect(404);
    expect(foreign.body).toMatchObject({ message: 'Liste introuvable.' });

    const linked = (
      await http()
        .post(`/api/v1/objectives/${id}/lists`)
        .set('Cookie', ada.cookie)
        .send({ listId: list.id })
        .expect(201)
    ).body as ObjectiveDetail;
    expect(linked.lists.map(({ id: listId }) => listId)).toEqual([list.id]);

    const unlinked = (
      await http()
        .delete(`/api/v1/objectives/${id}/lists/${list.id}`)
        .set('Cookie', ada.cookie)
        .expect(200)
    ).body as ObjectiveDetail;
    expect(unlinked.lists).toEqual([]);
  });

  it('keeps someone else’s objective closed', async () => {
    const { id } = await objective(bob);

    const response = await http()
      .post(`/api/v1/objectives/${id}/lists/new`)
      .set('Cookie', ada.cookie)
      .send({ name: 'Valise', icon: 'suitcase', color: '#3264ed' })
      .expect(404);
    expect(response.body).toMatchObject({ statusCode: 404 });
    const lists = (
      await http().get('/api/v1/lists').set('Cookie', ada.cookie).expect(200)
    ).body as unknown[];
    expect(lists).toEqual([]);
  });

  it('restarts a top-level objective, and deletes it with its lists only when asked', async () => {
    const { id } = await objective(ada);
    const withList = (
      await http()
        .post(`/api/v1/objectives/${id}/lists/new`)
        .set('Cookie', ada.cookie)
        .send({ name: 'Valise', icon: 'suitcase', color: '#3264ed' })
        .expect(201)
    ).body as ObjectiveDetail;
    expect(withList.linkedListCount).toBe(1);

    const restarted = (
      await http()
        .post(`/api/v1/objectives/${id}/restart`)
        .set('Cookie', ada.cookie)
        .expect(201)
    ).body as ObjectiveDetail;
    expect(restarted.periods).toHaveLength(1);
    expect(restarted.status).toBe('active');

    const invalid = await http()
      .delete(`/api/v1/objectives/${id}?deleteLists=yes`)
      .set('Cookie', ada.cookie)
      .expect(400);
    expect(invalid.body).toMatchObject({ statusCode: 400 });

    await http()
      .delete(`/api/v1/objectives/${id}?deleteLists=true`)
      .set('Cookie', ada.cookie)
      .expect(204);
    const lists = (
      await http().get('/api/v1/lists').set('Cookie', ada.cookie).expect(200)
    ).body as unknown[];
    expect(lists).toEqual([]);
  });

  it('keeps the lists by default when deleting', async () => {
    const { id } = await objective(ada);
    await http()
      .post(`/api/v1/objectives/${id}/lists/new`)
      .set('Cookie', ada.cookie)
      .send({ name: 'Valise', icon: 'suitcase', color: '#3264ed' })
      .expect(201);

    await http()
      .delete(`/api/v1/objectives/${id}`)
      .set('Cookie', ada.cookie)
      .expect(204);

    const lists = (
      await http().get('/api/v1/lists').set('Cookie', ada.cookie).expect(200)
    ).body as { name: string; objectiveId: string | null }[];
    expect(lists.map(({ name, objectiveId }) => [name, objectiveId])).toEqual([
      ['Valise', null],
    ]);
  });
});
