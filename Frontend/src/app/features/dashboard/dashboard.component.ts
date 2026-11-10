import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { UserAvatarComponent } from '../../shared/ui/user-avatar.component';
import { CountPipe, t } from '../../core/i18n/translate';
import { addDays, formatShortWeekday, parseIsoDate, startOfWeek } from '../../core/time/dates';
import { dueCaption, objectiveTint } from '../objectives/objective.utils';
import { ObjectivesStore } from '../objectives/objectives.store';
import { AgendaStore } from '../agenda/agenda.store';
import { ListsStore } from '../lists/lists.store';
import { ObjectiveIconComponent } from '../objectives/ui/objective-icon.component';
import { NotificationsBellComponent } from './notifications-bell.component';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    TranslocoPipe,
    CountPipe,
    BottomNavComponent,
    NotificationsBellComponent,
    ObjectiveIconComponent,
    UserAvatarComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly listsStore = inject(ListsStore);
  private readonly objectivesStore = inject(ObjectivesStore);
  private readonly agendaStore = inject(AgendaStore);

  /** The current week, today highlighted, a dot on days with agenda items. */
  readonly weekDays = computed(() => {
    const today = this.agendaStore.today();
    const first = startOfWeek(today, this.agendaStore.settings().weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(first, index);
      return {
        date,
        label: formatShortWeekday(date),
        day: parseIsoDate(date).getDate(),
        selected: date === today,
        hasEvent: this.agendaStore.itemsOn(date).length > 0,
      };
    });
  });
  readonly weekLabel = computed(() => {
    const days = this.weekDays();
    return t('dashboard.week', { from: days[0].day, to: days[6].day });
  });
  /** Lists the user pinned to their home page, in their order; null while loading. */
  readonly homeLists = this.listsStore.home;
  /** The item being ticked, so a double tap sends one request. */
  readonly checking = signal('');
  /** Objectives the user pinned to their home page, in their order; null while loading. */
  readonly goals = computed(() =>
    this.objectivesStore.home()?.map((objective) => ({
      id: objective.id,
      title: objective.title,
      category: objective.category,
      completed: objective.status === 'completed',
      progress: objective.percent,
      due: dueCaption(objective),
      tint: objectiveTint(objective.category, this.objectivesStore.settings().categoryColors),
    })) ?? null,
  );
  readonly displayName = computed(
    () => this.auth.user()?.firstName || this.auth.user()?.username || t('dashboard.you'),
  );
  readonly user = this.auth.user;

  constructor() {
    // The week strip's event dots include list reminders served by the API.
    void this.agendaStore.load();
    void this.listsStore.loadHome();
    void this.objectivesStore.loadHome();
  }

  /** Ticks an item of a pinned list; it then leaves the card. */
  async check(listId: string, entryId: string): Promise<void> {
    if (this.checking()) return;
    this.checking.set(entryId);
    await this.listsStore.checkHomeEntry(listId, entryId);
    this.checking.set('');
  }
}
