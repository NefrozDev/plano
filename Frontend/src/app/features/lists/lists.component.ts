import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import type { ListSummary } from '@plano/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { formatList, t, tCount } from '../../core/i18n/translate';
import { type Person, toPerson } from '../../core/people/people';
import { normalizeText } from '../../core/time/dates';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { AvatarStackComponent } from '../../shared/ui/avatar-stack.component';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { SwitchRowComponent } from '../../shared/ui/switch-row.component';
import { ToastComponent } from '../../shared/ui/toast.component';
import { LIST_COLOR_CHOICES } from './list-detail/list-options';
import { ListIconComponent } from './ui/list-icon.component';
import { SwipeToDelete } from '../../shared/ui/swipe-to-delete';
import { ListsStore } from './lists.store';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { NewsDotComponent } from '../../shared/ui/news-dot.component';

type ListFilter = 'all' | 'mine' | 'shared' | 'archived';
type BooleanSetting = 'showCounts' | 'showCompleted' | 'completedLast' | 'archiveCompleted' | 'confirmDelete';
type OverviewAction = 'settings';

/** Translation key of the toast a shared list's swipe shows. */
export const SHARED_LIST_NOTICE = 'lists.overview.sharedNotice';

export interface ListCard {
  list: ListSummary;
  caption: string;
  /** Who shared it with the user, or whom the user shared it with. */
  people: readonly Person[];
  surface: string;
  progress: number;
}

/** Names shown in full before the rest is counted: "Bob, Cyd et 2 autres". */
const NAMED_PEOPLE = 3;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** "Partagée par Ada Lovelace", "Partagée avec Bob, Cyd et Dan", "Privée"… */
export function caption(list: ListSummary): string {
  const [owner, ...others] = list.members;
  if (list.ownership === 'shared') {
    return owner ? t('lists.caption.sharedBy', { name: owner.name }) : t('lists.caption.sharedWithYou');
  }
  if (!others.length) return t('lists.private');
  if (others.length === 1) return t('lists.caption.sharedWith', { names: others[0].name });
  const names = others.map(({ name }) => firstName(name));
  if (names.length <= NAMED_PEOPLE) return t('lists.caption.sharedWith', { names: formatList(names) });
  const shown = NAMED_PEOPLE - 1;
  return tCount('lists.caption.sharedWithOthers', names.length - shown, { names: names.slice(0, shown).join(', ') });
}

/** The sharer of a list shared with the user; else the people the user shared it with. */
function sharingPeople(list: ListSummary): Person[] {
  const [owner, ...others] = list.members;
  return (list.ownership === 'shared' ? (owner ? [owner] : []) : others).map(toPerson);
}

@Component({
  selector: 'app-lists',
  imports: [
    TranslocoPipe,
    ListIconComponent,
    NgTemplateOutlet,
    AutofocusDirective,
    AvatarStackComponent,
    BottomNavComponent,
    NewsDotComponent,
    SwitchRowComponent,
    ToastComponent,
  ],
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
  readonly listsStore = inject(ListsStore);
  /** Lists with unread news (shared, items added): read once opened. */
  readonly news = inject(NotificationsStore).unreadTargets;
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly confirm = inject(ConfirmService);
  /** One card slides at a time: the one being swiped. */
  readonly swipedList = signal<ListSummary | null>(null);
  readonly swipe = new SwipeToDelete(() => {
    const list = this.swipedList();
    if (list) void this.requestDelete(list);
  });
  /** Lists shared with the user do not slide; a swipe says why instead. */
  readonly sharedSwipe = new SwipeToDelete(() => this.notice.set(t(SHARED_LIST_NOTICE)));
  /** Short explanation shown in a toast, empty when none. */
  readonly notice = signal('');
  /** The list being dragged by its handle. */
  readonly draggedList = signal<string | null>(null);
  private dragMoved = false;

  /** Labels are translation keys. */
  readonly filters: readonly { label: string; value: ListFilter }[] = [
    { label: 'lists.filters.all', value: 'all' },
    { label: 'lists.filters.mine', value: 'mine' },
    { label: 'lists.filters.shared', value: 'shared' },
    { label: 'lists.filters.archived', value: 'archived' },
  ];
  /**
   * Overview actions: a single one is shown as its own button, several go
   * behind the "more options" menu.
   */
  readonly actions: readonly { id: OverviewAction; label: string }[] = [{ id: 'settings', label: 'titles.settings' }];
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
        people: sharingPeople(list),
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
    if (list.role !== 'owner') {
      this.sharedSwipe.start(event);
      return;
    }
    this.swipedList.set(list);
    this.swipe.start(event);
  }

  moveSwipe(list: ListSummary, event: PointerEvent): void {
    (list.role === 'owner' ? this.swipe : this.sharedSwipe).move(event);
  }

  finishSwipe(list: ListSummary): void {
    (list.role === 'owner' ? this.swipe : this.sharedSwipe).finish();
  }

  /** Two-finger touchpad swipe over an own list's card. */
  wheelSwipe(list: ListSummary, event: WheelEvent): void {
    if (list.role !== 'owner') {
      this.sharedSwipe.wheel(event);
      return;
    }
    if (this.swipedList()?.id !== list.id) this.swipedList.set(list);
    this.swipe.wheel(event);
  }

  /** A tap opens the list; the click that ends a swipe does not. */
  openList(listId: string, event: MouseEvent): void {
    if (this.swipe.swallowClick(event) || this.sharedSwipe.swallowClick(event)) return;
    void this.router.navigate(['/lists', listId]);
  }

  /** Always confirmed: every member loses the list and its items. */
  async requestDelete(list: ListSummary): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: t('lists.confirm.deleteListHeading'),
      message: t('lists.confirm.deleteList', { name: list.name }),
      confirmLabel: t('lists.confirm.delete'),
      tone: 'danger',
    });
    if (confirmed) await this.listsStore.deleteList(list.id);
  }

  /** Creates an untitled list and opens its editor. */
  async createList(): Promise<void> {
    if (this.creating()) return;
    this.creating.set(true);
    const list = await this.listsStore.createList({
      name: t('lists.overview.new'),
      icon: 'cart',
      color: LIST_COLOR_CHOICES[0],
    });
    this.creating.set(false);
    if (list) void this.router.navigate(['/lists', list.id], { queryParams: { edit: 1 } });
  }
}
