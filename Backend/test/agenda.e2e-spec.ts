import type {
  AgendaEventView,
  FriendRequests,
  ImportAgendaEventsResponse,
  NotificationsResponse,
  SaveAgendaEventRequest,
} from '@plano/common';
import request from 'supertest';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
} from './e2e-helpers';

describe('Agenda API (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;
  let bob: RegisteredUser;

  const http = () => request(testApp.app.getHttpServer());
  const meeting: SaveAgendaEventRequest = {
    title: '  Réunion  ',
    calendarId: 'travail',
    allDay: false,
    start: '2026-11-10T09:00',
    end: '2026-11-10T10:00',
    location: '',
    description: '',
    participantIds: [],
    recurrence: 'weekly',
    reminderMinutes: 15,
    color: null,
    conferenceUrl: '',
    attachments: [
      {
        id: 'file-1',
        name: 'ordre-du-jour.pdf',
        size: 1200,
        type: 'application/pdf',
      },
    ],
    notes: '',
    availability: 'busy',
    visibility: 'default',
  };
  const notifications = async (user: RegisteredUser) =>
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

  async function befriend(): Promise<void> {
    await http()
      .post('/api/v1/friends/requests')
      .set('Cookie', ada.cookie)
      .send({ userId: bob.user.id })
      .expect(201);
    const requests = (
      await http()
        .get('/api/v1/friends/requests')
        .set('Cookie', bob.cookie)
        .expect(200)
    ).body as FriendRequests;
    await http()
      .post(`/api/v1/friends/requests/${requests.incoming[0].id}/accept`)
      .set('Cookie', bob.cookie)
      .expect(200);
  }

  it('requires a session', async () => {
    const response = await http().get('/api/v1/agenda/events').expect(401);
    expect(response.body).toMatchObject({ statusCode: 401 });
  });

  it('creates a trimmed event and rejects invalid or unexpected fields', async () => {
    const created = (
      await http()
        .post('/api/v1/agenda/events')
        .set('Cookie', ada.cookie)
        .send(meeting)
        .expect(201)
    ).body as AgendaEventView;
    expect(created).toMatchObject({
      title: 'Réunion',
      recurrence: 'weekly',
      mine: true,
      attachments: meeting.attachments,
    });

    for (const body of [
      { ...meeting, conferenceUrl: 'javascript:alert(1)' },
      { ...meeting, start: '10/11/2026 09:00' },
      { ...meeting, end: '2026-11-10T08:00' },
      { ...meeting, recurrence: 'hourly' },
      { ...meeting, title: '   ' },
      { ...meeting, participantIds: [bob.user.id] },
      { ...meeting, ownerId: bob.user.id },
    ]) {
      await http()
        .post('/api/v1/agenda/events')
        .set('Cookie', ada.cookie)
        .send(body)
        .expect(400);
    }
    const all = (
      await http()
        .get('/api/v1/agenda/events')
        .set('Cookie', ada.cookie)
        .expect(200)
    ).body as AgendaEventView[];
    expect(all.map(({ id }) => id)).toEqual([created.id]);
  });

  it('invites a friend, who accepts, and tells each of them', async () => {
    await befriend();
    const created = (
      await http()
        .post('/api/v1/agenda/events')
        .set('Cookie', ada.cookie)
        .send({ ...meeting, participantIds: [bob.user.id] })
        .expect(201)
    ).body as AgendaEventView;

    const invited = await notifications(bob);
    expect(invited.unread.agenda).toBe(1);
    expect(invited.items[0]).toMatchObject({
      area: 'agenda',
      kind: 'agenda.invited',
      targetId: created.id,
      title: 'Réunion',
      actor: { id: ada.user.id },
    });
    const [pending] = (
      await http()
        .get('/api/v1/agenda/events')
        .set('Cookie', bob.cookie)
        .expect(200)
    ).body as AgendaEventView[];
    expect(pending).toMatchObject({
      id: created.id,
      mine: false,
      status: 'pending',
    });

    // A guest cannot change it, nor answer for nothing.
    await http()
      .put(`/api/v1/agenda/events/${created.id}`)
      .set('Cookie', bob.cookie)
      .send({ ...meeting, title: 'Annulé' })
      .expect(403);
    await http()
      .post(`/api/v1/agenda/events/${created.id}/response`)
      .set('Cookie', bob.cookie)
      .send({ status: 'pending' })
      .expect(400);

    const accepted = (
      await http()
        .post(`/api/v1/agenda/events/${created.id}/response`)
        .set('Cookie', bob.cookie)
        .send({
          status: 'accepted',
          calendarId: 'personnel',
          reminderMinutes: null,
        })
        .expect(200)
    ).body as AgendaEventView;
    expect(accepted).toMatchObject({
      status: 'accepted',
      calendarId: 'personnel',
      title: 'Réunion',
    });
    expect((await notifications(ada)).items[0]).toMatchObject({
      kind: 'agenda.accepted',
      targetId: created.id,
      actor: { id: bob.user.id },
    });

    await http()
      .delete(`/api/v1/agenda/events/${created.id}`)
      .set('Cookie', ada.cookie)
      .expect(204);
    const gone = await http()
      .get(`/api/v1/agenda/events/${created.id}`)
      .set('Cookie', bob.cookie)
      .expect(404);
    expect(gone.body).toMatchObject({ message: 'Événement introuvable.' });
    const left = await notifications(bob);
    expect(left.items.filter(({ area }) => area === 'agenda')).toEqual([]);
    expect(left.unread.agenda).toBe(0);
  });

  it('imports what a browser stored, once', async () => {
    const fields: Partial<SaveAgendaEventRequest> = { ...meeting };
    delete fields.participantIds;
    const send = () =>
      http()
        .post('/api/v1/agenda/events/import')
        .set('Cookie', ada.cookie)
        .send({ events: [{ ...fields, localId: 'event-1a2b3c4d' }] })
        .expect(200);

    expect((await send()).body as ImportAgendaEventsResponse).toEqual({
      imported: 1,
    });
    expect((await send()).body as ImportAgendaEventsResponse).toEqual({
      imported: 0,
    });
    const all = (
      await http()
        .get('/api/v1/agenda/events')
        .set('Cookie', ada.cookie)
        .expect(200)
    ).body as AgendaEventView[];
    expect(all.map(({ title }) => title)).toEqual(['Réunion']);
  });
});
