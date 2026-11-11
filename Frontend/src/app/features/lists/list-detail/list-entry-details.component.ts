import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ListEntry, ListMember, UpdateEntryRequest } from '@plano/common';
import { formatLocale } from '../../../core/i18n/translate';
import { CommitOnEnterDirective } from '../../../shared/ui/commit-on-enter.directive';

/**
 * Full-screen editor of one entry. Text fields are saved when they lose focus
 * (`change`), not on every keystroke; viewers see the fields disabled.
 */
@Component({
  selector: 'app-list-entry-details',
  imports: [TranslocoPipe, CommitOnEnterDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="entry-details" aria-labelledby="entry-details-title">
      <header>
        <button type="button" [attr.aria-label]="'lists.entry.back' | transloco" (click)="closed.emit()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <h2 id="entry-details-title">{{ 'lists.entry.heading' | transloco }}</h2>
      </header>

      <div class="entry-details-content">
        <div class="entry-name-editor">
          <button
            class="details-toggle"
            type="button"
            [class.done]="entry().done"
            [attr.aria-pressed]="entry().done"
            [disabled]="readonly()"
            (click)="entryChange.emit({ done: !entry().done })"
          ><i aria-hidden="true"></i></button>
          <input
            appCommitOnEnter
            [attr.aria-label]="'lists.entry.name' | transloco"
            maxlength="200"
            [value]="entry().name"
            [disabled]="readonly()"
            (change)="rename($any($event.target))"
          />
        </div>

        <section class="detail-fields">
          <div class="detail-field">
            <span>{{ 'lists.entry.inList' | transloco }}</span>
            <strong>{{ listTitle() }}</strong>
          </div>
          <div class="detail-field">
            <span>{{ 'lists.entry.section' | transloco }}</span>
            <strong>{{ sectionName() }}</strong>
          </div>
          <div class="detail-field two-line">
            <span>{{ 'lists.entry.addedBy' | transloco }}</span>
            <strong>{{ entry().addedBy ?? ('lists.entry.deletedAccount' | transloco) }}</strong>
            <small>{{ addedAt() }}</small>
          </div>
          <label class="detail-field">
            <span>{{ 'lists.entry.assignedTo' | transloco }}</span>
            <select class="choice-select" [disabled]="readonly()" (change)="entryChange.emit({ assignedTo: $any($event.target).value || null })">
              <option value="" [selected]="!entry().assignedTo">{{ 'lists.entry.unassigned' | transloco }}</option>
              @for (member of members(); track member.id) {
                <option [value]="member.id" [selected]="member.id === entry().assignedTo">{{ member.name }}</option>
              }
            </select>
          </label>
          <label class="detail-field">
            <span>{{ 'lists.entry.reminder' | transloco }}</span>
            <input
              type="datetime-local"
              [value]="entry().reminder ?? ''"
              [disabled]="readonly()"
              (change)="entryChange.emit({ reminder: $any($event.target).value || null })"
            />
          </label>
          <label class="detail-notes">
            <span>{{ 'lists.entry.notes' | transloco }}</span>
            <textarea
              rows="5"
              maxlength="2000"
              [placeholder]="'lists.entry.notesPlaceholder' | transloco"
              [value]="entry().notes"
              [disabled]="readonly()"
              (change)="entryChange.emit({ notes: $any($event.target).value })"
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

  readonly entryChange = output<UpdateEntryRequest>();
  readonly closed = output<void>();

  readonly addedAt = computed(() =>
    new Intl.DateTimeFormat(formatLocale(), { dateStyle: 'long', timeStyle: 'short' }).format(new Date(this.entry().addedAt)),
  );

  /** A blank name is refused: the field goes back to the saved one. */
  rename(field: HTMLInputElement): void {
    const name = field.value.trim();
    if (name) {
      this.entryChange.emit({ name });
    } else {
      field.value = this.entry().name;
    }
  }
}
