import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { UserAvatarComponent } from '../../shared/ui/user-avatar.component';
import { addDays, compareDueDates, formatDate, parseIsoDate, startOfWeek } from '../../core/time/dates';
import { objectiveProgress, objectiveTint } from '../objectives/objective.utils';
import { ObjectivesStore } from '../objectives/objectives.store';
import { AgendaStore } from '../agenda/agenda.store';
import { ListsStore } from '../lists/lists.store';
import { ObjectiveIconComponent } from '../objectives/ui/objective-icon.component';

const WEEKDAY_LABELS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslocoPipe, BottomNavComponent, ObjectiveIconComponent, UserAvatarComponent],
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
        label: WEEKDAY_LABELS[parseIsoDate(date).getDay()],
        day: parseIsoDate(date).getDate(),
        selected: date === today,
        hasEvent: this.agendaStore.itemsOn(date).length > 0,
      };
    });
  });
  readonly weekLabel = computed(() => {
    const days = this.weekDays();
    return `Semaine du ${days[0].day} au ${days[6].day}`;
  });
  /** Lists the user pinned to their home page, in their order; null while loading. */
  readonly homeLists = this.listsStore.home;
  /** The item being ticked, so a double tap sends one request. */
  readonly checking = signal('');
  readonly goals = computed(() =>
    this.objectivesStore
      .objectives()
      .filter((objective) => objective.status === 'active' && !objective.archived)
      .sort((first, second) => compareDueDates(first.dueDate, second.dueDate))
      .slice(0, 2)
      .map((objective) => ({
        id: objective.id,
        title: objective.title,
        category: objective.category,
        progress: objectiveProgress(objective),
        due: objective.dueDate ? `échéance : ${formatDate(objective.dueDate)}` : 'sans échéance',
        tint: objectiveTint(objective.category, this.objectivesStore.settings().categoryColors),
      })),
  );
  readonly displayName = computed(
    () => this.auth.user()?.firstName || this.auth.user()?.username || 'vous',
  );
  readonly user = this.auth.user;

  constructor() {
    // The week strip's event dots include list reminders served by the API.
    this.agendaStore.loadTasks();
    void this.listsStore.loadHome();
  }

  /** Ticks an item of a pinned list; it then leaves the card. */
  async check(listId: string, entryId: string): Promise<void> {
    if (this.checking()) return;
    this.checking.set(entryId);
    await this.listsStore.checkHomeEntry(listId, entryId);
    this.checking.set('');
  }
}
