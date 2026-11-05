import type { AgendaEvent, AgendaFilters, AgendaSettings } from './models';

/**
 * REST contract of the agenda API (`/api/v1/agenda/events`). The organiser
 * invites contacts; each guest accepts or declines, and both sides are told.
 * The calendars are built in; their colours, the settings and the filters
 * follow the account (`/api/v1/settings/agenda`).
 */

/** A guest's answer. The organiser is always `accepted`. */
export type AgendaAttendeeStatus = 'pending' | 'accepted' | 'declined';

/** A person on an event, as far as the viewer may see them: never an e-mail address. */
export interface AgendaPerson {
  id: string;
  name: string;
  /** Changes with each new profile picture, null without one: see GET /users/:id/avatar. */
  avatarVersion: number | null;
}

export interface AgendaAttendee extends AgendaPerson {
  status: AgendaAttendeeStatus;
}

/**
 * An event as the viewer sees it. `participantIds` are the guests (whatever
 * their answer), and `calendarId` and `reminderMinutes` are the viewer's own:
 * a guest files the event in their calendars, not the organiser's.
 */
export interface AgendaEventView extends AgendaEvent {
  owner: AgendaPerson;
  /** The viewer organises it: only they change or delete it, or invite people. */
  mine: boolean;
  /** The viewer's answer. */
  status: AgendaAttendeeStatus;
  /** Guests still in the organiser's contacts, in the order they were invited. */
  attendees: AgendaAttendee[];
}

/** Creates or replaces an event (organiser only). `participantIds` are the guests to invite or keep. */
export type SaveAgendaEventRequest = Omit<AgendaEvent, 'id'>;

/** A guest's answer, filed in one of their calendars when accepting. */
export interface RespondAgendaEventRequest {
  status: Exclude<AgendaAttendeeStatus, 'pending'>;
  calendarId?: string;
  reminderMinutes?: number | null;
}

/** An event as a browser stored it before the agenda moved to the API. Guests are not imported. */
export type ImportAgendaEventRequest = Omit<AgendaEvent, 'id' | 'participantIds'> & { localId: string };

export interface ImportAgendaEventsRequest {
  events: ImportAgendaEventRequest[];
}

export interface ImportAgendaEventsResponse {
  imported: number;
}

/** What the agenda screens remember for a person, on every device (`/api/v1/settings/agenda`). */
export interface AgendaUserSettings extends AgendaSettings, AgendaFilters {
  /** Colour chosen for a built-in calendar, by its id; the others keep their own. */
  calendarColors: Record<string, string>;
  /** Events opened lately, most recent first. */
  recentIds: string[];
}

export type UpdateAgendaUserSettingsRequest = Partial<AgendaUserSettings>;
