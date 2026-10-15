import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ListEntry } from '@plano/common';
import type { EntryChanges } from '../lists.store';

/** Full-screen editor of one entry; every edit is emitted as it happens. */
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
        <button type="button" aria-label="Plus d’options">⋮</button>
      </header>

      <div class="entry-details-content">
        <div class="entry-name-editor">
          <button
            class="details-toggle"
            type="button"
            [class.done]="entry().done"
            [attr.aria-pressed]="entry().done"
            (click)="change.emit({ done: !entry().done })"
          ><i aria-hidden="true"></i></button>
          <input aria-label="Nom de l’élément" [value]="entry().name" (input)="change.emit({ name: $any($event.target).value })" />
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
            <small>{{ entry().addedAt }}</small>
          </div>
          <label class="detail-field">
            <span>Assigné à</span>
            <select [value]="entry().assignedTo" (change)="change.emit({ assignedTo: $any($event.target).value })">
              <option value="">Non assigné</option>
              <option value="Alex">Alex</option>
              <option value="Camille">Camille</option>
              <option value="Sam">Sam</option>
            </select>
          </label>
          <label class="detail-field">
            <span>Rappel</span>
            <input type="datetime-local" [value]="entry().reminder" (change)="change.emit({ reminder: $any($event.target).value })" />
          </label>
          <label class="detail-notes">
            <span>Notes</span>
            <textarea rows="5" placeholder="Ajouter une note…" [value]="entry().notes" (input)="change.emit({ notes: $any($event.target).value })"></textarea>
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

  readonly change = output<EntryChanges>();
  readonly close = output<void>();
}
