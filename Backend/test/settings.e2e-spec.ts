import type { AgendaUserSettings, ObjectiveUserSettings } from '@plano/common';
import request from 'supertest';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';

describe('Agenda and objectives settings API (e2e)', () => {
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
    for (const path of [
      '/api/v1/settings/agenda',
      '/api/v1/settings/objectives',
    ]) {
      const read = await http().get(path).expect(401);
      expect(read.body).toMatchObject({ statusCode: 401 });
      const write = await http().patch(path).send({}).expect(401);
      expect(write.body).toMatchObject({ statusCode: 401 });
    }
  });

  it('keeps the agenda settings per user, across sessions', async () => {
    const changed = await http()
      .patch('/api/v1/settings/agenda')
      .set('Cookie', ada.cookie)
      .send({ weekStartsOn: 0, calendarColors: { travail: '#22a95a' } })
      .expect(200);
    expect(changed.body).toMatchObject({
      weekStartsOn: 0,
      calendarColors: { travail: '#22a95a' },
    });

    const read = await http()
      .get('/api/v1/settings/agenda')
      .set('Cookie', ada.cookie)
      .expect(200);
    expect(read.body).toEqual(changed.body);
    const others = await http()
      .get('/api/v1/settings/agenda')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(others.body as AgendaUserSettings).toMatchObject({
      weekStartsOn: 1,
      calendarColors: {},
    });
  });

  it('refuses invalid or unknown agenda fields and changes nothing', async () => {
    for (const body of [
      { calendarColors: { travail: 'red; background: url(x)' } },
      { hourFormat: '13h' },
      { userId: bob.user.id },
    ]) {
      const response = await http()
        .patch('/api/v1/settings/agenda')
        .set('Cookie', ada.cookie)
        .send(body)
        .expect(400);
      expect(response.body).toMatchObject({ statusCode: 400 });
    }

    const read = await http()
      .get('/api/v1/settings/agenda')
      .set('Cookie', ada.cookie)
      .expect(200);
    expect(read.body as AgendaUserSettings).toMatchObject({
      hourFormat: '24h',
      calendarColors: {},
    });
  });

  it('keeps the objectives settings per user and refuses invalid ones', async () => {
    await http()
      .patch('/api/v1/settings/objectives')
      .set('Cookie', ada.cookie)
      .send({ defaultView: 'cards' })
      .expect(400);
    const changed = await http()
      .patch('/api/v1/settings/objectives')
      .set('Cookie', ada.cookie)
      .send({ defaultView: 'grid', showPercentage: false })
      .expect(200);
    expect(changed.body).toMatchObject({
      defaultView: 'grid',
      showPercentage: false,
      showArchived: false,
    });

    const others = await http()
      .get('/api/v1/settings/objectives')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect((others.body as ObjectiveUserSettings).defaultView).toBe('list');
  });
});
