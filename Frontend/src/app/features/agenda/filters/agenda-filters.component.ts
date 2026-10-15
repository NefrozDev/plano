import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgendaFilters } from '@plano/common';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { AgendaStore } from '../agenda.store';

type DisplayFilter = keyof Pick<AgendaFilters, 'showEvents' | 'showTasks' | 'showPastEvents'>;

/** Screen 8. Filters are saved and apply to every agenda view. */
@Component({
  selector: 'app-agenda-filters',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header heading="Filtres" backLink="/agenda" backLabel="Fermer les filtres" variant="close">
      <button class="reset" type="button" (click)="store.resetFilters()">Réinitialiser</button>
    </app-page-header>

    <div class="content">
      <section>
        <h2>Calendriers</h2>
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
        <h2>Afficher</h2>
        @for (option of display; track option.key) {
          <button class="switch-row" type="button" role="switch" [attr.aria-checked]="store.filters()[option.key]" (click)="toggle(option.key)">
            <span>{{ option.label }}<small>{{ option.hint }}</small></span>
            <i class="switch" [class.on]="store.filters()[option.key]"><b></b></i>
          </button>
        }
      </section>
    </div>

    <div class="actions"><a class="primary-button" routerLink="/agenda">Voir l’agenda</a></div>
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
    .option input:focus-visible + b { outline: 3px solid color-mix(in srgb, var(--color-focus) 60%, transparent); outline-offset: 2px; }
    .switch-row { display: grid; width: 100%; min-height: 3rem; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: .3rem 0; border: 0; background: transparent; color: var(--color-text); cursor: pointer; font: inherit; font-size: .8rem; text-align: left; }
    .switch-row small { display: block; margin-top: .1rem; color: #8a93a3; font-size: .68rem; }
    .switch { position: relative; display: block; width: 2.15rem; height: 1.25rem; border-radius: 1rem; background: #dfe4ed; transition: background-color 180ms ease; }
    .switch b { position: absolute; top: .15rem; left: .15rem; width: .95rem; height: .95rem; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgb(20 30 50 / 22%); transition: transform 180ms ease; }
    .switch.on { background: #3264ed; }
    .switch.on b { transform: translateX(.9rem); }
    .actions { padding: .8rem 1.25rem calc(1.2rem + env(safe-area-inset-bottom)); border-top: 1px solid #edf0f5; }
    .actions .primary-button { text-decoration: none; }
  `,
})
export class AgendaFiltersComponent {
  readonly store = inject(AgendaStore);

  readonly display: readonly { key: DisplayFilter; label: string; hint: string }[] = [
    { key: 'showEvents', label: 'Événements', hint: 'Les événements de vos calendriers' },
    { key: 'showTasks', label: 'Tâches avec date', hint: 'Rappels des listes et séances d’objectifs' },
    { key: 'showPastEvents', label: 'Événements terminés', hint: 'Les événements déjà passés' },
  ];

  toggle(key: DisplayFilter): void {
    this.store.updateFilters({ [key]: !this.store.filters()[key] });
  }
}
