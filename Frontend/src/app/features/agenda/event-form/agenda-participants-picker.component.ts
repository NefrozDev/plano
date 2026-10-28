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
import { TranslocoPipe } from '@jsverse/transloco';
import type { Contact } from '@plano/common';
import { normalizeText } from '../../../core/time/dates';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { UserAvatarComponent } from '../../../shared/ui/user-avatar.component';
import { AgendaStore } from '../agenda.store';

/** A titled section: `title` is a translation key, unless `literal` (a group name). */
interface ContactGroup {
  id: string;
  title: string;
  literal: boolean;
  people: Contact[];
}

/**
 * Screen 7: full-screen panel over the event form; edits a copy until confirmed.
 * Only the user's contacts can be invited: friends first, then each group.
 */
@Component({
  selector: 'app-agenda-participants-picker',
  imports: [SearchFieldComponent, TranslocoPipe, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section role="dialog" aria-modal="true" aria-labelledby="participants-title">
      <header>
        <button type="button" [attr.aria-label]="'participants.cancel' | transloco" (click)="cancelled.emit()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <h2 id="participants-title">{{ 'participants.title' | transloco }}</h2>
        <button class="confirm" type="button" [attr.aria-label]="'participants.confirm' | transloco" (click)="confirm.emit(picked())">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </button>
      </header>

      <app-search-field
        [label]="'participants.search' | transloco"
        [placeholder]="'participants.search' | transloco"
        [maxLength]="60"
        [(value)]="query"
      />

      <div class="lists">
        @if (loading()) {
          <p class="empty" role="status">{{ 'participants.loading' | transloco }}</p>
        } @else if (loadFailed()) {
          <p class="empty" role="alert">{{ 'participants.loadFailed' | transloco }}</p>
        } @else {
          @for (group of groups(); track group.id) {
            <h3>{{ group.literal ? group.title : (group.title | transloco) }}</h3>
            @for (person of group.people; track person.id) {
              <label class="person">
                <app-user-avatar [user]="person" [size]="30" />
                <span class="name">{{ name(person) }}</span>
                <input type="checkbox" [checked]="picked().includes(person.id)" (change)="toggle(person.id)" />
                <i aria-hidden="true"></i>
              </label>
            }
          } @empty {
            <p class="empty">{{ (query().trim() ? 'participants.noMatch' : 'participants.none') | transloco }}</p>
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
  readonly loading = signal(true);
  readonly loadFailed = signal(false);

  /** Each person once: in "Friends" if they are one, else in the first group they share. */
  readonly groups = computed((): ContactGroup[] => {
    const needle = normalizeText(this.query());
    const contacts = this.store.invitable();
    if (needle) {
      const people = contacts.filter((person) =>
        [this.name(person), person.username].some((text) => normalizeText(text).includes(needle)),
      );
      return people.length ? [{ id: 'results', title: 'participants.results', literal: false, people }] : [];
    }
    const sections: ContactGroup[] = [
      { id: 'friends', title: 'participants.friends', literal: false, people: contacts.filter(({ friend }) => friend) },
    ];
    for (const person of contacts.filter(({ friend }) => !friend)) {
      const [first] = person.groups;
      if (!first) continue;
      let section = sections.find(({ id }) => id === first.id);
      if (!section) {
        section = { id: first.id, title: first.name, literal: true, people: [] };
        sections.push(section);
      }
      section.people.push(person);
    }
    return sections.filter(({ people }) => people.length);
  });

  ngOnInit(): void {
    this.picked.set([...this.selected()]);
    void this.store.loadContacts().then((loaded) => {
      this.loadFailed.set(!loaded);
      this.loading.set(false);
    });
  }

  name(person: Contact): string {
    return `${person.firstName} ${person.lastName}`.trim() || person.username;
  }

  toggle(id: string): void {
    this.picked.update((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
  }
}
