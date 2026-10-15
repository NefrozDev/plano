import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Top bar of secondary screens: back/close link, centred title, projected actions. */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <a class="nav-link" [routerLink]="backLink()" [queryParams]="backQueryParams()" [attr.aria-label]="backLabel()">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          @if (variant() === 'close') {
            <path d="M6 6l12 12M18 6 6 18" />
          } @else {
            <path d="m15 5-7 7 7 7" />
          }
        </svg>
      </a>
      <h1 [class.visually-hidden]="!showHeading()">{{ heading() }}</h1>
      <div class="actions"><ng-content /></div>
    </header>
  `,
  styles: `
    header { display: grid; grid-template-columns: minmax(2.5rem, 5.5rem) 1fr minmax(2.5rem, 5.5rem); gap: .5rem; align-items: center; padding: calc(1.35rem + env(safe-area-inset-top)) 1rem .7rem; }
    .nav-link { display: grid; width: 2.5rem; height: 2.5rem; padding: .5rem; place-items: center; color: #253047; }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
    h1 { overflow: hidden; margin: 0; font-size: 1.02rem; letter-spacing: -.02em; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
    .actions { display: flex; justify-content: flex-end; }
  `,
})
export class PageHeaderComponent {
  readonly heading = input.required<string>();
  readonly backLink = input.required<string | unknown[]>();
  readonly backQueryParams = input<Record<string, string> | null>(null);
  readonly backLabel = input('Retour');
  readonly variant = input<'back' | 'close'>('back');
  readonly showHeading = input(true);
}
