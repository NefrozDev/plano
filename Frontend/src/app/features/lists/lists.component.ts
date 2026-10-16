import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { SwitchRowComponent } from '../../shared/ui/switch-row.component';
import { ListsStore } from './lists.store';

type ListFilter = 'all' | 'mine' | 'shared' | 'archived';

@Component({
  selector: 'app-lists',
  standalone: true,
  imports: [RouterLink, BottomNavComponent, SwitchRowComponent],
  templateUrl: './lists.component.html',
  styleUrl: './lists.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListsComponent {
  readonly listsStore = inject(ListsStore);

  readonly filters: readonly { label: string; value: ListFilter }[] = [
    { label: 'Toutes', value: 'all' },
    { label: 'Mes listes', value: 'mine' },
    { label: 'Partagées', value: 'shared' },
    { label: 'Archivées', value: 'archived' },
  ];
  readonly activeFilter = signal<ListFilter>('all');
  readonly gridView = computed(() => this.listsStore.settings().defaultView === 'grid');
  readonly menuOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly lists = this.listsStore.lists;
  readonly visibleLists = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'all') return this.lists().filter((list) => !list.archived);
    if (filter === 'archived') return this.lists().filter((list) => list.archived);
    return this.lists().filter(
      (list) => list.ownership === filter && !list.archived,
    );
  });

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
    this.listsStore.updateSettings({ defaultView: view });
  }

  toggleSetting(
    setting: 'showCounts' | 'showCompleted' | 'completedLast' |
      'archiveCompleted' | 'confirmDelete',
  ): void {
    this.listsStore.updateSettings({
      [setting]: !this.listsStore.settings()[setting],
    });
  }
}
