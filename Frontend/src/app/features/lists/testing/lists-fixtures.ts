import type { ListDetail, ListEntry, ListSettings, ListSummary } from '@plano/common';

export const OWNER_ID = 'user-ada';
export const MEMBER_ID = 'user-bob';

export function entry(id: string, name: string, changes: Partial<ListEntry> = {}): ListEntry {
  return {
    id,
    name,
    done: false,
    highlighted: false,
    addedBy: 'Ada Lovelace',
    addedAt: '2026-10-13T09:20:00.000Z',
    assignedTo: null,
    reminder: null,
    notes: '',
    ...changes,
  };
}

/** A list as GET /lists/list-1 returns it to its owner: 2 sections, 6 entries, 2 done. */
export function listDetail(changes: Partial<ListDetail> = {}): ListDetail {
  return {
    id: 'list-1',
    name: 'Courses',
    icon: 'cart',
    color: '#2ecb70',
    archived: false,
    ownership: 'mine',
    role: 'owner',
    memberCount: 2,
    completed: 2,
    total: 6,
    onHome: false,
    description: '',
    members: [
      { id: OWNER_ID, name: 'Ada Lovelace', role: 'owner' },
      { id: MEMBER_ID, name: 'Bob Martin', role: 'editor' },
    ],
    sections: [
      {
        id: 'fresh',
        name: 'Produits frais',
        color: '#23c666',
        entries: [
          entry('milk', 'Lait', { reminder: '2026-10-15T18:00' }),
          entry('eggs', 'Œufs', { done: true }),
          entry('tomatoes', 'Tomates'),
          entry('salad', 'Salade'),
        ],
      },
      {
        id: 'grocery',
        name: 'Épicerie',
        color: '#d85a9a',
        entries: [entry('pasta', 'Pâtes', { done: true }), entry('rice', 'Riz')],
      },
    ],
    ...changes,
  };
}

export function listSummary(changes: Partial<ListSummary> = {}): ListSummary {
  const { description: _description, members: _members, sections: _sections, ...summary } = listDetail();
  return { ...summary, ...changes };
}

export function listSettings(changes: Partial<ListSettings> = {}): ListSettings {
  return {
    defaultView: 'list',
    showCounts: true,
    showCompleted: true,
    completedLast: true,
    defaultReminder: '09:00',
    notifyScope: 'mine',
    archiveCompleted: false,
    confirmDelete: true,
    ...changes,
  };
}
