import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ListSummary } from '@plano/common';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { SwitchRowComponent } from '../../shared/ui/switch-row.component';
import { ToastComponent } from '../../shared/ui/toast.component';
import { LIST_COLOR_CHOICES } from './list-detail/list-options';
import { ListsStore } from './lists.store';

type ListFilter = 'all' | 'mine' | 'shared' | 'archived';
type BooleanSetting = 'showCounts' | 'showCompleted' | 'completedLast' | 'archiveCompleted' | 'confirmDelete';

export interface ListCard {
  list: ListSummary;
  caption: string;
  surface: string;
  progress: number;
}

function caption(list: ListSummary): string {
  const others = list.memberCount - 1;
  if (list.ownership === 'shared') return 'Partagée avec vous';
  if (!others) return 'Privée';
  return `Partagée avec ${others} ${others > 1 ? 'personnes' : 'personne'}`;
}

@Component({
  selector: 'app-lists',
  imports: [RouterLink, BottomNavComponent, SwitchRowComponent, ToastComponent],
  templateUrl: './lists.component.html',
  styleUrl: './lists.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListsComponent {
  readonly listsStore = inject(ListsStore);
  private readonly router = inject(Router);

  readonly filters: readonly { label: string; value: ListFilter }[] = [
    { label: 'Toutes', value: 'all' },
    { label: 'Mes listes', value: 'mine' },
    { label: 'Partagées', value: 'shared' },
    { label: 'Archivées', value: 'archived' },
  ];
  readonly activeFilter = signal<ListFilter>('all');
  readonly gridView = computed(() => this.listsStore.settings()?.defaultView === 'grid');
  readonly menuOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly creating = signal(false);
  readonly cards = computed<readonly ListCard[]>(() => {
    const filter = this.activeFilter();
    return this.listsStore
      .lists()
      .filter((list) =>
        filter === 'archived'
          ? list.archived
          : !list.archived && (filter === 'all' || list.ownership === filter),
      )
      .map((list) => ({
        list,
        caption: caption(list),
        surface: `color-mix(in srgb, ${list.color} 9%, white)`,
        progress: list.total ? (list.completed / list.total) * 100 : 0,
      }));
  });

  constructor() {
    void this.listsStore.loadLists();
  }

  selectFilter(filter: ListFilter): void {
    this.activeFilter.set(filter);
  }

  toggleView(): void {
    this.setDefaultView(this.gridView() ? 'list' : 'grid');
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  openSettings(): void {
    this.menuOpen.set(false);
    this.settingsOpen.set(true);
  }

  setDefaultView(view: 'list' | 'grid'): void {
    void this.listsStore.updateSettings({ defaultView: view });
  }

  toggleSetting(setting: BooleanSetting): void {
    const settings = this.listsStore.settings();
    if (settings) void this.listsStore.updateSettings({ [setting]: !settings[setting] });
  }

  /** Creates an untitled list and opens its editor. */
  async createList(): Promise<void> {
    if (this.creating()) return;
    this.creating.set(true);
    const list = await this.listsStore.createList({
      name: 'Nouvelle liste',
      icon: 'cart',
      color: LIST_COLOR_CHOICES[0],
    });
    this.creating.set(false);
    if (list) void this.router.navigate(['/lists', list.id], { queryParams: { edit: 1 } });
  }
}
