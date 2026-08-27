import { Injectable, signal } from '@angular/core';

export type ListIcon = 'cart' | 'home' | 'suitcase' | 'gift' | 'tools';

export interface PlanoList {
  readonly slug: string;
  readonly name: string;
  readonly detail: string;
  readonly completed: number;
  readonly total: number;
  readonly icon: ListIcon;
  readonly color: string;
  readonly surface: string;
  readonly ownership: 'mine' | 'shared';
  readonly archived?: boolean;
}

export interface ListSettings {
  readonly defaultView: 'list' | 'grid';
  readonly showCounts: boolean;
  readonly showCompleted: boolean;
  readonly completedLast: boolean;
  readonly defaultReminder: string;
  readonly notifyScope: 'mine' | 'all' | 'none';
  readonly archiveCompleted: boolean;
  readonly confirmDelete: boolean;
}

const LISTS: readonly PlanoList[] = [
  { slug: 'courses', name: 'Courses', detail: 'Partagée avec 2 personnes', completed: 3, total: 8, icon: 'cart', color: '#2ecb70', surface: '#f0fff5', ownership: 'shared' },
  { slug: 'maison', name: 'Maison', detail: 'Partagée avec 2 personnes', completed: 5, total: 12, icon: 'home', color: '#7868ef', surface: '#f7f4ff', ownership: 'shared' },
  { slug: 'vacances-ete', name: 'Vacances été', detail: 'Partagée avec 3 personnes', completed: 8, total: 15, icon: 'suitcase', color: '#f4a51c', surface: '#fff9ec', ownership: 'shared' },
  { slug: 'idees-cadeaux', name: 'Idées cadeaux', detail: 'Privée', completed: 4, total: 10, icon: 'gift', color: '#e65591', surface: '#fff1f7', ownership: 'mine' },
  { slug: 'projets-maison', name: 'Projets maison', detail: 'Privée', completed: 2, total: 6, icon: 'tools', color: '#3978ed', surface: '#f1f6ff', ownership: 'mine' },
];

@Injectable({ providedIn: 'root' })
export class ListsStore {
  readonly lists = signal<readonly PlanoList[]>(LISTS);
  readonly settings = signal<ListSettings>({
    defaultView: 'list',
    showCounts: true,
    showCompleted: true,
    completedLast: true,
    defaultReminder: '09:00',
    notifyScope: 'mine',
    archiveCompleted: false,
    confirmDelete: true,
  });

  list(slug: string): PlanoList | undefined {
    return this.lists().find((list) => list.slug === slug);
  }

  updateList(slug: string, changes: Pick<PlanoList, 'name' | 'icon' | 'color'>): void {
    this.lists.update((lists) =>
      lists.map((list) =>
        list.slug === slug
          ? { ...list, ...changes, surface: `color-mix(in srgb, ${changes.color} 9%, white)` }
          : list,
      ),
    );
  }

  updateSettings(changes: Partial<ListSettings>): void {
    this.settings.update((settings) => ({ ...settings, ...changes }));
  }
}
