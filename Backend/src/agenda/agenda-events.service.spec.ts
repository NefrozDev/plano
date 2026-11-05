import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { NotificationEntry } from '@plano/common';
import { randomUUID } from 'node:crypto';
import type { MockInstance } from 'vitest';
import type { LiveEventsService } from '../live/live-events.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SaveAgendaEventDto } from './dto/agenda-event.dto';
import { AgendaEvent } from './entities/agenda-event.entity';
import {
  createAgendaTestBed,
  type AgendaTestBed,
} from './testing/agenda-test-bed';

/** Real services on a fresh database: who sees an event, who is told what. */
describe('AgendaEventsService', () => {
  let bed: AgendaTestBed;
  let publish: MockInstance<LiveEventsService['publish']>;
  let notify: MockInstance<NotificationsService['notify']>;

  const draft = (
    changes: Partial<SaveAgendaEventDto> = {},
  ): SaveAgendaEventDto => ({
    title: 'Réunion projet',
    calendarId: 'travail',
    allDay: false,
    start: '2026-11-10T09:00',
    end: '2026-11-10T10:00',
    location: 'Salle 2',
    description: 'Point d’avancement',
    participantIds: [],
    recurrence: 'none',
    reminderMinutes: 15,
    color: null,
    conferenceUrl: 'https://meet.example.com/abc',
    attachments: [],
    notes: '',
    availability: 'busy',
    visibility: 'default',
    ...changes,
  });
  const news = async (userId: string) =>
    (await bed.notifications.list(userId)).items.map(
      ({ kind, targetId, title, actor, count, read }: NotificationEntry) => ({
        kind,
        targetId,
        title,
        actor: actor?.name ?? null,
        count,
        read,
      }),
    );
  const titles = async (userId: string) =>
    (await bed.agenda.findAll(userId)).map(({ title }) => title);

  beforeEach(async () => {
    bed = await createAgendaTestBed();
    publish = vi.spyOn(bed.live, 'publish');
    notify = vi.spyOn(bed.notifications, 'notify');
  });

  afterEach(() => bed.destroy());

  describe('create', () => {
    it('keeps a private event to its owner, with their calendar and reminder', async () => {
      const event = await bed.agenda.create(bed.ada, draft());

      expect(event).toMatchObject({
        title: 'Réunion projet',
        calendarId: 'travail',
        reminderMinutes: 15,
        mine: true,
        status: 'accepted',
        owner: { id: bed.ada, name: 'Ada Test', avatarVersion: null },
        participantIds: [],
        attendees: [],
      });
      expect(await titles(bed.ada)).toEqual(['Réunion projet']);
      expect(await titles(bed.bob)).toEqual([]);
      await expect(
        bed.agenda.findOne(event.id, bed.bob),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledWith([bed.ada], {
        type: 'agenda.changed',
        eventId: event.id,
      });
      expect(await news(bed.ada)).toEqual([]);
    });

    it('invites a contact, who sees it pending and is notified once', async () => {
      const event = await bed.agenda.create(
        bed.ada,
        draft({ participantIds: [bed.bob, bed.bob] }),
      );

      expect(event.attendees).toEqual([
        {
          id: bed.bob,
          name: 'Bob Test',
          avatarVersion: null,
          status: 'pending',
        },
      ]);
      const [invitation] = await bed.agenda.findAll(bed.bob);
      expect(invitation).toMatchObject({
        id: event.id,
        mine: false,
        status: 'pending',
        // Their calendar and reminder, not Ada's: none until they accept.
        calendarId: '',
        reminderMinutes: null,
        owner: { id: bed.ada, name: 'Ada Test' },
      });
      expect(await news(bed.bob)).toEqual([
        {
          kind: 'agenda.invited',
          targetId: event.id,
          title: 'Réunion projet',
          actor: 'Ada Test',
          count: 1,
          read: false,
        },
      ]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledWith([bed.ada, bed.bob], {
        type: 'agenda.changed',
        eventId: event.id,
      });
    });

    it('never shows an e-mail address of the people on it', async () => {
      const event = await bed.agenda.create(
        bed.ada,
        draft({ participantIds: [bed.bob] }),
      );
      const seen = JSON.stringify([
        event,
        await bed.agenda.findOne(event.id, bed.bob),
      ]);

      expect(seen).not.toContain('@example.com');
      expect(Object.keys(event.owner).sort()).toEqual([
        'avatarVersion',
        'id',
        'name',
      ]);
    });

    it('refuses people who are not contacts, and creates nothing', async () => {
      await expect(
        bed.agenda.create(bed.ada, draft({ participantIds: [bed.cyd] })),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(await bed.dataSource.manager.count(AgendaEvent)).toBe(0);
      expect(await news(bed.cyd)).toEqual([]);
      expect(publish).not.toHaveBeenCalled();
    });

    it('refuses an event that ends before it starts', async () => {
      await expect(
        bed.agenda.create(bed.ada, draft({ end: '2026-11-10T08:00' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await bed.dataSource.manager.count(AgendaEvent)).toBe(0);
    });
  });

  describe('respond', () => {
    let eventId: string;

    beforeEach(async () => {
      eventId = (
        await bed.agenda.create(bed.ada, draft({ participantIds: [bed.bob] }))
      ).id;
      publish.mockClear();
      notify.mockClear();
    });

    it('files an accepted event in the guest’s calendar and tells the organiser', async () => {
      const view = await bed.agenda.respond(eventId, bed.bob, {
        status: 'accepted',
        calendarId: 'famille',
        reminderMinutes: 30,
      });

      expect(view).toMatchObject({
        status: 'accepted',
        calendarId: 'famille',
        reminderMinutes: 30,
      });
      const organiser = await bed.agenda.findOne(eventId, bed.ada);
      // Ada keeps her own calendar and reminder.
      expect(organiser).toMatchObject({
        calendarId: 'travail',
        reminderMinutes: 15,
      });
      expect(organiser.attendees.map(({ status }) => status)).toEqual([
        'accepted',
      ]);
      expect(await news(bed.ada)).toEqual([
        expect.objectContaining({
          kind: 'agenda.accepted',
          targetId: eventId,
          actor: 'Bob Test',
        }),
      ]);
      expect(publish).toHaveBeenCalledWith([bed.ada, bed.bob], {
        type: 'agenda.changed',
        eventId,
      });
    });

    it('tells the organiser only when the answer changes', async () => {
      await bed.agenda.respond(eventId, bed.bob, { status: 'accepted' });
      await bed.agenda.respond(eventId, bed.bob, { status: 'accepted' });

      expect(notify).toHaveBeenCalledTimes(1);
      expect((await news(bed.ada))[0].count).toBe(1);
    });

    it('takes a declined event off the guest’s agenda, still open from a link', async () => {
      await bed.agenda.respond(eventId, bed.bob, { status: 'accepted' });
      await bed.agenda.respond(eventId, bed.bob, { status: 'declined' });

      expect(await titles(bed.bob)).toEqual([]);
      expect(await bed.agenda.findOne(eventId, bed.bob)).toMatchObject({
        status: 'declined',
      });
      expect((await news(bed.ada)).map(({ kind }) => kind)).toEqual([
        'agenda.declined',
        'agenda.accepted',
      ]);
    });

    it('has nothing for the organiser to answer', async () => {
      await expect(
        bed.agenda.respond(eventId, bed.ada, { status: 'declined' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(notify).not.toHaveBeenCalled();
    });

    it('answers 404 to someone who was not invited', async () => {
      await bed.befriend(bed.ada, bed.cyd);
      await expect(
        bed.agenda.respond(eventId, bed.cyd, { status: 'accepted' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update and remove', () => {
    let eventId: string;

    beforeEach(async () => {
      eventId = (
        await bed.agenda.create(bed.ada, draft({ participantIds: [bed.bob] }))
      ).id;
      await bed.agenda.respond(eventId, bed.bob, {
        status: 'accepted',
        calendarId: 'famille',
      });
      publish.mockClear();
      notify.mockClear();
    });

    it('lets only the organiser change or delete it', async () => {
      await expect(
        bed.agenda.update(
          eventId,
          bed.bob,
          draft({ title: 'Annulé', participantIds: [] }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(bed.agenda.remove(eventId, bed.bob)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(await bed.agenda.findOne(eventId, bed.ada)).toMatchObject({
        title: 'Réunion projet',
        participantIds: [bed.bob],
      });
      expect(publish).not.toHaveBeenCalled();
    });

    it('shows the changes to guests and keeps their answer', async () => {
      await bed.agenda.update(
        eventId,
        bed.ada,
        draft({
          title: 'Réunion déplacée',
          start: '2026-11-11T14:00',
          end: '2026-11-11T15:00',
          participantIds: [bed.bob],
        }),
      );

      expect(await bed.agenda.findOne(eventId, bed.bob)).toMatchObject({
        title: 'Réunion déplacée',
        start: '2026-11-11T14:00',
        status: 'accepted',
        calendarId: 'famille',
      });
      expect(notify).not.toHaveBeenCalled();
      expect(publish).toHaveBeenCalledWith([bed.ada, bed.bob], {
        type: 'agenda.changed',
        eventId,
      });
    });

    it('invites new guests and takes it, and its news, from removed ones', async () => {
      await bed.befriend(bed.ada, bed.cyd);

      const view = await bed.agenda.update(
        eventId,
        bed.ada,
        draft({ participantIds: [bed.cyd] }),
      );

      expect(view.attendees.map(({ id, status }) => [id, status])).toEqual([
        [bed.cyd, 'pending'],
      ]);
      await expect(bed.agenda.findOne(eventId, bed.bob)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(await news(bed.bob)).toEqual([]);
      expect((await news(bed.cyd)).map(({ kind }) => kind)).toEqual([
        'agenda.invited',
      ]);
      expect(notify).toHaveBeenCalledWith(
        [bed.cyd],
        expect.objectContaining({ kind: 'agenda.invited' }),
      );
      expect(publish).toHaveBeenCalledWith([bed.ada, bed.bob, bed.cyd], {
        type: 'agenda.changed',
        eventId,
      });
    });

    it('deletes it for everyone, with what the bell said about it', async () => {
      await bed.agenda.remove(eventId, bed.ada);

      expect(await titles(bed.ada)).toEqual([]);
      expect(await titles(bed.bob)).toEqual([]);
      expect(await news(bed.ada)).toEqual([]);
      expect(await news(bed.bob)).toEqual([]);
      expect(publish).toHaveBeenCalledWith([bed.ada, bed.bob], {
        type: 'agenda.changed',
        eventId,
      });
    });

    it('is revoked when the guest is no longer a contact', async () => {
      await bed.leaveGroup(bed.bob);

      expect(await titles(bed.bob)).toEqual([]);
      await expect(bed.agenda.findOne(eventId, bed.bob)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect((await bed.agenda.findOne(eventId, bed.ada)).attendees).toEqual(
        [],
      );
    });
  });

  it('answers 404 for an unknown event', async () => {
    await expect(
      bed.agenda.findOne(randomUUID(), bed.ada),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('import', () => {
    const local = (localId: string, title = 'Ancien') => {
      const fields: Partial<SaveAgendaEventDto> = draft({ title });
      delete fields.participantIds;
      return {
        ...(fields as Omit<SaveAgendaEventDto, 'participantIds'>),
        localId,
      };
    };

    it('creates each local event once, private, however often it is sent', async () => {
      expect(
        await bed.agenda.import(bed.ada, {
          events: [
            local('event-1'),
            local('event-2', 'Autre'),
            local('event-1'),
          ],
        }),
      ).toEqual({ imported: 2 });
      expect(
        await bed.agenda.import(bed.ada, { events: [local('event-1')] }),
      ).toEqual({ imported: 0 });

      const events = await bed.agenda.findAll(bed.ada);
      expect(events.map(({ title }) => title).sort()).toEqual([
        'Ancien',
        'Autre',
      ]);
      expect(events.every(({ attendees }) => !attendees.length)).toBe(true);
      expect(notify).not.toHaveBeenCalled();
    });

    it('keeps two people’s local ids apart', async () => {
      await bed.agenda.import(bed.ada, { events: [local('event-1')] });

      expect(
        await bed.agenda.import(bed.bob, { events: [local('event-1')] }),
      ).toEqual({ imported: 1 });
      expect(await titles(bed.bob)).toEqual(['Ancien']);
    });
  });
});
