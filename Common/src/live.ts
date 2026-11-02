import type { PublicUser } from './friends';
import type { ObjectiveNewsKind } from './objectives';

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
  | { type: 'friends.changed' }
  /** Something the user can open changed. Only ever an id they may know. */
  | { type: 'objective.changed'; objectiveId: string }
  /** It was deleted, or the user lost access to it. */
  | { type: 'objective.removed'; objectiveId: string }
  /** Worth telling: the user was invited, `actor` contributed, or it was completed. */
  /** The user's notifications changed: one was added, grouped or read on another device. */
  | { type: 'notifications.changed' }
  | {
      type: 'objective.news';
      objectiveId: string;
      kind: ObjectiveNewsKind;
      title: string;
      actor: string;
    };
