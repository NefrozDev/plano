import type { NotificationEntry } from '@plano/common';

/** An unread notification that Bob added "entry-1" to "Courses"; override what matters. */
export function notification(changes: Partial<NotificationEntry> = {}): NotificationEntry {
  return {
    id: 'n-1',
    area: 'lists',
    kind: 'list.entries',
    targetId: 'list-1',
    itemIds: ['entry-1'],
    title: 'Courses',
    actor: { id: 'user-2', name: 'Bob Martin', avatarVersion: null },
    count: 1,
    updatedAt: '2026-10-15T08:00:00.000Z',
    read: false,
    ...changes,
  };
}
