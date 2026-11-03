import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ListIcon } from '@plano/common';
import { LIST_ICON_SHAPES } from './list-icons';

/**
 * A list's icon, the one way to draw it. Decorative: the surrounding control
 * names the list. Coloured by `color`, sized by `--list-icon-size` and
 * `--list-icon-stroke` on a container (encapsulated styles cannot reach it).
 */
@Component({
  selector: 'app-list-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: `
    svg { width: var(--list-icon-size, 1.5rem); height: var(--list-icon-size, 1.5rem); fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: var(--list-icon-stroke, 2); }
  `,
  template: `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      @for (path of paths(); track $index) {
        <path [attr.d]="path" />
      }
    </svg>
  `,
})
export class ListIconComponent {
  readonly icon = input.required<ListIcon>();
  // An icon this version does not know (a newer app saved it) falls back to the cart.
  readonly paths = computed(() => (LIST_ICON_SHAPES[this.icon()] ?? LIST_ICON_SHAPES.cart).paths);
}
