import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { normalizeText } from '../../../core/time/dates';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { AgendaStore } from '../agenda.store';

/** Screen 7: full-screen panel over the event form; edits a copy until confirmed. */
@Component({
  selector: 'app-agenda-participants-picker',
  imports: [SearchFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section role="dialog" aria-modal="true" aria-labelledby="participants-title">
      <header>
        <button type="button" aria-label="Annuler" (click)="cancelled.emit()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <h2 id="participants-title">Participants</h2>
        <button class="confirm" type="button" aria-label="Valider les participants" (click)="confirm.emit(picked())">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </button>
      </header>

      <app-search-field label="Rechercher un contact" placeholder="Rechercher un contact" [maxLength]="60" [(value)]="query" />

      <div class="lists">
        @for (group of groups(); track group.title) {
          <h3>{{ group.title }}</h3>
          @for (person of group.people; track person.id) {
            <label class="person">
              <span class="avatar" [style.background]="person.color" aria-hidden="true">{{ person.initials }}</span>
              <span class="name">{{ person.name }}</span>
              <input type="checkbox" [checked]="picked().includes(person.id)" (change)="toggle(person.id)" />
              <i aria-hidden="true"></i>
            </label>
          } @empty {
            <p class="empty">Aucun contact trouvé.</p>
          }
        }
      </div>
    </section>
  `,
  styles: `
    :host { position: absolute; z-index: 30; inset: 0; display: flex; background: white; }
    section { display: flex; flex: 1; min-height: 0; flex-direction: column; }
    header { display: grid; grid-template-columns: 2.5rem 1fr 2.5rem; align-items: center; padding: calc(1.35rem + env(safe-area-inset-top)) 1rem .7rem; }
    header button { display: grid; width: 2.5rem; height: 2.5rem; padding: .5rem; place-items: center; border: 0; background: transparent; color: #253047; cursor: pointer; }
    header .confirm { color: var(--color-primary); }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
    h2 { margin: 0; font-size: 1.02rem; text-align: center; }
    .lists { flex: 1; min-height: 0; padding: 0 1.25rem 2rem; overflow-y: auto; }
    h3 { margin: 1rem 0 .3rem; color: #586174; font-size: .72rem; }
    .person { position: relative; display: grid; min-height: 2.8rem; grid-template-columns: auto 1fr auto; gap: .7rem; align-items: center; cursor: pointer; }
    .avatar { display: grid; width: 1.9rem; height: 1.9rem; place-items: center; border-radius: 50%; color: white; font-size: .66rem; font-weight: 750; }
    .name { font-size: .82rem; font-weight: 600; }
    input[type='checkbox'] { position: absolute; right: 0; width: 1.35rem; height: 1.35rem; margin: 0; opacity: 0; cursor: pointer; }
    i { display: grid; width: 1.35rem; height: 1.35rem; place-items: center; border: 2px solid #c2c8d3; border-radius: 50%; }
    input:checked + i { border-color: var(--color-primary); background: var(--color-primary); }
    input:checked + i::after { width: .45rem; height: .25rem; border-bottom: 2px solid white; border-left: 2px solid white; content: ''; transform: translateY(-.06rem) rotate(-45deg); }
    input:focus-visible + i { outline: 3px solid color-mix(in srgb, var(--color-focus) 60%, transparent); outline-offset: 2px; }
    .empty { color: var(--color-text-muted); font-size: .78rem; }
  `,
})
export class AgendaParticipantsPickerComponent implements OnInit {
  private readonly store = inject(AgendaStore);

  readonly selected = input.required<readonly string[]>();
  readonly confirm = output<string[]>();
  readonly cancelled = output<void>();

  readonly query = signal('');
  readonly picked = signal<string[]>([]);

  readonly groups = computed(() => {
    const needle = normalizeText(this.query());
    const contacts = this.store.contacts();
    if (needle) {
      return [{ title: 'Résultats', people: contacts.filter((person) => normalizeText(person.name).includes(needle)) }];
    }
    return [
      { title: 'Fréquemment contactés', people: contacts.filter((person) => person.frequent) },
      { title: 'Tous les contacts', people: contacts.filter((person) => !person.frequent) },
    ].filter((group) => group.people.length);
  });

  ngOnInit(): void {
    this.picked.set([...this.selected()]);
  }

  toggle(id: string): void {
    this.picked.update((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
  }
}
