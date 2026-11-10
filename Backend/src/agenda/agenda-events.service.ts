import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AgendaAttendeeStatus,
  AgendaEventView,
  ImportAgendaEventsResponse,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { ContactsService } from '../friends/contacts.service';
import { LiveEventsService } from '../live/live-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { stableId } from '../objectives/objective-import.service';
import { toAgendaView } from './agenda.mapper';
import type {
  ImportAgendaEventsDto,
  RespondAgendaEventDto,
  SaveAgendaEventDto,
} from './dto/agenda-event.dto';
import { AgendaEvent } from './entities/agenda-event.entity';
import { AgendaGuest } from './entities/agenda-guest.entity';
import { errorCode } from '../errors/error-code';

/** A whole agenda is loaded per request: this keeps it small enough. */
export const MAX_OWNED_EVENTS = 5000;

/** What the agenda shows: declined invitations only open from a link. */
const SHOWN: readonly AgendaAttendeeStatus[] = ['pending', 'accepted'];

/** Everything an event view needs, loaded together. */
const WITH_PEOPLE = { owner: true, guests: { user: true } } as const;

/**
 * Events and their guests. An event is visible to its owner, and to the
 * guests they invited while those are still the owner's contacts: losing both
 * links revokes access at once, as for lists.
 */
@Injectable()
export class AgendaEventsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly contacts: ContactsService,
    private readonly live: LiveEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The user's own events and the invitations they have not declined, by start. */
  async findAll(userId: string): Promise<AgendaEventView[]> {
    const manager = this.dataSource.manager;
    const [owned, invitations] = await Promise.all([
      manager.find(AgendaEvent, {
        where: { ownerId: userId },
        relations: WITH_PEOPLE,
      }),
      manager.find(AgendaGuest, {
        where: { userId, status: In(SHOWN) },
        relations: { event: WITH_PEOPLE },
      }),
    ]);
    const contactsOf = this.contactsCache();
    const mine = await contactsOf(userId);
    const views = owned.map((event) => toAgendaView(event, userId, mine));
    for (const { event } of invitations) {
      if (!mine.has(event.ownerId)) continue;
      views.push(toAgendaView(event, userId, await contactsOf(event.ownerId)));
    }
    return views.sort(
      (first, second) =>
        first.start.localeCompare(second.start) ||
        first.id.localeCompare(second.id),
    );
  }

  async findOne(eventId: string, userId: string): Promise<AgendaEventView> {
    const event = await this.require(eventId, userId);
    return this.view(event, userId);
  }

  async create(
    userId: string,
    dto: SaveAgendaEventDto,
  ): Promise<AgendaEventView> {
    checkChronology(dto);
    const guestIds = await this.invitable(userId, dto.participantIds);
    const id = randomUUID();
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.checkRoom(userId, 1, manager);
        await manager.insert(AgendaEvent, {
          ...eventFields(dto),
          id,
          ownerId: userId,
        });
        await this.addGuests(id, guestIds, manager);
      }),
    );
    const view = await this.findOne(id, userId);
    this.changed(id, [userId, ...guestIds]);
    await this.invited(view, guestIds, userId);
    return view;
  }

  /** Replaces the event; guests no longer listed lose it, new ones are invited. */
  async update(
    eventId: string,
    userId: string,
    dto: SaveAgendaEventDto,
  ): Promise<AgendaEventView> {
    checkChronology(dto);
    const guestIds = await this.invitable(userId, dto.participantIds);
    const { added, removed, before } = await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const event = await this.requireOwner(eventId, userId, manager);
        const before = event.guests.map((guest) => guest.userId);
        const added = guestIds.filter((id) => !before.includes(id));
        const removed = before.filter((id) => !guestIds.includes(id));
        await manager.update(AgendaEvent, { id: eventId }, eventFields(dto));
        if (removed.length) {
          await manager.delete(AgendaGuest, { eventId, userId: In(removed) });
        }
        await this.addGuests(eventId, added, manager);
        return { added, removed, before };
      }),
    );
    const view = await this.findOne(eventId, userId);
    // Removed guests too: their agenda drops it.
    this.changed(eventId, [userId, ...before, ...added]);
    await this.notifications.forget(removed, [eventId]);
    await this.invited(view, added, userId);
    return view;
  }

  /** Deletes the event, recurring series included, for everyone on it. */
  async remove(eventId: string, userId: string): Promise<void> {
    const audience = await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const event = await this.requireOwner(eventId, userId, manager);
        await manager.delete(AgendaEvent, { id: eventId });
        return [userId, ...event.guests.map((guest) => guest.userId)];
      }),
    );
    this.changed(eventId, audience);
    await this.notifications.forget(audience, [eventId]);
  }

  /** A guest accepts or declines; the organiser hears when the answer changes. */
  async respond(
    eventId: string,
    userId: string,
    dto: RespondAgendaEventDto,
  ): Promise<AgendaEventView> {
    const { event, answered } = await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const event = await this.require(eventId, userId, manager);
        const guest = event.guests.find((row) => row.userId === userId);
        if (!guest) {
          throw new ForbiddenException(
            'You organize this event: there is no invitation to answer.',
            errorCode('agenda.organizerCannotRespond'),
          );
        }
        const answered = guest.status !== dto.status;
        await manager.update(
          AgendaGuest,
          { eventId, userId },
          {
            status: dto.status,
            respondedAt: new Date(),
            ...(dto.calendarId !== undefined && {
              calendarId: dto.calendarId,
            }),
            ...(dto.reminderMinutes !== undefined && {
              reminderMinutes: dto.reminderMinutes,
            }),
          },
        );
        return { event, answered };
      }),
    );
    const view = await this.findOne(eventId, userId);
    this.changed(eventId, [
      event.ownerId,
      ...event.guests.map((guest) => guest.userId),
    ]);
    if (answered) {
      await this.notifications.notify([event.ownerId], {
        area: 'agenda',
        kind: dto.status === 'accepted' ? 'agenda.accepted' : 'agenda.declined',
        targetId: eventId,
        title: event.title,
        actorId: userId,
      });
    }
    return view;
  }

  /**
   * Once, what a browser stored before the agenda moved to the API. Its guests
   * were never told, so imported events start without any.
   */
  async import(
    userId: string,
    { events }: ImportAgendaEventsDto,
  ): Promise<ImportAgendaEventsResponse> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const ids = events.map(({ localId }) =>
          stableId(userId, 'agenda', localId),
        );
        const existing = new Set(
          (
            await manager.find(AgendaEvent, {
              where: { id: In(ids) },
              select: { id: true },
            })
          ).map(({ id }) => id),
        );
        // The same event twice in one batch is still one event.
        const fresh = events
          .map((event, index) => ({ event, id: ids[index] }))
          .filter(
            ({ id }, index) => !existing.has(id) && ids.indexOf(id) === index,
          );
        await this.checkRoom(userId, fresh.length, manager);
        for (const { event, id } of fresh) {
          checkChronology(event);
          await manager.insert(AgendaEvent, {
            ...eventFields(event),
            id,
            ownerId: userId,
          });
        }
        return { imported: fresh.length };
      }),
    );
  }

  /** Unknown events and events the user cannot see both answer 404, so ids cannot be probed. */
  private async require(
    eventId: string,
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<AgendaEvent> {
    const event = await manager.findOne(AgendaEvent, {
      where: { id: eventId },
      relations: WITH_PEOPLE,
    });
    const invited = event?.guests.some((guest) => guest.userId === userId);
    if (
      !event ||
      (event.ownerId !== userId &&
        (!invited || !(await this.contacts.areContacts(userId, event.ownerId))))
    ) {
      throw new NotFoundException(
        'Event not found.',
        errorCode('agenda.eventNotFound'),
      );
    }
    return event;
  }

  private async requireOwner(
    eventId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<AgendaEvent> {
    const event = await this.require(eventId, userId, manager);
    if (event.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the organizer can change or delete this event.',
        errorCode('agenda.organizerOnly'),
      );
    }
    return event;
  }

  private async view(
    event: AgendaEvent,
    userId: string,
  ): Promise<AgendaEventView> {
    return toAgendaView(
      event,
      userId,
      await this.contacts.contactIds(event.ownerId),
    );
  }

  /** The guests asked for, once each: only the organiser's contacts can be invited. */
  private async invitable(
    userId: string,
    participantIds: readonly string[],
  ): Promise<string[]> {
    const guestIds = [...new Set(participantIds)];
    if (!guestIds.length) return [];
    const contacts = await this.contacts.contactIds(userId);
    if (!guestIds.every((id) => contacts.has(id))) {
      throw new BadRequestException(
        'Only your contacts can be invited.',
        errorCode('agenda.guestsMustBeContacts'),
      );
    }
    return guestIds;
  }

  private async addGuests(
    eventId: string,
    userIds: readonly string[],
    manager: EntityManager,
  ): Promise<void> {
    if (!userIds.length) return;
    // One after the other, so `invitedAt` keeps the invitation order.
    for (const userId of userIds) {
      await manager.insert(AgendaGuest, {
        eventId,
        userId,
        status: 'pending',
        invitedAt: new Date(),
      });
    }
  }

  private async checkRoom(
    userId: string,
    adding: number,
    manager: EntityManager,
  ): Promise<void> {
    const owned = await manager.count(AgendaEvent, {
      where: { ownerId: userId },
    });
    if (owned + adding > MAX_OWNED_EVENTS) {
      throw new BadRequestException(
        `A calendar holds at most ${MAX_OWNED_EVENTS} events.`,
        errorCode('agenda.tooManyEvents'),
      );
    }
  }

  /** Several owners' contacts, each looked up once per request. */
  private contactsCache(): (userId: string) => Promise<Set<string>> {
    const known = new Map<string, Promise<Set<string>>>();
    return (userId) => {
      let contacts = known.get(userId);
      if (!contacts) {
        contacts = this.contacts.contactIds(userId);
        known.set(userId, contacts);
      }
      return contacts;
    };
  }

  /** Everyone's open agendas reload it, the actor's other devices included. */
  private changed(eventId: string, userIds: Iterable<string>): void {
    this.live.publish(userIds, { type: 'agenda.changed', eventId });
  }

  /** NotificationsService logs its own failures: an invitation never undoes the event. */
  private async invited(
    view: AgendaEventView,
    guestIds: readonly string[],
    actorId: string,
  ): Promise<void> {
    if (!guestIds.length) return;
    await this.notifications.notify(guestIds, {
      area: 'agenda',
      kind: 'agenda.invited',
      targetId: view.id,
      title: view.title,
      actorId,
    });
  }
}

/** An event ends when or after it starts: both are `YYYY-MM-DDTHH:mm`, so they compare as text. */
function checkChronology({ start, end }: { start: string; end: string }): void {
  if (end < start) {
    throw new BadRequestException(
      'The event cannot end before it starts.',
      errorCode('agenda.endBeforeStart'),
    );
  }
}

/** The columns a request sets, and nothing else: never the owner or the guests. */
function eventFields(
  dto: Omit<SaveAgendaEventDto, 'participantIds'>,
): Partial<AgendaEvent> {
  return {
    title: dto.title,
    calendarId: dto.calendarId,
    allDay: dto.allDay,
    start: dto.start,
    end: dto.end,
    location: dto.location.trim(),
    description: dto.description.trim(),
    recurrence: dto.recurrence,
    reminderMinutes: dto.reminderMinutes ?? null,
    color: dto.color ?? null,
    conferenceUrl: dto.conferenceUrl.trim(),
    attachments: dto.attachments.map(({ id, name, size, type }) => ({
      id,
      name,
      size,
      type,
    })),
    notes: dto.notes.trim(),
    availability: dto.availability,
    visibility: dto.visibility,
  };
}
