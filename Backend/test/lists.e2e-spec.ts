import type {
  ListDetail,
  ListEntry,
  ListSection,
  ListSettings,
  ListSummary,
} from '@plano/common';
import request from 'supertest';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';
import type { GroupDetails } from './../src/groups/group.types';

describe('Lists API (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;
  let bob: RegisteredUser;
  let list: ListDetail;

  const http = () => request(testApp.app.getHttpServer());

  beforeEach(async () => {
    testApp = await createTestApp();
    ada = await registerUser(testApp.app, 'ada');
    bob = await registerUser(testApp.app, 'bob');
    const group = await http()
      .post('/api/v1/groups')
      .set('Cookie', ada.cookie)
      .send({ name: 'Famille' })
      .expect(201);
    await http()
      .post('/api/v1/groups/join')
      .set('Cookie', bob.cookie)
      .send({ inviteCode: (group.body as GroupDetails).inviteCode })
      .expect(201);

    list = (
      await http()
        .post('/api/v1/lists')
        .set('Cookie', ada.cookie)
        .send({ name: '  Courses  ', icon: 'cart', color: '#2ecb70' })
        .expect(201)
    ).body as ListDetail;
  });

  afterEach(() => testApp.close());

  it('requires a session', async () => {
    await http().get('/api/v1/lists').expect(401);
    await http().get('/api/v1/settings/lists').expect(401);
  });

  it('creates a trimmed list and rejects invalid or unexpected fields', async () => {
    expect(list).toMatchObject({
      name: 'Courses',
      role: 'owner',
      sections: [],
    });

    for (const body of [
      { name: 'X', icon: 'rocket', color: '#2ecb70' },
      { name: 'X', icon: 'cart', color: 'green' },
      { name: '   ', icon: 'cart', color: '#2ecb70' },
      { name: 'X', icon: 'cart', color: '#2ecb70', ownerId: bob.user.id },
    ]) {
      await http()
        .post('/api/v1/lists')
        .set('Cookie', ada.cookie)
        .send(body)
        .expect(400);
    }
    await http()
      .get('/api/v1/lists/not-a-uuid')
      .set('Cookie', ada.cookie)
      .expect(400);
  });

  it('edits content, shares it in the group and enforces roles', async () => {
    const section = (
      await http()
        .post(`/api/v1/lists/${list.id}/sections`)
        .set('Cookie', ada.cookie)
        .send({ name: 'Frais', color: '#23c666' })
        .expect(201)
    ).body as ListSection;
    const addEntry = async (name: string) =>
      (
        await http()
          .post(`/api/v1/lists/${list.id}/sections/${section.id}/entries`)
          .set('Cookie', ada.cookie)
          .send({ name })
          .expect(201)
      ).body as ListEntry;
    const milk = await addEntry('Lait');
    const eggs = await addEntry('Œufs');

    await http()
      .patch(`/api/v1/lists/${list.id}/entries/${milk.id}`)
      .set('Cookie', ada.cookie)
      .send({ done: true, reminder: '2026-10-15T18:00' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          done: true,
          reminder: '2026-10-15T18:00',
          addedBy: 'Ada Doe',
        });
      });
    await http()
      .patch(`/api/v1/lists/${list.id}/entries/${milk.id}`)
      .set('Cookie', ada.cookie)
      .send({ done: null })
      .expect(400);
    await http()
      .put(`/api/v1/lists/${list.id}/sections/${section.id}/order`)
      .set('Cookie', ada.cookie)
      .send({ entryIds: [eggs.id, milk.id] })
      .expect(204);

    // Not shared yet: invisible to Bob.
    await http()
      .get(`/api/v1/lists/${list.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);

    await http()
      .post(`/api/v1/lists/${list.id}/members`)
      .set('Cookie', ada.cookie)
      .send({ userId: bob.user.id, role: 'viewer' })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({
          id: bob.user.id,
          name: 'Bob Doe',
          role: 'viewer',
        });
      });

    const shared = (
      await http()
        .get(`/api/v1/lists/${list.id}`)
        .set('Cookie', bob.cookie)
        .expect(200)
    ).body as ListDetail;
    expect(shared).toMatchObject({
      ownership: 'shared',
      role: 'viewer',
      completed: 1,
      total: 2,
      memberCount: 2,
    });
    expect(shared.sections[0].entries.map(({ name }) => name)).toEqual([
      'Œufs',
      'Lait',
    ]);

    await http()
      .post(`/api/v1/lists/${list.id}/sections/${section.id}/entries`)
      .set('Cookie', bob.cookie)
      .send({ name: 'Pain' })
      .expect(403);
    await http()
      .patch(`/api/v1/lists/${list.id}/members/${bob.user.id}`)
      .set('Cookie', ada.cookie)
      .send({ role: 'editor' })
      .expect(200);
    await http()
      .post(`/api/v1/lists/${list.id}/sections/${section.id}/entries`)
      .set('Cookie', bob.cookie)
      .send({ name: 'Pain' })
      .expect(201);
    await http()
      .patch(`/api/v1/lists/${list.id}`)
      .set('Cookie', bob.cookie)
      .send({ name: 'X' })
      .expect(403);

    const reminders = await http()
      .get('/api/v1/lists/reminders')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(reminders.body).toEqual([
      expect.objectContaining({ entryId: milk.id, listName: 'Courses' }),
    ]);

    const bobLists = await http()
      .get('/api/v1/lists')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect((bobLists.body as ListSummary[]).map(({ id }) => id)).toEqual([
      list.id,
    ]);

    await http()
      .delete(`/api/v1/lists/${list.id}/members`)
      .set('Cookie', ada.cookie)
      .expect(204);
    await http()
      .get(`/api/v1/lists/${list.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);
  });

  it('renames and deletes a section with its entries', async () => {
    const sectionUrl = async (name: string) => {
      const section = (
        await http()
          .post(`/api/v1/lists/${list.id}/sections`)
          .set('Cookie', ada.cookie)
          .send({ name, color: '#23c666' })
          .expect(201)
      ).body as ListSection;
      return `/api/v1/lists/${list.id}/sections/${section.id}`;
    };
    const fresh = await sectionUrl('Frais');
    const pantry = await sectionUrl('Épicerie');
    await http()
      .post(`${fresh}/entries`)
      .set('Cookie', ada.cookie)
      .send({ name: 'Lait' })
      .expect(201);

    await http()
      .patch(fresh)
      .set('Cookie', ada.cookie)
      .send({ name: '   ' })
      .expect(400);
    await http()
      .patch(fresh)
      .set('Cookie', ada.cookie)
      .send({ name: '  Produits frais  ', color: '#000000' })
      .expect(400);
    await http()
      .patch(fresh)
      .set('Cookie', ada.cookie)
      .send({ name: '  Produits frais  ' })
      .expect(204);
    const sectionId = (url: string) => url.split('/').pop() as string;
    await http()
      .put(`/api/v1/lists/${list.id}/sections/order`)
      .set('Cookie', ada.cookie)
      .send({ sectionIds: [sectionId(pantry), sectionId(fresh)] })
      .expect(204);
    await http()
      .put(`/api/v1/lists/${list.id}/sections/order`)
      .set('Cookie', ada.cookie)
      .send({ sectionIds: ['not-a-uuid'] })
      .expect(400);
    await http()
      .get(`/api/v1/lists/${list.id}`)
      .set('Cookie', ada.cookie)
      .expect(200)
      .expect((response) => {
        expect(
          (response.body as ListDetail).sections.map(({ name }) => name),
        ).toEqual(['Épicerie', 'Produits frais']);
      });

    await http().delete(pantry).set('Cookie', ada.cookie).expect(204);
    await http().delete(pantry).set('Cookie', ada.cookie).expect(404);

    const detail = (
      await http()
        .get(`/api/v1/lists/${list.id}`)
        .set('Cookie', ada.cookie)
        .expect(200)
    ).body as ListDetail;
    expect(
      detail.sections.map(({ name, entries }) => ({
        name,
        entries: entries.map((entry) => entry.name),
      })),
    ).toEqual([{ name: 'Produits frais', entries: ['Lait'] }]);

    await http().delete(fresh).set('Cookie', ada.cookie).expect(204);
    await http()
      .get(`/api/v1/lists/${list.id}`)
      .set('Cookie', ada.cookie)
      .expect(200)
      .expect((response) => {
        expect((response.body as ListDetail).sections).toEqual([]);
      });
  });

  it('deletes a list for its owner only', async () => {
    await http()
      .delete(`/api/v1/lists/${list.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);
    await http()
      .delete(`/api/v1/lists/${list.id}`)
      .set('Cookie', ada.cookie)
      .expect(204);
    await http()
      .get(`/api/v1/lists/${list.id}`)
      .set('Cookie', ada.cookie)
      .expect(404);
  });

  it('stores list settings per user', async () => {
    await http()
      .patch('/api/v1/settings/lists')
      .set('Cookie', ada.cookie)
      .send({ defaultView: 'grid', defaultReminder: '25:00' })
      .expect(400);
    await http()
      .patch('/api/v1/settings/lists')
      .set('Cookie', ada.cookie)
      .send({ defaultView: 'grid' })
      .expect(200);

    const settings = await http()
      .get('/api/v1/settings/lists')
      .set('Cookie', ada.cookie)
      .expect(200);
    expect((settings.body as ListSettings).defaultView).toBe('grid');
    const others = await http()
      .get('/api/v1/settings/lists')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect((others.body as ListSettings).defaultView).toBe('list');
  });
});
