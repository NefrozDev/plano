import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Rows or grid, both shown with the current one pressed: a single button
 * showing one icon read as a menu, not as a choice of layout.
 */
@Component({
  selector: 'app-view-switch',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="switch" role="group" [attr.aria-label]="'common.view' | transloco">
      <button type="button" class="rows" [attr.aria-label]="rowsLabel() | transloco" [attr.aria-pressed]="!grid()" (click)="pick(false)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
          <circle class="dot" cx="5" cy="6.5" r="1.3" /><circle class="dot" cx="5" cy="12" r="1.3" /><circle class="dot" cx="5" cy="17.5" r="1.3" />
        </svg>
      </button>
      <button type="button" class="grid" [attr.aria-label]="gridLabel() | transloco" [attr.aria-pressed]="grid()" (click)="pick(true)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
        </svg>
      </button>
    </div>
  `,
  styles: `
    :host { display: block; flex: none; }
    .switch { display: flex; padding: .15rem; border: 1px solid #8a93a6; border-radius: .6rem; }
    button { display: grid; width: 1.9rem; height: 1.9rem; padding: .3rem; place-items: center; border: 0; border-radius: .45rem; background: transparent; color: var(--color-text-muted); cursor: pointer; }
    button[aria-pressed='true'] { background: var(--color-primary); color: white; }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
    .dot { fill: currentColor; stroke: none; }
    /* Still 27px targets, above the 24px minimum. */
    @media (max-width: 380px) { button { width: 1.7rem; height: 1.7rem; padding: .25rem; } }
  `,
})
export class ViewSwitchComponent {
  readonly grid = input.required<boolean>();
  /** Translation keys naming each layout for screen readers. */
  readonly rowsLabel = input.required<string>();
  readonly gridLabel = input.required<string>();
  /** Emits only when the layout changes: pressing the current one does nothing. */
  readonly changed = output<boolean>();

  pick(grid: boolean): void {
    if (grid !== this.grid()) this.changed.emit(grid);
  }
}
