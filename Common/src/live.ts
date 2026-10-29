import type { PublicUser } from './friends';

/**
 * Pushed to every open app of the users concerned (GET /live/stream, Server-Sent
 * Events, named by `type`). Events say what changed, not how: clients reload it.
 * Friend events also carry the other person, to tell the user who it was.
 */
export type LiveEvent =
  | { type: 'list.changed'; listId: string }
  /** The list was deleted, or the user lost access to it. */
  | { type: 'list.removed'; listId: string }
  /** `user` asked to be friends. */
  | { type: 'friend.requested'; user: PublicUser }
  /** `user` accepted the request: you are friends now. */
  | { type: 'friend.accepted'; user: PublicUser }
  /** A request was declined or cancelled, or a friendship ended. */
  | { type: 'friends.changed' };
