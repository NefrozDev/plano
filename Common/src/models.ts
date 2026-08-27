export type ListIcon = 'cart' | 'home' | 'suitcase' | 'gift' | 'tools';
export type ListOwnership = 'mine' | 'shared';
export type ShareRole = 'owner' | 'editor' | 'viewer';

export interface PlanoList {
  slug: string;
  name: string;
  detail: string;
  completed: number;
  total: number;
  icon: ListIcon;
  color: string;
  surface: string;
  ownership: ListOwnership;
  archived?: boolean;
}

export interface ListSettings {
  defaultView: 'list' | 'grid';
  showCounts: boolean;
  showCompleted: boolean;
  completedLast: boolean;
  defaultReminder: string;
  notifyScope: 'mine' | 'all' | 'none';
  archiveCompleted: boolean;
  confirmDelete: boolean;
}

export interface ListEntry {
  id: string;
  name: string;
  done: boolean;
  highlighted?: boolean;
  addedBy: string;
  addedAt: string;
  assignedTo: string;
  reminder: string;
  notes: string;
}

export interface ListSection {
  id: string;
  name: string;
  color: string;
  entries: ListEntry[];
}

export interface ListMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: ShareRole;
}

export interface ListDetail {
  description: string;
  sections: ListSection[];
  members: ListMember[];
  sharingEnabled: boolean;
  total: number;
}

export interface DashboardDay {
  label: string;
  date: number;
  selected?: boolean;
  hasEvent?: boolean;
}

export interface DashboardTask {
  id: string;
  label: string;
  done: boolean;
}

export interface DashboardData {
  weekDays: DashboardDay[];
  tasks: DashboardTask[];
}

export interface PlanoData {
  version: 1;
  lists: PlanoList[];
  listDetails: Record<string, ListDetail>;
  listSettings: ListSettings;
  dashboard: DashboardData;
}

/** Persistence port implemented by memory, browser storage, or a future API. */
export interface PlanoDataAdapter {
  load(): PlanoData | null;
  save(data: PlanoData): void;
}
