import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** One layout of a {@link ViewSwitchComponent}: an icon or a short text, named in full for screen readers. */
export interface ViewOption<T extends string = string> {
  value: T;
  /** Translation key of the full name, e.g. "Jour". */
  label: string;
  /** Translation key of the letter shown instead of an icon, e.g. "J". */
  short?: string;
  icon?: 'rows' | 'grid';
}

/** Rows and grid, as on the Lists and Objectives tabs. */
export const rowsOrGrid = (rowsLabel: string, gridLabel: string): readonly ViewOption<'list' | 'grid'>[] => [
  { value: 'list', label: rowsLabel, icon: 'rows' },
  { value: 'grid', label: gridLabel, icon: 'grid' },
];

/**
 * Every layout shown at once, the current one pressed: a single button
 * showing one icon read as a menu, not as a choice of layout.
 */
@Component({
  selector: 'app-view-switch',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="switch" role="group" [attr.aria-label]="'common.view' | transloco">
      @for (option of options(); track option.value) {
        <button
          type="button"
          [class]="option.value"
          [attr.aria-label]="option.label | transloco"
          [attr.aria-pressed]="option.value === value()"
          (click)="pick(option.value)"
        >
          @switch (option.icon) {
            @case ('rows') {
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
                <circle class="dot" cx="5" cy="6.5" r="1.3" /><circle class="dot" cx="5" cy="12" r="1.3" /><circle class="dot" cx="5" cy="17.5" r="1.3" />
              </svg>
            }
            @case ('grid') {
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
                <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
              </svg>
            }
            @default {
              <span aria-hidden="true">{{ option.short ?? '' | transloco }}</span>
            }
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; flex: none; }
    .switch { display: flex; padding: .15rem; border: 1px solid #8a93a6; border-radius: .6rem; }
    button { display: grid; width: 1.9rem; height: 1.9rem; padding: .3rem; place-items: center; border: 0; border-radius: .45rem; background: transparent; color: var(--color-text-muted); cursor: pointer; font: inherit; font-size: .85rem; font-weight: 750; }
    button[aria-pressed='true'] { background: var(--color-primary); color: white; }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
    .dot { fill: currentColor; stroke: none; }
    /* Still 27px targets, above the 24px minimum. */
    @media (max-width: 380px) { button { width: 1.7rem; height: 1.7rem; padding: .25rem; } }
  `,
})
export class ViewSwitchComponent<T extends string = string> {
  readonly options = input.required<readonly ViewOption<T>[]>();
  readonly value = input.required<T>();
  /** Emits only when the layout changes: pressing the current one does nothing. */
  readonly changed = output<T>();

  pick(value: T): void {
    if (value !== this.value()) this.changed.emit(value);
  }
}
