import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Contact } from '@plano/common';

export function contactName(contact: Contact): string {
  return `${contact.firstName} ${contact.lastName}`.trim() || contact.username;
}

/** Ticks people among the signed-in user's contacts. */
@Component({
  selector: 'app-people-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (contacts() === null) {
      <p class="hint">{{ 'participants.loading' | transloco }}</p>
    } @else {
      <ul>
        @for (contact of contacts(); track contact.id) {
          <li>
            <label>
              <input type="checkbox" [checked]="selected().includes(contact.id)" (change)="toggled.emit(contact.id)" />
              <span>{{ name(contact) }}</span>
            </label>
          </li>
        } @empty {
          <li class="hint">{{ 'objectives.share.noContacts' | transloco }}</li>
        }
      </ul>
    }
  `,
  styles: `
    ul { display: grid; gap: .1rem; margin: 0; padding: 0; list-style: none; }
    label { display: flex; min-height: 2.2rem; gap: .55rem; align-items: center; color: #20263a; cursor: pointer; font-size: .8rem; }
    input { width: 1rem; height: 1rem; accent-color: var(--color-primary); }
    .hint { margin: 0; color: var(--color-text-muted); font-size: .72rem; line-height: 1.35; }
  `,
})
export class PeoplePickerComponent {
  /** Null while loading. */
  readonly contacts = input.required<readonly Contact[] | null>();
  readonly selected = input.required<readonly string[]>();
  readonly toggled = output<string>();
  readonly name = contactName;
}
