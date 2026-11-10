import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { AgendaFilters } from '@plano/common';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SwitchRowComponent } from '../../../shared/ui/switch-row.component';
import { AgendaStore } from '../agenda.store';

type DisplayFilter = keyof Pick<AgendaFilters, 'showEvents' | 'showTasks' | 'showPastEvents'>;

/** Screen 8. Filters are saved and apply to every agenda view. */
@Component({
  selector: 'app-agenda-filters',
  imports: [RouterLink, TranslocoPipe, PageHeaderComponent, SwitchRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [heading]="'agenda.filters.heading' | transloco" backLink="/agenda" [backLabel]="'agenda.filters.close' | transloco" variant="close">
      <button class="reset" type="button" (click)="store.resetFilters()">{{ 'agenda.filters.reset' | transloco }}</button>
    </app-page-header>

    <div class="content">
      <section>
        <h2>{{ 'agenda.filters.calendars' | transloco }}</h2>
        @for (calendar of store.calendars(); track calendar.id) {
          <label class="option">
            <i class="dot" [style.background]="calendar.color" aria-hidden="true"></i>
            <span>{{ calendar.name }}</span>
            <input type="checkbox" [checked]="!store.filters().hiddenCalendarIds.includes(calendar.id)" (change)="store.toggleCalendar(calendar.id)" />
            <b aria-hidden="true"></b>
          </label>
        }
      </section>

      <section>
        <h2>{{ 'agenda.filters.show' | transloco }}</h2>
        @for (option of display; track option.key) {
          <app-switch-row [label]="option.label | transloco" [hint]="option.hint | transloco" [checked]="store.filters()[option.key]" (toggled)="toggle(option.key)" />
        }
      </section>
    </div>

    <div class="actions"><a class="primary-button" routerLink="/agenda">{{ 'agenda.filters.see' | transloco }}</a></div>
  `,
  styles: `
    :host { display: flex; flex: 1; min-height: 0; flex-direction: column; }
    .reset { padding: .4rem 0; border: 0; background: transparent; color: var(--color-primary); cursor: pointer; font-size: .76rem; font-weight: 700; }
    .content { flex: 1; min-height: 0; padding: 0 1.25rem 1.5rem; overflow-y: auto; }
    section { padding: .9rem 0; border-bottom: 1px solid #edf0f5; }
    section:last-child { border-bottom: 0; }
    h2 { margin: 0 0 .4rem; color: #394254; font-size: .78rem; }
    .option { position: relative; display: grid; min-height: 2.6rem; grid-template-columns: auto 1fr auto; gap: .7rem; align-items: center; cursor: pointer; font-size: .8rem; }
    .dot { width: .7rem; height: .7rem; border-radius: 50%; }
    .option input { position: absolute; right: 0; width: 1.3rem; height: 1.3rem; margin: 0; opacity: 0; cursor: pointer; }
    .option b { display: grid; width: 1.3rem; height: 1.3rem; place-items: center; border: 2px solid #c2c8d3; border-radius: .35rem; }
    .option input:checked + b { border-color: var(--color-primary); background: var(--color-primary); }
    .option input:checked + b::after { width: .45rem; height: .25rem; border-bottom: 2px solid white; border-left: 2px solid white; content: ''; transform: translateY(-.06rem) rotate(-45deg); }
    .option input:focus-visible + b { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    .actions { padding: .8rem 1.25rem calc(1.2rem + env(safe-area-inset-bottom)); border-top: 1px solid #edf0f5; }
    .actions .primary-button { text-decoration: none; }
  `,
})
export class AgendaFiltersComponent {
  readonly store = inject(AgendaStore);

  /** `label` and `hint` are translation keys. */
  readonly display: readonly { key: DisplayFilter; label: string; hint: string }[] = [
    { key: 'showEvents', label: 'agenda.filters.events', hint: 'agenda.filters.eventsHint' },
    { key: 'showTasks', label: 'agenda.filters.tasks', hint: 'agenda.filters.tasksHint' },
    { key: 'showPastEvents', label: 'agenda.filters.past', hint: 'agenda.filters.pastHint' },
  ];

  toggle(key: DisplayFilter): void {
    this.store.updateFilters({ [key]: !this.store.filters()[key] });
  }
}
