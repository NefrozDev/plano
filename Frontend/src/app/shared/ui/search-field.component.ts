import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';

/** Rounded search input with a magnifier icon; bind the query with `[(value)]`. */
@Component({
  selector: 'app-search-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
      <input
        #input
        type="search"
        [attr.maxlength]="maxLength()"
        [placeholder]="placeholder()"
        [attr.aria-label]="label()"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
      />
    </label>
  `,
  styles: `
    :host { display: block; margin: 0 1.25rem .4rem; }
    .search { display: flex; gap: .5rem; align-items: center; padding: 0 .8rem; border: 1px solid var(--color-border); border-radius: .7rem; }
    .search:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 .2rem rgb(50 91 226 / 12%); }
    svg { width: 1.1rem; height: 1.1rem; flex: none; fill: none; stroke: #8a93a3; stroke-linecap: round; stroke-width: 2; }
    input { width: 100%; min-height: 2.7rem; border: 0; outline: 0; background: transparent; font-size: .84rem; }
  `,
})
export class SearchFieldComponent {
  readonly value = model('');
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly maxLength = input(80);
  readonly autofocus = input(false);

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  constructor() {
    // The autofocus attribute is ignored after client-side navigation, so focus explicitly
    // once both the input (view query) and the bound `autofocus` value are available.
    effect(() => {
      if (this.autofocus()) this.input()?.nativeElement.focus();
    });
  }
}
