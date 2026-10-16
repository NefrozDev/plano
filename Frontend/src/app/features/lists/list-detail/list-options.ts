import type { ListIcon, ShareRole } from '@plano/common';

export const LIST_ICON_CHOICES: readonly { value: ListIcon; label: string }[] = [
  { value: 'cart', label: 'Courses' },
  { value: 'home', label: 'Maison' },
  { value: 'suitcase', label: 'Voyage' },
  { value: 'gift', label: 'Cadeaux' },
  { value: 'tools', label: 'Travaux' },
];

export const LIST_COLOR_CHOICES: readonly string[] = [
  '#2ecb70',
  '#7868ef',
  '#f4a51c',
  '#e65591',
  '#3978ed',
];

export const ROLE_LABELS: Readonly<Record<ShareRole, string>> = {
  owner: 'Propriétaire',
  editor: 'Peut modifier',
  viewer: 'Peut consulter',
};

/** Entries are addressed by id: indexes shift when entries are filtered, sorted or moved. */
export interface EntryRef {
  sectionId: string;
  entryId: string;
}
