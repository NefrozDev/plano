import type { ShareRole } from '@plano/common';

export const LIST_COLOR_CHOICES: readonly string[] = [
  '#2ecb70',
  '#7868ef',
  '#f4a51c',
  '#e65591',
  '#3978ed',
];

/** Translation key of each role. */
export const ROLE_LABELS: Readonly<Record<ShareRole, string>> = {
  owner: 'lists.roles.owner',
  editor: 'lists.roles.editor',
  viewer: 'lists.roles.viewer',
};

/** Entries are addressed by id: indexes shift when entries are filtered, sorted or moved. */
export interface EntryRef {
  sectionId: string;
  entryId: string;
}
