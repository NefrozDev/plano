import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ListEntry, ListMember, UpdateEntryRequest } from '@plano/common';

const addedAtFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/**
 * Full-screen editor of one entry. Text fields are saved when they lose focus
 * (`change`), not on every keystroke; viewers see the fields disabled.
 */
@Component({
  selector: 'app-list-entry-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="entry-details" aria-labelledby="entry-details-title">
      <header>
        <button type="button" aria-label="Retour à la liste" (click)="close.emit()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <h2 id="entry-details-title">Détail d’un élément</h2>
      </header>

      <div class="entry-details-content">
        <div class="entry-name-editor">
          <button
            class="details-toggle"
            type="button"
            [class.done]="entry().done"
            [attr.aria-pressed]="entry().done"
            [disabled]="readonly()"
            (click)="change.emit({ done: !entry().done })"
          ><i aria-hidden="true"></i></button>
          <input
            aria-label="Nom de l’élément"
            maxlength="200"
            [value]="entry().name"
            [disabled]="readonly()"
            (change)="rename($any($event.target))"
          />
        </div>

        <section class="detail-fields">
          <div class="detail-field">
            <span>Dans la liste</span>
            <strong>{{ listTitle() }}</strong>
          </div>
          <div class="detail-field">
            <span>Section</span>
            <strong>{{ sectionName() }}</strong>
          </div>
          <div class="detail-field two-line">
            <span>Ajouté par</span>
            <strong>{{ entry().addedBy }}</strong>
            <small>{{ addedAt() }}</small>
          </div>
          <label class="detail-field">
            <span>Assigné à</span>
            <select [disabled]="readonly()" (change)="change.emit({ assignedTo: $any($event.target).value || null })">
              <option value="" [selected]="!entry().assignedTo">Non assigné</option>
              @for (member of members(); track member.id) {
                <option [value]="member.id" [selected]="member.id === entry().assignedTo">{{ member.name }}</option>
              }
            </select>
          </label>
          <label class="detail-field">
            <span>Rappel</span>
            <input
              type="datetime-local"
              [value]="entry().reminder ?? ''"
              [disabled]="readonly()"
              (change)="change.emit({ reminder: $any($event.target).value || null })"
            />
          </label>
          <label class="detail-notes">
            <span>Notes</span>
            <textarea
              rows="5"
              maxlength="2000"
              placeholder="Ajouter une note…"
              [value]="entry().notes"
              [disabled]="readonly()"
              (change)="change.emit({ notes: $any($event.target).value })"
            ></textarea>
          </label>
        </section>
      </div>
    </section>
  `,
  styles: `:host { display: contents; }`,
})
export class ListEntryDetailsComponent {
  readonly entry = input.required<ListEntry>();
  readonly listTitle = input.required<string>();
  readonly sectionName = input.required<string>();
  /** People the entry can be assigned to. */
  readonly members = input<readonly ListMember[]>([]);
  readonly readonly = input(false);

  readonly change = output<UpdateEntryRequest>();
  readonly close = output<void>();

  readonly addedAt = computed(() => addedAtFormat.format(new Date(this.entry().addedAt)));

  /** A blank name is refused: the field goes back to the saved one. */
  rename(field: HTMLInputElement): void {
    const name = field.value.trim();
    if (name) {
      this.change.emit({ name });
    } else {
      field.value = this.entry().name;
    }
  }
}
