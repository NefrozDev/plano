/**
 * REST contract of the lists API (`/api/v1/lists`, `/api/v1/settings/lists`).
 * Request interfaces are implemented by the API's validated DTOs.
 */
import type { LocalDateTime } from './models';

/** Drawn by the app (`LIST_ICON_SHAPES`); stored by name, 16 characters at most. */
export type ListIcon =
  | 'cart'
  | 'basket'
  | 'home'
  | 'kitchen'
  | 'cleaning'
  | 'laundry'
  | 'plant'
  | 'tools'
  | 'key'
  | 'food'
  | 'apple'
  | 'coffee'
  | 'wine'
  | 'cake'
  | 'suitcase'
  | 'plane'
  | 'car'
  | 'map'
  | 'tent'
  | 'beach'
  | 'camera'
  | 'gift'
  | 'party'
  | 'music'
  | 'book'
  | 'film'
  | 'game'
  | 'sport'
  | 'bike'
  | 'briefcase'
  | 'laptop'
  | 'pencil'
  | 'school'
  | 'idea'
  | 'calendar'
  | 'chart'
  | 'pill'
  | 'heart'
  | 'baby'
  | 'paw'
  | 'wallet'
  | 'piggy'
  | 'star'
  | 'flag'
  | 'check'
  | 'bell'
  | 'phone';
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
  /** Those people, owner first: says who shared a list, and with whom. */
  members: ListMember[];
  completed: number;
  total: number;
  /** Shown on the signed-in user's home page (their own choice). */
  onHome: boolean;
  /** Checking an item deletes it instead of keeping it as done (set by the owner, for everyone). */
  removeChecked: boolean;
  /** The objective it counts for; only its owner is told. */
  objectiveId: string | null;
}

/** The signed-in user's full order of their lists; lists left out go last. */
export interface ReorderListsRequest {
  listIds: string[];
}

export interface UpdateListPreferencesRequest {
  onHome: boolean;
}

export interface HomeListEntry {
  id: string;
  name: string;
}

/** A list pinned to the home page, with its first unchecked items. */
export interface HomeList {
  id: string;
  name: string;
  icon: ListIcon;
  color: string;
  role: ShareRole;
  /** Ticking an item from the home page deletes it (see ListSummary). */
  removeChecked: boolean;
  /** Unchecked items in the whole list. */
  remaining: number;
  entries: HomeListEntry[];
}

export interface ListEntry {
  id: string;
  name: string;
  done: boolean;
  highlighted: boolean;
  /** Display name of the person who added it; null once their account is deleted. */
  addedBy: string | null;
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
  /** Changes with each new profile picture, null without one: see GET /users/:id/avatar. */
  avatarVersion: number | null;
  role: ShareRole;
}

export interface ListDetail extends ListSummary {
  description: string;
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
  removeChecked?: boolean;
}

export interface CreateSectionRequest {
  name: string;
  color: string;
}

/** Only the fields sent change. */
export interface UpdateSectionRequest {
  name?: string;
  color?: string;
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

export interface ReorderSectionsRequest {
  sectionIds: string[];
}

export interface AddListMemberRequest {
  userId: string;
  role: ListMemberRole;
}

export interface UpdateListMemberRequest {
  role: ListMemberRole;
}

export type UpdateListSettingsRequest = Partial<ListSettings>;
