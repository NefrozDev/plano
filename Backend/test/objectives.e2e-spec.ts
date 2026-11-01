import type {
  ImportObjectivesResponse,
  ObjectiveActivityEntry,
  ObjectiveCommentEntry,
  ObjectiveDetail,
  ObjectiveSummary,
  ObjectiveTemplateSummary,
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

  it('serves what was pinned to the home page', async () => {
    const pinned = await create();
    await create();
    await http()
      .patch(`/api/v1/objectives/${pinned.id}/preferences`)
      .set('Cookie', ada.cookie)
      .send({ onHome: true })
      .expect(200);

    const home = await http()
      .get('/api/v1/objectives/home')
      .set('Cookie', ada.cookie)
      .expect(200);

    expect((home.body as ObjectiveSummary[]).map(({ id }) => id)).toEqual([
      pinned.id,
    ]);
    await http().get('/api/v1/objectives/home').expect(401);
  });

  it('serves what is dated for the agenda', async () => {
    const dated = await create({ ...newObjective, dueDate: '2026-12-01' });

    const agenda = await http()
      .get('/api/v1/objectives/agenda')
      .set('Cookie', ada.cookie)
      .expect(200);

    expect(agenda.body).toEqual([
      expect.objectContaining({ kind: 'deadline', objectiveId: dated.id }),
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

  describe('sharing', () => {
    let top: ObjectiveDetail;
    let branch: ObjectiveDetail;

    beforeEach(async () => {
      const group = await http()
        .post('/api/v1/groups')
        .set('Cookie', ada.cookie)
        .send({ name: 'Famille' })
        .expect(201);
      await http()
        .post('/api/v1/groups/join')
        .set('Cookie', bob.cookie)
        .send({ inviteCode: (group.body as { inviteCode: string }).inviteCode })
        .expect(201);
      top = await create({
        ...newObjective,
        title: 'Haut',
        completion: 'children',
        metric: undefined,
        children: ['Branche', 'Autre'],
      });
      branch = (
        await http()
          .get(`/api/v1/objectives/${top.children[0].id}`)
          .set('Cookie', ada.cookie)
          .expect(200)
      ).body as ObjectiveDetail;
    });

    const invite = (role: string, id = branch.id, cookie = ada.cookie) =>
      http()
        .post(`/api/v1/objectives/${id}/members`)
        .set('Cookie', cookie)
        .send({ userId: bob.user.id, role });

    it('shares one branch, and nothing around it', async () => {
      await invite('contributor').expect(201);

      const list = await http()
        .get('/api/v1/objectives')
        .set('Cookie', bob.cookie)
        .expect(200);
      expect((list.body as ObjectiveSummary[]).map(({ id }) => id)).toEqual([
        branch.id,
      ]);

      const seen = await http()
        .get(`/api/v1/objectives/${branch.id}`)
        .set('Cookie', bob.cookie)
        .expect(200);
      expect(seen.body).toMatchObject({
        role: 'contributor',
        parentId: null,
        breadcrumb: [{ id: null, title: 'Haut' }],
      });

      for (const id of [top.id, top.children[1].id]) {
        await http()
          .get(`/api/v1/objectives/${id}`)
          .set('Cookie', bob.cookie)
          .expect(404);
      }
    });

    it('forbids what a role does not allow', async () => {
      await invite('viewer').expect(201);
      const url = `/api/v1/objectives/${branch.id}`;

      await http()
        .put(`${url}/completed`)
        .set('Cookie', bob.cookie)
        .send({ completed: true })
        .expect(403);
      await http()
        .patch(url)
        .set('Cookie', bob.cookie)
        .send({ title: 'X' })
        .expect(403);
      await http().delete(url).set('Cookie', bob.cookie).expect(403);
      await invite('viewer', branch.id, bob.cookie).expect(403);
    });

    it('changes roles, removes people, and lets them leave', async () => {
      await invite('viewer').expect(201);
      const url = `/api/v1/objectives/${branch.id}/members`;

      const updated = await http()
        .patch(`${url}/${bob.user.id}`)
        .set('Cookie', ada.cookie)
        .send({ role: 'contributor' })
        .expect(200);
      expect((updated.body as ObjectiveDetail).sharing).toBe('common');
      await http()
        .patch(`${url}/${bob.user.id}`)
        .set('Cookie', ada.cookie)
        .send({ role: 'owner' })
        .expect(400);

      await http().delete(`${url}/me`).set('Cookie', bob.cookie).expect(204);
      await http()
        .get(`/api/v1/objectives/${branch.id}`)
        .set('Cookie', bob.cookie)
        .expect(404);

      await invite('viewer').expect(201);
      const removed = await http()
        .delete(`${url}/${bob.user.id}`)
        .set('Cookie', ada.cookie)
        .expect(200);
      expect((removed.body as ObjectiveDetail).sharing).toBe('private');
    });

    it('rejects a bad invitation', async () => {
      await invite('owner').expect(400);
      await http()
        .post(`/api/v1/objectives/${branch.id}/members`)
        .set('Cookie', ada.cookie)
        .send({ userId: 'not-an-id', role: 'viewer' })
        .expect(400);
      await invite('viewer').expect(201);
      await invite('viewer').expect(409);
    });

    it('assigns, and refuses someone without access', async () => {
      const url = `/api/v1/objectives/${branch.id}`;
      await http()
        .patch(url)
        .set('Cookie', ada.cookie)
        .send({ assignedToUserId: bob.user.id })
        .expect(400);

      await invite('contributor').expect(201);
      const assigned = await http()
        .patch(url)
        .set('Cookie', ada.cookie)
        .send({ assignedToUserId: bob.user.id })
        .expect(200);
      expect((assigned.body as ObjectiveDetail).assignee?.id).toBe(bob.user.id);
    });

    it('invites while creating', async () => {
      const shared = await create({
        ...newObjective,
        members: [{ userId: bob.user.id, role: 'viewer' }],
      });
      expect(shared.sharing).toBe('shared');
    });
  });

  it('serves the history and the comments, to those who can open it', async () => {
    const objective = await create();
    const url = `/api/v1/objectives/${objective.id}`;

    const history = await http()
      .get(`${url}/activity`)
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((history.body as ObjectiveActivityEntry[])[0].kind).toBe('created');

    const added = await http()
      .post(`${url}/comments`)
      .set('Cookie', ada.cookie)
      .send({ body: '  Courage  ' })
      .expect(201);
    const comment = added.body as ObjectiveCommentEntry;
    expect(comment.body).toBe('Courage');
    for (const body of [{ body: '   ' }, { body: 'x'.repeat(1001) }, {}]) {
      await http()
        .post(`${url}/comments`)
        .set('Cookie', ada.cookie)
        .send(body)
        .expect(400);
    }

    const comments = await http()
      .get(`${url}/comments`)
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((comments.body as ObjectiveCommentEntry[]).length).toBe(1);

    for (const path of ['activity', 'comments']) {
      await http().get(`${url}/${path}`).set('Cookie', bob.cookie).expect(404);
    }
    await http()
      .post(`${url}/comments`)
      .set('Cookie', bob.cookie)
      .send({ body: 'Coucou' })
      .expect(404);
    await http()
      .delete(`${url}/comments/${comment.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);

    await http()
      .delete(`${url}/comments/${comment.id}`)
      .set('Cookie', ada.cookie)
      .expect(204);
  });

  it('repeats an objective, for top-level ones only', async () => {
    const top = await create({ ...newObjective, recurrence: 'monthly' });
    expect(top.recurrence).toBe('monthly');

    await http()
      .post('/api/v1/objectives')
      .set('Cookie', ada.cookie)
      .send({ ...newObjective, recurrence: 'daily' })
      .expect(400);
    await http()
      .post('/api/v1/objectives')
      .set('Cookie', ada.cookie)
      .send({ ...newObjective, parentId: top.id, recurrence: 'weekly' })
      .expect(400);
  });

  it('saves a template, keeps it private, and uses it', async () => {
    const objective = await create();
    await http()
      .post(`/api/v1/objectives/${objective.id}/template`)
      .set('Cookie', ada.cookie)
      .send({ name: '   ' })
      .expect(400);
    const saved = await http()
      .post(`/api/v1/objectives/${objective.id}/template`)
      .set('Cookie', ada.cookie)
      .send({ name: '  Modèle  ' })
      .expect(201);
    const template = saved.body as ObjectiveTemplateSummary;
    expect(template).toMatchObject({ name: 'Modèle', nodeCount: 1 });

    const list = await http()
      .get('/api/v1/objectives/templates')
      .set('Cookie', ada.cookie)
      .expect(200);
    expect(list.body).toEqual([template]);
    const others = await http()
      .get('/api/v1/objectives/templates')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(others.body).toEqual([]);

    const use = `/api/v1/objectives/templates/${template.id}/use`;
    await http()
      .post(use)
      .set('Cookie', bob.cookie)
      .send({ startDate: '2026-11-01' })
      .expect(404);
    await http()
      .post(use)
      .set('Cookie', ada.cookie)
      .send({ startDate: 'bientôt' })
      .expect(400);
    const made = await http()
      .post(use)
      .set('Cookie', ada.cookie)
      .send({ startDate: '2026-11-01' })
      .expect(201);
    expect((made.body as ObjectiveDetail).id).not.toBe(objective.id);

    await http()
      .delete(`/api/v1/objectives/templates/${template.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);
    await http()
      .delete(`/api/v1/objectives/templates/${template.id}`)
      .set('Cookie', ada.cookie)
      .expect(204);
    await http().get('/api/v1/objectives/templates').expect(401);
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
