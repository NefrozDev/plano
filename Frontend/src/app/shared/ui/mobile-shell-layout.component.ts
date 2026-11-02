import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Phone-frame shell for feature areas whose screens are routed children (objectives, agenda). */
@Component({
  selector: 'app-mobile-shell-layout',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-canvas">
      <main class="mobile-shell"><router-outlet /></main>
    </div>
  `,
  styles: `
    :host { display: block; }
    .app-canvas { min-height: 100dvh; background: var(--color-surface); }
    .mobile-shell { position: relative; display: flex; width: 100%; height: 100dvh; min-height: 0; flex-direction: column; overflow: hidden; background: #fff; }
    @media (min-width: 700px) {
      .app-canvas { display: grid; padding: 2rem; place-items: center; }
      .mobile-shell { width: var(--phone-width); height: var(--phone-height); border: var(--phone-bezel); border-radius: var(--phone-radius); box-shadow: var(--shadow-page); }
    }
  `,
})
export class MobileShellLayoutComponent {}
