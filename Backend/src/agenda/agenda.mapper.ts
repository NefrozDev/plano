import type { AgendaEventView, AgendaPerson } from '@plano/common';
import { displayName } from '../lists/list.mapper';
import type { User } from '../users/user.entity';
import { avatarVersion } from '../users/user.mapper';
import type { AgendaEvent } from './entities/agenda-event.entity';

function toPerson(user: User): AgendaPerson {
  return {
    id: user.id,
    name: displayName(user),
    avatarVersion: avatarVersion(user),
  };
}

/**
 * The event as `viewerId` sees it, with their own calendar and reminder. Only
 * guests still in the owner's contacts are listed: the others lost it.
 * Needs `owner` and `guests.user` loaded.
 */
export function toAgendaView(
  event: AgendaEvent,
  viewerId: string,
  ownerContacts: ReadonlySet<string>,
): AgendaEventView {
  const mine = event.ownerId === viewerId;
  const own = event.guests.find((guest) => guest.userId === viewerId);
  const attendees = event.guests
    .filter((guest) => ownerContacts.has(guest.userId))
    .sort(
      (first, second) =>
        first.invitedAt.getTime() - second.invitedAt.getTime() ||
        first.userId.localeCompare(second.userId),
    )
    .map((guest) => ({ ...toPerson(guest.user), status: guest.status }));
  return {
    id: event.id,
    title: event.title,
    calendarId: mine ? event.calendarId : (own?.calendarId ?? ''),
    allDay: event.allDay,
    start: event.start,
    end: event.end,
    location: event.location,
    description: event.description,
    participantIds: attendees.map(({ id }) => id),
    recurrence: event.recurrence,
    reminderMinutes: mine
      ? event.reminderMinutes
      : (own?.reminderMinutes ?? null),
    color: event.color,
    conferenceUrl: event.conferenceUrl,
    attachments: event.attachments,
    notes: event.notes,
    availability: event.availability,
    visibility: event.visibility,
    owner: toPerson(event.owner),
    mine,
    status: mine ? 'accepted' : (own?.status ?? 'pending'),
    attendees,
  };
}
