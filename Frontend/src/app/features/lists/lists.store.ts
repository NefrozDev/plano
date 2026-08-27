import { Injectable, computed, inject } from '@angular/core';
import type { ListDetail, ListSettings, PlanoList } from '@plano/common';
import { PlanoDataStore } from '../../core/data/plano-data.store';

export type { ListIcon, ListSettings, PlanoList } from '@plano/common';

@Injectable({ providedIn: 'root' })
export class ListsStore {
  private readonly appData = inject(PlanoDataStore);

  readonly lists = computed(() => this.appData.data().lists);
  readonly settings = computed(() => this.appData.data().listSettings);

  list(slug: string): PlanoList | undefined {
    return this.lists().find((list) => list.slug === slug);
  }

  detail(slug: string): ListDetail | undefined {
    return this.appData.data().listDetails[slug];
  }

  updateList(slug: string, changes: Pick<PlanoList, 'name' | 'icon' | 'color'>): void {
    this.appData.update((data) => ({
      ...data,
      lists: data.lists.map((list) =>
        list.slug === slug
          ? { ...list, ...changes, surface: `color-mix(in srgb, ${changes.color} 9%, white)` }
          : list,
      ),
    }));
  }

  updateDetail(slug: string, changes: Partial<ListDetail>): void {
    const current = this.detail(slug);
    if (!current) return;
    const next = { ...current, ...changes };
    const completed = next.sections.reduce(
      (count, section) => count + section.entries.filter((entry) => entry.done).length,
      0,
    );
    this.appData.update((data) => ({
      ...data,
      lists: data.lists.map((list) =>
        list.slug === slug
          ? { ...list, completed, total: next.total }
          : list,
      ),
      listDetails: {
        ...data.listDetails,
        [slug]: next,
      },
    }));
  }

  updateSettings(changes: Partial<ListSettings>): void {
    this.appData.update((data) => ({
      ...data,
      listSettings: { ...data.listSettings, ...changes },
    }));
  }
}
