import type {
  ListEntry as ListEntryResponse,
  ListSection as ListSectionResponse,
} from '@plano/common';
import type { User } from '../users/user.entity';
import type { ListEntry } from './entities/list-entry.entity';
import type { ListSection } from './entities/list-section.entity';

/** "First Last", or the username when both names are blank. */
export function displayName(
  user: Pick<User, 'firstName' | 'lastName' | 'username'>,
): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.username;
}

export function toEntryResponse(entry: ListEntry): ListEntryResponse {
  return {
    id: entry.id,
    name: entry.name,
    done: entry.done,
    highlighted: entry.highlighted,
    addedBy: entry.addedBy ? displayName(entry.addedBy) : 'Compte supprimé',
    addedAt: entry.createdAt.toISOString(),
    assignedTo: entry.assignedToUserId,
    reminder: entry.reminder,
    notes: entry.notes,
  };
}

/** `entries` must belong to the section, already sorted by position. */
export function toSectionResponse(
  section: ListSection,
  entries: ListEntry[],
): ListSectionResponse {
  return {
    id: section.id,
    name: section.name,
    color: section.color,
    entries: entries.map(toEntryResponse),
  };
}
