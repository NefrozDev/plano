import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import type { ListSummary } from '@plano/common';
import { FriendNotificationsService } from '../../core/friends/friend-notifications.service';
import { normalizeText } from '../../core/time/dates';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { SwitchRowComponent } from '../../shared/ui/switch-row.component';
import { ToastComponent } from '../../shared/ui/toast.component';
import { LIST_COLOR_CHOICES } from './list-detail/list-options';
import { SwipeToDelete } from './list-detail/swipe-to-delete';
import { ListsStore } from './lists.store';

type ListFilter = 'all' | 'mine' | 'shared' | 'archived';
type BooleanSetting = 'showCounts' | 'showCompleted' | 'completedLast' | 'archiveCompleted' | 'confirmDelete';
type OverviewAction = 'settings';

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
  imports: [NgTemplateOutlet, RouterLink, AutofocusDirective, BottomNavComponent, SwitchRowComponent, ToastComponent],
  templateUrl: './lists.component.html',
  styleUrl: './lists.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointermove)': 'moveDrag($event)',
    '(pointerup)': 'endDrag()',
    '(pointercancel)': 'endDrag()',
  },
})
export class ListsComponent {
  /** Friend news, shown on the bell that leads to the friends list. */
  readonly notifications = inject(FriendNotificationsService);
  readonly listsStore = inject(ListsStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly confirm = inject(ConfirmService);
  /** One card slides at a time: the one being swiped. */
  readonly swipedList = signal<ListSummary | null>(null);
  readonly swipe = new SwipeToDelete(() => {
    const list = this.swipedList();
    if (list) void this.requestDelete(list);
  });
  /** The list being dragged by its handle. */
  readonly draggedList = signal<string | null>(null);
  private dragMoved = false;

  readonly filters: readonly { label: string; value: ListFilter }[] = [
    { label: 'Toutes', value: 'all' },
    { label: 'Mes listes', value: 'mine' },
    { label: 'Partagées', value: 'shared' },
    { label: 'Archivées', value: 'archived' },
  ];
  /**
   * Overview actions: a single one is shown as its own button, several go
   * behind the "more options" menu.
   */
  readonly actions: readonly { id: OverviewAction; label: string }[] = [{ id: 'settings', label: 'Paramètres' }];
  readonly activeFilter = signal<ListFilter>('all');
  readonly searchOpen = signal(false);
  readonly query = signal('');
  readonly gridView = computed(() => this.listsStore.settings()?.defaultView === 'grid');
  readonly menuOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly creating = signal(false);
  private readonly search = computed(() => normalizeText(this.query()));
  readonly cards = computed<readonly ListCard[]>(() => {
    const filter = this.activeFilter();
    const search = this.search();
    return this.listsStore
      .lists()
      .filter((list) =>
        filter === 'archived'
          ? list.archived
          : !list.archived && (filter === 'all' || list.ownership === filter),
      )
      .filter((list) => !search || normalizeText(list.name).includes(search))
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

  runAction(action: OverviewAction): void {
    this.menuOpen.set(false);
    if (action === 'settings') this.openSettings();
  }

  /** Closing the search also clears it, so no list stays hidden by a forgotten query. */
  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
    if (!this.searchOpen()) this.query.set('');
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

  startDrag(listId: string, event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragMoved = false;
    this.draggedList.set(listId);
  }

  /** Moves the dragged list onto the card under the pointer. */
  moveDrag(event: PointerEvent): void {
    const sourceId = this.draggedList();
    if (!sourceId) return;
    event.preventDefault();
    const targetId = this.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.list-item')?.dataset['listId'];
    if (!targetId || targetId === sourceId) return;
    this.listsStore.moveList(sourceId, targetId);
    this.dragMoved = true;
  }

  /** Saves the new order once, on drop. */
  endDrag(): void {
    if (!this.draggedList()) return;
    this.draggedList.set(null);
    if (this.dragMoved) void this.listsStore.saveListOrder();
  }

  /** Keyboard alternative to dragging: arrows move the list past its visible neighbour. */
  moveWithKeyboard(listId: string, event: KeyboardEvent): void {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const cards = this.cards();
    const target = cards[cards.findIndex(({ list }) => list.id === listId) + step];
    if (!target) return;
    this.listsStore.moveList(listId, target.list.id);
    void this.listsStore.saveListOrder();
  }

  /** Owners swipe a card left to delete their list; others' lists do not move. */
  startSwipe(list: ListSummary, event: PointerEvent): void {
    if (list.role !== 'owner') return;
    this.swipedList.set(list);
    this.swipe.start(event);
  }

  /** Two-finger touchpad swipe over an own list's card. */
  wheelSwipe(list: ListSummary, event: WheelEvent): void {
    if (list.role !== 'owner') return;
    if (this.swipedList()?.id !== list.id) this.swipedList.set(list);
    this.swipe.wheel(event);
  }

  /** A tap opens the list; the click that ends a swipe does not. */
  openList(listId: string, event: MouseEvent): void {
    if (this.swipe.swallowClick(event)) return;
    void this.router.navigate(['/lists', listId]);
  }

  /** Always confirmed: every member loses the list and its items. */
  async requestDelete(list: ListSummary): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Supprimer la liste ?',
      message: `« ${list.name} » et tous ses éléments seront supprimés pour tous ses membres.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (confirmed) await this.listsStore.deleteList(list.id);
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
