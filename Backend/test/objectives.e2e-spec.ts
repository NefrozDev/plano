import type {
  ImportObjectivesResponse,
  ObjectiveDetail,
  ObjectiveSummary,
} from '@plano/common';
import request from 'supertest';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';

const newObjective = {
  title: '  Courir  ',
  category: 'health',
  completion: 'metric',
  startDate: '2026-10-01',
  metric: { unit: 'km', target: 10, aggregation: 'sum' },
};

describe('Objectives API (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;
  let bob: RegisteredUser;

  const http = () => request(testApp.app.getHttpServer());
  const create = async (body: object = newObjective) =>
    (
      await http()
        .post('/api/v1/objectives')
        .set('Cookie', ada.cookie)
        .send(body)
        .expect(201)
    ).body as ObjectiveDetail;

  beforeEach(async () => {
    testApp = await createTestApp();
    ada = await registerUser(testApp.app, 'ada');
    bob = await registerUser(testApp.app, 'bob');
  });

  afterEach(() => testApp.close());

  it('requires a session', async () => {
    await http().get('/api/v1/objectives').expect(401);
    await http().post('/api/v1/objectives').send(newObjective).expect(401);
  });

  it('creates a trimmed objective and lists it', async () => {
    const objective = await create();
    expect(objective).toMatchObject({
      title: 'Courir',
      role: 'owner',
      percent: 0,
    });

    const list = await http()
      .get('/api/v1/objectives')
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((list.body as ObjectiveSummary[]).map(({ id }) => id)).toEqual([
      objective.id,
    ]);
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['an unknown category', { category: 'rocket' }],
    ['an unknown mode', { completion: 'magic' }],
    ['an impossible date', { startDate: '2026-02-31' }],
    ['a date in another format', { startDate: '01/10/2026' }],
    ['a null title', { title: null }],
    ['a field that is not allowed', { ownerId: 'someone' }],
    [
      'a target of zero',
      { metric: { unit: 'km', target: 0, aggregation: 'sum' } },
    ],
    ['a metric without a unit', { metric: { target: 1, aggregation: 'sum' } }],
    [
      'a bad reminder time',
      { reminder: { frequency: 'daily', time: '25:00', weekday: 0 } },
    ],
    ['a parent that is not an id', { parentId: 'not-an-id' }],
    ['a weight out of range', { weight: 0 }],
    ['a blank sub-objective', { children: ['   '] }],
  ])('rejects %s', async (_, changes) => {
    await http()
      .post('/api/v1/objectives')
      .set('Cookie', ada.cookie)
      .send({ ...newObjective, ...changes })
      .expect(400);
  });

  it('builds a tree and reads it level by level', async () => {
    const top = await create({
      ...newObjective,
      completion: 'children',
      metric: undefined,
      children: ['Un'],
    });
    const child = await create({
      ...newObjective,
      completion: 'manual',
      metric: undefined,
      parentId: top.children[0].id,
    });

    const response = await http()
      .get(`/api/v1/objectives/${child.id}`)
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((response.body as ObjectiveDetail).breadcrumb).toEqual([
      { id: top.id, title: 'Courir' },
      { id: top.children[0].id, title: 'Un' },
    ]);
  });

  it('tracks progress through every route', async () => {
    const metric = await create();
    const added = await http()
      .post(`/api/v1/objectives/${metric.id}/sessions`)
      .set('Cookie', ada.cookie)
      .send({ date: '2026-10-02', status: 'done', label: 'Sortie', value: 10 })
      .expect(201);
    const withSession = added.body as ObjectiveDetail;
    expect(withSession.status).toBe('completed');
    const removed = await http()
      .delete(
        `/api/v1/objectives/${metric.id}/sessions/${withSession.sessions[0].id}`,
      )
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((removed.body as ObjectiveDetail).status).toBe('active');

    const habit = await create({
      ...newObjective,
      completion: 'habit',
      metric: undefined,
      habitTargetDays: 1,
    });
    const checked = await http()
      .put(`/api/v1/objectives/${habit.id}/check-ins/2026-10-02`)
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((checked.body as ObjectiveDetail).percent).toBe(100);
    const unchecked = await http()
      .delete(`/api/v1/objectives/${habit.id}/check-ins/2026-10-02`)
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((unchecked.body as ObjectiveDetail).percent).toBe(0);
    await http()
      .put(`/api/v1/objectives/${habit.id}/check-ins/not-a-date`)
      .set('Cookie', ada.cookie)
      .expect(400);

    const manual = await create({
      ...newObjective,
      completion: 'manual',
      metric: undefined,
    });
    const set = await http()
      .put(`/api/v1/objectives/${manual.id}/progress`)
      .set('Cookie', ada.cookie)
      .send({ percent: 60 })
      .expect(200);
    expect((set.body as ObjectiveDetail).percent).toBe(60);
    await http()
      .put(`/api/v1/objectives/${manual.id}/progress`)
      .set('Cookie', ada.cookie)
      .send({ percent: 120 })
      .expect(400);

    const plain = await create({
      ...newObjective,
      completion: 'none',
      metric: undefined,
    });
    const completed = await http()
      .put(`/api/v1/objectives/${plain.id}/completed`)
      .set('Cookie', ada.cookie)
      .send({ completed: true })
      .expect(200);
    expect((completed.body as ObjectiveDetail).status).toBe('completed');
  });

  it('keeps each person’s order and preferences to themselves', async () => {
    const first = await create();
    const second = await create();
    await http()
      .put('/api/v1/objectives/order')
      .set('Cookie', ada.cookie)
      .send({ objectiveIds: [second.id, first.id] })
      .expect(204);
    const pinned = await http()
      .patch(`/api/v1/objectives/${first.id}/preferences`)
      .set('Cookie', ada.cookie)
      .send({ onHome: true })
      .expect(200);
    expect((pinned.body as ObjectiveDetail).onHome).toBe(true);

    const list = await http()
      .get('/api/v1/objectives')
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((list.body as ObjectiveSummary[]).map(({ id }) => id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it('edits, reorders children and deletes', async () => {
    const top = await create({
      ...newObjective,
      completion: 'children',
      metric: undefined,
      children: ['Un', 'Deux'],
    });
    const edited = await http()
      .patch(`/api/v1/objectives/${top.id}`)
      .set('Cookie', ada.cookie)
      .send({ title: '  Nager  ' })
      .expect(200);
    expect((edited.body as ObjectiveDetail).title).toBe('Nager');

    const reordered = await http()
      .put(`/api/v1/objectives/${top.id}/children/order`)
      .set('Cookie', ada.cookie)
      .send({ objectiveIds: [top.children[1].id, top.children[0].id] })
      .expect(200);
    expect(
      (reordered.body as ObjectiveDetail).children.map(({ title }) => title),
    ).toEqual(['Deux', 'Un']);

    await http()
      .delete(`/api/v1/objectives/${top.id}`)
      .set('Cookie', ada.cookie)
      .expect(204);
    await http()
      .get(`/api/v1/objectives/${top.id}`)
      .set('Cookie', ada.cookie)
      .expect(404);
  });

  it('answers 404 to other people, on every route', async () => {
    const objective = await create();
    const url = `/api/v1/objectives/${objective.id}`;

    await http().get(url).set('Cookie', bob.cookie).expect(404);
    await http()
      .patch(url)
      .set('Cookie', bob.cookie)
      .send({ title: 'X' })
      .expect(404);
    await http().delete(url).set('Cookie', bob.cookie).expect(404);
    await http()
      .post(`${url}/sessions`)
      .set('Cookie', bob.cookie)
      .send({ date: '2026-10-02', status: 'done', label: '', value: 1 })
      .expect(404);
    await http()
      .patch(`${url}/preferences`)
      .set('Cookie', bob.cookie)
      .send({ onHome: true })
      .expect(404);
    await http()
      .post('/api/v1/objectives')
      .set('Cookie', bob.cookie)
      .send({ ...newObjective, parentId: objective.id })
      .expect(404);

    const list = await http()
      .get('/api/v1/objectives')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('rejects an id that is not one', async () => {
    await http()
      .get('/api/v1/objectives/not-an-id')
      .set('Cookie', ada.cookie)
      .expect(400);
  });

  it('imports what a browser stored, once', async () => {
    const body = {
      objectives: [
        {
          localId: 'lire',
          title: 'Lire',
          category: 'learning',
          tracking: 'steps',
          status: 'active',
          archived: false,
          createdOn: '2026-09-01',
          dueDate: null,
          completedOn: null,
          description: '',
          plan: '',
          reminder: { frequency: 'none', time: '09:00', weekday: 0 },
          dueReminder: 'none',
          metric: null,
          sessions: [],
          steps: [{ label: 'Un livre', done: true, completedOn: null }],
          habit: null,
        },
      ],
    };
    const first = await http()
      .post('/api/v1/objectives/import')
      .set('Cookie', ada.cookie)
      .send(body)
      .expect(200);
    expect((first.body as ImportObjectivesResponse).imported).toBe(1);
    const second = await http()
      .post('/api/v1/objectives/import')
      .set('Cookie', ada.cookie)
      .send(body)
      .expect(200);
    expect((second.body as ImportObjectivesResponse).imported).toBe(0);

    await http()
      .post('/api/v1/objectives/import')
      .set('Cookie', ada.cookie)
      .send({ objectives: [{ localId: 'x' }] })
      .expect(400);
  });
});
