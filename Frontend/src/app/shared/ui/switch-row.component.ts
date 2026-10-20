import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Settings row with a label (and optional hint) and an on/off switch. */
@Component({
  selector: 'app-switch-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="switch-row" type="button" role="switch" [attr.aria-checked]="checked()" (click)="toggled.emit()">
      <span>
        {{ label() }}
        @if (hint()) {
          <small>{{ hint() }}</small>
        }
      </span>
      <i class="switch" [class.on]="checked()" aria-hidden="true"><b></b></i>
    </button>
  `,
  styles: `
    :host { display: block; }
    .switch-row { display: grid; width: 100%; min-height: 2.6rem; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: .25rem 0; border: 0; background: transparent; color: #20263a; cursor: pointer; font: inherit; font-size: .8rem; text-align: left; }
    small { display: block; margin-top: .1rem; color: #8a93a3; font-size: .68rem; }
    .switch { position: relative; display: block; width: 2.15rem; height: 1.25rem; border-radius: 1rem; background: #dfe4ed; transition: background-color 180ms ease; }
    .switch b { position: absolute; top: .15rem; left: .15rem; width: .95rem; height: .95rem; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgb(20 30 50 / 22%); transition: transform 180ms ease; }
    .switch.on { background: var(--color-primary); }
    .switch.on b { transform: translateX(.9rem); }
  `,
})
export class SwitchRowComponent {
  readonly label = input.required<string>();
  readonly checked = input.required<boolean>();
  readonly hint = input('');
  readonly toggled = output<void>();
}
