import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Matches the fade-out in the styles below. */
export const SPLASH_EXIT_MS = 320;

/**
 * Brand screen shown over the app as it launches. The requested screen loads
 * underneath, so leaving it early (any tap, click or key) costs nothing.
 */
@Component({
  selector: 'app-splash-screen',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class.leaving]': 'leaving()',
    '[style.--splash-duration.ms]': 'duration()',
    '(pointerdown)': 'leave()',
    '(document:keydown)': 'leave()',
  },
  template: `
    <div class="screen">
      <div class="glow glow--blue"></div>
      <div class="glow glow--violet"></div>
      <div class="brand">
        <svg class="mark" viewBox="0 0 64 80">
          <defs>
            <linearGradient id="splash-gradient" x1="12" y1="65" x2="54" y2="7">
              <stop offset="0" stop-color="#6B2DEB" />
              <stop offset="0.58" stop-color="#325BE2" />
              <stop offset="1" stop-color="#2639F5" />
            </linearGradient>
          </defs>
          <path
            fill="url(#splash-gradient)"
            d="M14 29C14 13.5 24.3 4 38.2 4 51.7 4 60 13.4 60 26.1c0 14.2-9.8 23.5-24.6 23.5h-3.2L14 65.2V29Z"
          />
          <path fill="#4B37EF" d="M14 29 32.2 49.6 14 65.2V29Z" />
          <circle cx="39" cy="25" r="9.4" fill="#DCEAFF" />
          <circle cx="50.3" cy="12.2" r="3.2" fill="#F6FAFF" />
        </svg>
        <p class="name">Plano</p>
        <p class="tagline">{{ 'splash.tagline' | transloco }}</p>
      </div>
      <div class="progress"><i></i></div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      z-index: 100;
      inset: 0;
      display: grid;
      cursor: pointer;
      transition: opacity ${SPLASH_EXIT_MS}ms ease;
    }
    :host(.leaving) { opacity: 0; }

    .screen {
      position: relative;
      display: grid;
      overflow: hidden;
      place-items: center;
      background:
        radial-gradient(circle at 12% 8%, rgb(246 250 255 / 90%), transparent 21rem),
        linear-gradient(145deg, var(--color-surface) 0%, var(--color-background) 72%);
    }

    /* Same frame and place as the app's phone shell, so only the content seems to fade. */
    @media (min-width: 700px) {
      :host { padding: 2rem; place-items: center; background: var(--color-surface); }
      .screen { width: var(--phone-width); height: var(--phone-height); border: var(--phone-bezel); border-radius: var(--phone-radius); box-shadow: var(--shadow-page); }
    }

    .glow { position: absolute; width: 26rem; height: 26rem; border-radius: 50%; filter: blur(4rem); opacity: .22; pointer-events: none; }
    .glow--blue { top: -9rem; right: -10rem; background: var(--palette-blue); animation: drift 6s ease-in-out infinite alternate; }
    .glow--violet { bottom: -11rem; left: -10rem; background: #6B2DEB; opacity: .14; animation: drift 7s ease-in-out infinite alternate-reverse; }

    .brand { position: relative; display: grid; justify-items: center; text-align: center; transition: transform ${SPLASH_EXIT_MS}ms ease; }
    :host(.leaving) .brand { transform: scale(1.04); }

    .mark {
      width: 5.6rem;
      height: 6.6rem;
      filter: drop-shadow(0 1rem 1.6rem rgb(50 91 226 / 24%));
      animation: rise 700ms cubic-bezier(.2, .8, .2, 1) both, float 3.2s 700ms ease-in-out infinite alternate;
    }
    .name {
      margin: 1rem 0 0;
      color: var(--color-text);
      font-size: 3.4rem;
      font-weight: 800;
      letter-spacing: -.055em;
      line-height: 1;
      animation: rise 700ms 120ms cubic-bezier(.2, .8, .2, 1) both;
    }
    .tagline {
      margin: .8rem 0 0;
      color: var(--color-text-muted);
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: -.02em;
      animation: rise 700ms 240ms cubic-bezier(.2, .8, .2, 1) both;
    }

    .progress {
      position: absolute;
      bottom: calc(3.5rem + env(safe-area-inset-bottom));
      left: 50%;
      width: 3.5rem;
      height: 3px;
      overflow: hidden;
      border-radius: 3px;
      background: rgb(50 91 226 / 14%);
      transform: translateX(-50%);
    }
    .progress i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #6B2DEB, var(--palette-blue)); transform-origin: left; animation: fill var(--splash-duration) linear both; }

    @keyframes rise { from { opacity: 0; transform: translateY(.75rem) scale(.94); } }
    @keyframes float { to { transform: translateY(-.3rem); } }
    @keyframes drift { to { transform: translate(-1.5rem, 1.5rem); } }
    @keyframes fill { from { transform: scaleX(0); } }

    @media (prefers-reduced-motion: reduce) {
      .glow, .mark, .name, .tagline, .progress i { animation: none; }
      :host(.leaving) .brand { transform: none; }
    }
  `,
})
export class SplashScreenComponent implements OnInit {
  readonly duration = input(2000);
  /** Once it has faded out: the host can remove it. */
  readonly done = output<void>();
  readonly leaving = signal(false);

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  ngOnInit(): void {
    this.timer = setTimeout(() => this.leave(), this.duration());
  }

  leave(): void {
    if (this.leaving()) return;
    this.leaving.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.done.emit(), SPLASH_EXIT_MS);
  }
}
