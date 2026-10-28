/**
 * Pushed to every open app of the users concerned (GET /live/stream, Server-Sent
 * Events, named by `type`). Events say what changed, not how: clients reload it.
 */
export type LiveEvent =
  | { type: 'list.changed'; listId: string }
  /** The list was deleted, or the user lost access to it. */
  | { type: 'list.removed'; listId: string };
