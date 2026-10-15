import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgendaEvent } from '@plano/common';
import { formatDay } from '../../../core/time/dates';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { AgendaStore } from '../agenda.store';
import { formatTime, nextOccurrence, timePart } from '../agenda.utils';

interface SearchRow {
  event: AgendaEvent;
  color: string;
  date: string;
  caption: string;
}

/** Screen 9. Suggestions turn into a query or into the matching agenda view. */
@Component({
  selector: 'app-agenda-search',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header heading="Recherche" backLink="/agenda" backLabel="Fermer la recherche" variant="close" />

    <label class="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
      <input #searchInput type="search" maxlength="80" placeholder="Rechercher un événement, un lieu…" aria-label="Rechercher un événement" [value]="query()" (input)="query.set($any($event.target).value)" />
    </label>

    <div class="content" aria-live="polite">
      @if (query().trim()) {
        <h2>Résultats</h2>
        @for (row of results(); track row.event.id) {
          <a class="result" [routerLink]="['/agenda/events', row.event.id]" [queryParams]="{ date: row.date }">
            <i [style.background]="row.color" aria-hidden="true"></i>
            <span><strong>{{ row.event.title }}</strong><small>{{ row.caption }}</small></span>
          </a>
        } @empty {
          <p class="empty">Aucun événement ne correspond à « {{ query().trim() }} ».</p>
        }
      } @else {
        @if (recent().length) {
          <h2>Résultats récents</h2>
          @for (row of recent(); track row.event.id) {
            <a class="result" [routerLink]="['/agenda/events', row.event.id]" [queryParams]="{ date: row.date }">
              <i [style.background]="row.color" aria-hidden="true"></i>
              <span><strong>{{ row.event.title }}</strong><small>{{ row.caption }}</small></span>
            </a>
          }
        }
        <h2>Suggestions</h2>
        @if (frequentContact(); as contact) {
          <button class="suggestion" type="button" (click)="query.set(contact.name)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            Événements avec {{ contact.name }}
          </button>
        }
        <a class="suggestion" routerLink="/agenda" [queryParams]="{ view: 'week', date: today }">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          Événements cette semaine
        </a>
        <a class="suggestion" routerLink="/agenda" [queryParams]="{ view: 'month', date: today }">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          Événements du mois
        </a>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex: 1; min-height: 0; flex-direction: column; }
    .search { display: flex; gap: .5rem; align-items: center; margin: 0 1.25rem .4rem; padding: 0 .8rem; border: 1px solid var(--color-border); border-radius: .7rem; }
    .search:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 .2rem rgb(50 91 226 / 12%); }
    svg { width: 1.1rem; height: 1.1rem; flex: none; fill: none; stroke: #8a93a3; stroke-linecap: round; stroke-width: 2; }
    .search input { width: 100%; min-height: 2.8rem; border: 0; outline: 0; background: transparent; font-size: .84rem; }
    .content { flex: 1; min-height: 0; padding: 0 1.25rem 1.5rem; overflow-y: auto; }
    h2 { margin: 1rem 0 .3rem; color: #394254; font-size: .76rem; }
    .result { display: flex; gap: .75rem; align-items: center; padding: .55rem 0; color: var(--color-text); text-decoration: none; }
    .result i { width: .65rem; height: .65rem; flex: none; border-radius: 50%; }
    .result span { display: grid; gap: .15rem; min-width: 0; }
    .result strong { overflow: hidden; font-size: .82rem; text-overflow: ellipsis; white-space: nowrap; }
    .result small { color: #7b8292; font-size: .7rem; }
    .suggestion { display: flex; width: 100%; min-height: 2.7rem; gap: .65rem; align-items: center; padding: 0; border: 0; border-bottom: 1px solid #edf0f5; background: transparent; color: #20263a; cursor: pointer; font: inherit; font-size: .8rem; text-align: left; text-decoration: none; }
    .empty { padding: 1.5rem 0; color: var(--color-text-muted); font-size: .8rem; text-align: center; }
  `,
})
export class AgendaSearchComponent {
  private readonly store = inject(AgendaStore);
  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  readonly today = this.store.today();
  readonly query = signal('');
  readonly results = computed(() => this.store.search(this.query()).map((event) => this.toRow(event)));
  readonly recent = computed(() => this.store.recent().map((event) => this.toRow(event)));
  readonly frequentContact = computed(() => this.store.contacts().find((contact) => contact.frequent));

  constructor() {
    // The autofocus attribute is ignored after client-side navigation, so focus explicitly.
    afterNextRender(() => this.searchInput().nativeElement.focus());
  }

  private toRow(event: AgendaEvent): SearchRow {
    const occurrence = nextOccurrence(event, this.today) ?? { start: event.start, end: event.end };
    const date = occurrence.start.slice(0, 10);
    const time = event.allDay ? '' : ` à ${formatTime(timePart(occurrence.start), this.store.settings().hourFormat)}`;
    return { event, color: this.store.colorOf(event), date, caption: `${formatDay(date)}${time}` };
  }
}
