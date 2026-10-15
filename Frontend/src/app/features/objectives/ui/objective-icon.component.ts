import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ObjectiveCategory } from '@plano/common';

@Component({
  selector: 'app-objective-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'size-' + size()",
    '[class.completed]': 'completed()',
    '[style.--icon-color]': 'color()',
    'aria-hidden': 'true',
  },
  template: `
    <svg viewBox="0 0 24 24">
      @if (completed()) {
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      } @else {
        @switch (category()) {
          @case ('health') {
            <circle cx="15" cy="4.2" r="1.7" /><path d="m8.5 9.8 3.4-1.8 3.1 1.4 1.6 3.4 3 .9M11.9 8l-1.6 6.2 3.5 2.6-.9 4.8M10.3 14.2 8 17.3H4.8" />
          }
          @case ('learning') {
            <path d="M3 5.6c2.6-1 6-1 9 1 3-2 6.4-2 9-1v12.9c-2.6-1-6-1-9 1-3-2-6.4-2-9-1Z" /><path d="M12 6.6v12.9" />
          }
          @case ('finance') {
            <path d="M4.5 11.5c0-3.6 3.2-6 7.2-6 1.7 0 3.2.4 4.4 1.2L19 5.5v3.2c.7.6 1.2 1.4 1.4 2.3H22v3.5h-1.8a6 6 0 0 1-2.2 2.6V20h-3v-1.9a9 9 0 0 1-3.5 0V20h-3v-2.7a5.7 5.7 0 0 1-4-5.8Z" /><path d="M10 8.5h3.5" />
          }
          @case ('development') {
            <path d="M12 21v-8.5" /><path d="M12 12.5c0-4.3 2.8-6.8 7.5-6.8 0 4.3-2.8 6.8-7.5 6.8Z" /><path d="M12 14.5c0-3.3-2.3-5.5-6.5-5.5 0 3.3 2.3 5.5 6.5 5.5Z" />
          }
          @default {
            <path d="m12 3.2 2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.4-4.2 6-.9Z" />
          }
        }
      }
    </svg>
  `,
  styles: `
    :host { display: grid; flex: none; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--icon-color) 12%, white); color: var(--icon-color); }
    :host(.completed) { --icon-color: #22a95a; }
    :host(.size-sm) { width: 2.6rem; height: 2.6rem; }
    :host(.size-md) { width: 3rem; height: 3rem; }
    :host(.size-lg) { width: 5.4rem; height: 5.4rem; }
    svg { width: 50%; height: 50%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
  `,
})
export class ObjectiveIconComponent {
  readonly category = input.required<ObjectiveCategory>();
  readonly color = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('sm');
  readonly completed = input(false);
}
