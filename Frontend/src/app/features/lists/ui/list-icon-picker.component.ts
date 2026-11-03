import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core';
import type { ListIcon } from '@plano/common';
import { ModalDialogComponent } from '../../../shared/ui/modal-dialog.component';
import { ListIconComponent } from './list-icon.component';
import { FIRST_LINE_SIZE, LIST_ICON_GROUPS, LIST_ICON_SHAPES } from './list-icons';

const FIRST_LINE = LIST_ICON_GROUPS.flatMap(({ icons }) => icons).slice(0, FIRST_LINE_SIZE);

/**
 * The first line of the icon catalog, then "+" for all of it in a dialog. A
 * chosen icon from further down takes the line's last place, so it stays in sight.
 */
@Component({
  selector: 'app-list-icon-picker',
  imports: [ListIconComponent, ModalDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="line">
      @for (icon of line(); track icon) {
        <button
          type="button"
          class="choice"
          [class.selected]="value() === icon"
          [attr.aria-label]="labels[icon].label"
          [attr.aria-pressed]="value() === icon"
          (click)="value.set(icon)"
        ><app-list-icon [icon]="icon" /></button>
      }
      <button class="choice more" type="button" aria-label="Toutes les icônes" aria-haspopup="dialog" (click)="open.set(true)">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 8v16M8 16h16" /></svg>
      </button>
    </div>

    <app-modal-dialog heading="Choisir une icône" [open]="open()" (closed)="open.set(false)">
      <div class="catalog">
        @for (group of groups; track group.label) {
          <section [attr.aria-label]="group.label">
            <h3>{{ group.label }}</h3>
            <div class="grid">
              @for (icon of group.icons; track icon) {
                <button
                  type="button"
                  class="choice"
                  [class.selected]="value() === icon"
                  [attr.aria-label]="labels[icon].label"
                  [attr.aria-pressed]="value() === icon"
                  [attr.title]="labels[icon].label"
                  (click)="choose(icon)"
                ><app-list-icon [icon]="icon" /></button>
              }
            </div>
          </section>
        }
      </div>
    </app-modal-dialog>
  `,
  styles: `
    .line, .grid { display: grid; grid-template-columns: repeat(6, 2.4rem); justify-content: space-between; gap: .35rem; }
    .line { margin-top: .65rem; }
    .choice { --list-icon-size: 1.45rem; display: grid; width: 2.4rem; height: 2.4rem; padding: 0; place-items: center; border: 2px solid transparent; border-radius: .6rem; background: transparent; color: #59657A; cursor: pointer; }
    .choice.selected { border-color: var(--color-primary); background: #EEF4FF; color: var(--color-primary); }
    .more { border: 2px dashed #c9d5f5; color: var(--color-primary); }
    .more svg { width: 1.45rem; height: 1.45rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 2; }
    .catalog { display: grid; gap: .9rem; max-height: min(60vh, 30rem); margin: 0 -.25rem; padding: 0 .25rem .2rem; overflow-y: auto; overscroll-behavior: contain; }
    h3 { margin: 0 0 .4rem; color: #586174; font-size: .72rem; font-weight: 750; }
    .grid { justify-content: start; }
  `,
})
export class ListIconPickerComponent {
  readonly value = model.required<ListIcon>();
  readonly open = signal(false);
  readonly groups = LIST_ICON_GROUPS;
  readonly labels = LIST_ICON_SHAPES;
  readonly line = computed(() => {
    const value = this.value();
    return FIRST_LINE.includes(value) ? FIRST_LINE : [...FIRST_LINE.slice(0, -1), value];
  });

  choose(icon: ListIcon): void {
    this.value.set(icon);
    this.open.set(false);
  }
}
