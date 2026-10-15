import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Objective } from '@plano/common';
import { ObjectiveIconComponent } from './objective-icon.component';

export interface ObjectiveCardView {
  objective: Objective;
  progress: number;
  progressText: string;
  caption: string;
  tint: string;
}

@Component({
  selector: 'app-objective-card',
  standalone: true,
  imports: [RouterLink, ObjectiveIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.tile]': 'tile()' },
  template: `
    <a
      class="card"
      [class.completed]="card().objective.status === 'completed'"
      [routerLink]="['/objectives', card().objective.id]"
      [style.--tint]="card().tint"
    >
      <app-objective-icon
        [category]="card().objective.category"
        [color]="card().tint"
        [completed]="card().objective.status === 'completed'"
      />
      <span class="copy">
        <strong>{{ card().objective.title }}</strong>
        <small>
          {{ card().caption }}
          @if (card().objective.status === 'paused') {
            <em>En pause</em>
          }
        </small>
        <i class="progress" aria-hidden="true"><b [style.width.%]="card().progress"></b></i>
      </span>
      <span class="value">
        <span class="visually-hidden">Progression : </span>{{ card().progressText }}
      </span>
    </a>
  `,
  styles: `
    :host { display: block; }
    .card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .8rem; align-items: center; padding: .85rem .9rem; border: 1px solid #edf0f5; border-radius: .9rem; background: white; box-shadow: 0 .2rem .6rem rgb(31 41 55 / 6%); color: var(--color-text); text-decoration: none; }
    .card.completed { border-color: #d5f3e1; background: #f3fcf6; }
    .copy { display: grid; gap: .3rem; min-width: 0; }
    strong { overflow: hidden; font-size: .88rem; text-overflow: ellipsis; white-space: nowrap; }
    small { color: #7b8292; font-size: .7rem; }
    em { margin-left: .35rem; padding: .05rem .4rem; border-radius: 1rem; background: #fff4e5; color: #b45d00; font-style: normal; font-weight: 650; }
    .progress { display: block; height: .3rem; margin-top: .15rem; overflow: hidden; border-radius: 1rem; background: color-mix(in srgb, var(--tint) 14%, #eef1f6); }
    .progress b { display: block; height: 100%; border-radius: inherit; background: var(--tint); transition: width .4s ease; }
    .completed .progress b { background: #22a95a; }
    :host(.tile) .card { grid-template-columns: 1fr; height: 100%; align-content: start; }
    :host(.tile) strong { white-space: normal; }
    .value { align-self: end; color: #3c4658; font-size: .74rem; font-weight: 700; white-space: nowrap; }
  `,
})
export class ObjectiveCardComponent {
  readonly card = input.required<ObjectiveCardView>();
  readonly tile = input(false);
}
