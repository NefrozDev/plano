import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { TimelapseView } from '../objective.utils';

/** How much time has passed or is left; full and red once past the deadline. */
@Component({
  selector: 'app-timelapse-bar',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.overdue]': 'view().overdue' },
  template: `
    <span class="label">{{ view().label }}</span>
    <i
      class="bar"
      role="progressbar"
      [attr.aria-label]="'objectives.card.time' | transloco"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="view().percent"
      [attr.aria-valuetext]="view().label"
    ><b [style.width.%]="view().percent"></b></i>
  `,
  styles: `
    :host { --time: var(--color-text-muted); display: grid; gap: .2rem; }
    :host(.overdue) { --time: var(--color-danger); }
    .label { color: var(--time); font-size: .66rem; font-weight: 650; }
    :host(:not(.overdue)) .label { color: var(--color-text-muted); }
    .bar { display: block; height: .22rem; overflow: hidden; border-radius: 1rem; background: #eef1f6; }
    .bar b { display: block; height: 100%; border-radius: inherit; background: var(--time); transition: width .4s ease; }
  `,
})
export class TimelapseBarComponent {
  readonly view = input.required<TimelapseView>();
}
