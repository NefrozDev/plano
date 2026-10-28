/**
 * REST contract of the lists API (`/api/v1/lists`, `/api/v1/settings/lists`).
 * Request interfaces are implemented by the API's validated DTOs.
 */
import type { LocalDateTime } from './models';

export type ListIcon = 'cart' | 'home' | 'suitcase' | 'gift' | 'tools';
/** `mine`: you own the list; `shared`: someone in your group shared it with you. */
export type ListOwnership = 'mine' | 'shared';
export type ShareRole = 'owner' | 'editor' | 'viewer';
/** Role given to a group member the list is shared with. */
export type ListMemberRole = Exclude<ShareRole, 'owner'>;

export interface ListSummary {
  id: string;
  name: string;
  icon: ListIcon;
  /** `#rrggbb`. */
  color: string;
  archived: boolean;
  ownership: ListOwnership;
  /** The signed-in user's role. */
  role: ShareRole;
  /** People with access, the owner included. */
  memberCount: number;
  completed: number;
  total: number;
}

export interface ListEntry {
  id: string;
  name: string;
  done: boolean;
  highlighted: boolean;
  /** Display name of the person who added it. */
  addedBy: string;
  /** ISO 8601 timestamp. */
  addedAt: string;
  /** User id of a list member, or null. */
  assignedTo: string | null;
  reminder: LocalDateTime | null;
  notes: string;
}

export interface ListSection {
  id: string;
  name: string;
  color: string;
  entries: ListEntry[];
}

export interface ListMember {
  /** User id. */
  id: string;
  name: string;
  role: ShareRole;
}

export interface ListDetail extends ListSummary {
  description: string;
  /** Owner first. */
  members: ListMember[];
  sections: ListSection[];
}

/** An entry with a reminder, shown as a task in the agenda. */
export interface ListReminder {
  listId: string;
  listName: string;
  listColor: string;
  entryId: string;
  name: string;
  done: boolean;
  reminder: LocalDateTime;
}

export interface ListSettings {
  defaultView: 'list' | 'grid';
  showCounts: boolean;
  showCompleted: boolean;
  completedLast: boolean;
  /** `HH:mm`. */
  defaultReminder: string;
  notifyScope: 'mine' | 'all' | 'none';
  archiveCompleted: boolean;
  confirmDelete: boolean;
}

export interface CreateListRequest {
  name: string;
  icon: ListIcon;
  color: string;
  description?: string;
}

export interface UpdateListRequest {
  name?: string;
  icon?: ListIcon;
  color?: string;
  description?: string;
  archived?: boolean;
}

export interface CreateSectionRequest {
  name: string;
  color: string;
}

export interface UpdateSectionRequest {
  name: string;
}

export interface CreateEntryRequest {
  name: string;
}

export interface UpdateEntryRequest {
  name?: string;
  done?: boolean;
  highlighted?: boolean;
  assignedTo?: string | null;
  reminder?: LocalDateTime | null;
  notes?: string;
}

/** Every entry id of the section, in the new order. */
export interface ReorderEntriesRequest {
  entryIds: string[];
}

export interface AddListMemberRequest {
  userId: string;
  role: ListMemberRole;
}

export interface UpdateListMemberRequest {
  role: ListMemberRole;
}

export type UpdateListSettingsRequest = Partial<ListSettings>;
