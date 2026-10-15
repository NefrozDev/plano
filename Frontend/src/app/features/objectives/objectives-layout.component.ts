import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Phone-frame shell shared by every objectives screen. */
@Component({
  selector: 'app-objectives-layout',
  standalone: true,
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
      .mobile-shell { width: min(100%, 430px); height: min(844px, calc(100vh - 4rem)); border: 8px solid #171c2b; border-radius: 2.8rem; box-shadow: var(--shadow-page); }
    }
  `,
})
export class ObjectivesLayoutComponent {}
