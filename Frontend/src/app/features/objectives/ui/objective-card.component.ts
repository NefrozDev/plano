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
      @if (tile()) {
        <!-- Thin progress line that thickens into a ring around the bubble holding the value. -->
        <span class="meter" [style.--objective-progress]="card().progress + '%'">
          <span class="meter-track" aria-hidden="true"><span class="meter-fill"></span></span>
          <span class="meter-bubble"><span class="visually-hidden">Progression : </span>{{ card().progressText }}</span>
        </span>
      }
      <span class="copy">
        <strong>{{ card().objective.title }}</strong>
        <small>
          {{ card().caption }}
          @if (card().objective.status === 'paused') {
            <em>En pause</em>
          }
        </small>
        @if (!tile()) {
          <i class="progress" aria-hidden="true"><b [style.width.%]="card().progress"></b></i>
        }
      </span>
      @if (!tile()) {
        <span class="value">
          <span class="visually-hidden">Progression : </span>{{ card().progressText }}
        </span>
      }
    </a>
  `,
  styles: `
    :host { display: block; }
    .card { --fill: var(--tint); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .8rem; align-items: center; padding: .85rem .9rem; border: 1px solid #edf0f5; border-radius: .9rem; background: white; box-shadow: 0 .2rem .6rem rgb(31 41 55 / 6%); color: var(--color-text); text-decoration: none; }
    .card.completed { --fill: #22a95a; border-color: #d5f3e1; background: #f3fcf6; }
    .copy { display: grid; gap: .3rem; min-width: 0; }
    strong { overflow: hidden; font-size: .88rem; text-overflow: ellipsis; white-space: nowrap; }
    /* Flex so the 'En pause' pill is vertically centred on the caption (and can wrap in tiles). */
    small { display: flex; flex-wrap: wrap; gap: .25rem .35rem; align-items: center; color: #7b8292; font-size: .7rem; }
    em { padding: .1rem .45rem; border-radius: 1rem; background: #fff4e5; color: #b45d00; font-style: normal; font-weight: 650; line-height: 1.2; }
    .progress { display: block; height: .3rem; margin-top: .15rem; overflow: hidden; border-radius: 1rem; background: color-mix(in srgb, var(--tint) 14%, #eef1f6); }
    .progress b { display: block; height: 100%; border-radius: inherit; background: var(--fill); transition: width .4s ease; }
    .value { align-self: end; color: #3c4658; font-size: .74rem; font-weight: 700; white-space: nowrap; }
    :host(.tile) .card { grid-template-columns: auto minmax(0, 1fr); align-content: start; height: 100%; }
    :host(.tile) .copy { grid-column: 1 / -1; }
    :host(.tile) strong { white-space: normal; }
    /* In tiles the pill gets its own line, centred under the left-aligned caption. */
    :host(.tile) small { flex-direction: column; align-items: flex-start; }
    :host(.tile) em { align-self: center; margin-top: .3rem; }
    /* Registered so the line and the ring around the bubble animate together. */
    @property --objective-progress { syntax: '<percentage>'; inherits: true; initial-value: 0%; }
    .meter { --track: color-mix(in srgb, var(--tint) 14%, #eef1f6); position: relative; display: grid; height: 1.75rem; align-items: center; container-type: inline-size; transition: --objective-progress .4s ease; }
    .meter-track { display: block; height: .45rem; overflow: hidden; border-radius: 1rem; background: var(--track); }
    .meter-fill { display: block; width: var(--objective-progress); height: 100%; border-radius: inherit; background: var(--fill); }
    /*
     * The bubble's border is the thickened part of the line. Its background is the
     * same progress gradient sized to the whole meter (100cqw) and centred; since the
     * bubble is centred too, the ring lines up with the line underneath.
     */
    .meter-bubble { position: absolute; top: 50%; left: 50%; max-width: 100%; overflow: hidden; padding: 0 .5rem; border: 3px solid transparent; border-radius: 1rem; background: linear-gradient(#fff, #fff) padding-box, linear-gradient(to right, var(--fill) var(--objective-progress), var(--track) var(--objective-progress)) center / 100cqw 100% border-box; color: #3c4658; font-size: .68rem; font-weight: 750; line-height: 1.1rem; text-overflow: ellipsis; transform: translate(-50%, -50%); white-space: nowrap; }
  `,
})
export class ObjectiveCardComponent {
  readonly card = input.required<ObjectiveCardView>();
  readonly tile = input(false);
}
