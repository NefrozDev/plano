/**
 * REST contract of the notifications API (`/api/v1/notifications`): what happened
 * to the user while others used the app, kept until read. Each one belongs to the
 * part of the app where it happened, and is read by opening that place.
 */

/** Where it happened: each area counts its own unread notifications. */
export type NotificationArea = 'friends' | 'lists' | 'objectives' | 'agenda';

export type NotificationKind =
  | 'friend.requested'
  | 'friend.accepted'
  /** The user was given access to a list. */
  | 'list.invited'
  /** Someone else added items to a list. */
  | 'list.entries'
  | 'objective.invited'
  | 'objective.contribution'
  | 'objective.completed'
  | 'objective.comment';

/** Who did it, as far as the user may see them: never an e-mail address. */
export interface NotificationActor {
  id: string;
  name: string;
  /** Changes with each new profile picture, null without one: see GET /users/:id/avatar. */
  avatarVersion: number | null;
}

export interface NotificationEntry {
  id: string;
  area: NotificationArea;
  kind: NotificationKind;
  /**
   * What to open: the list or objective, or the other person for friend news.
   * Only ever an id the user could open when it was sent.
   */
  targetId: string;
  /** The list or objective's name when it was sent; empty for friend news. */
  title: string;
  /** Null for an account since deleted. */
  actor: NotificationActor | null;
  /** The same news on the same thing is grouped while unread: how many times. */
  count: number;
  /** When it last happened (ISO 8601). */
  updatedAt: string;
  read: boolean;
}

export interface NotificationsResponse {
  /** The latest ones, newest first. */
  items: NotificationEntry[];
  /** Unread notifications per area, all of them, not only those in `items`. */
  unread: Record<NotificationArea, number>;
}

/** Everything unread in an area, or only what is about one list, objective or person. */
export interface MarkNotificationsReadRequest {
  area: NotificationArea;
  targetId?: string;
}
