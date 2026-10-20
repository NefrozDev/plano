import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
} from '@angular/core';

/**
 * Transient notification (success, or an error with `tone="error"`). The parent owns the message and clears it
 * when `dismissed` fires, either after `duration` ms or when the toast is clicked.
 * The live region stays in the DOM so screen readers announce new messages.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="status" [attr.aria-live]="tone() === 'error' ? 'assertive' : 'polite'">
      @if (message()) {
        <!-- The whole toast is the dismiss target: click/tap (or Enter) closes it. -->
        <button class="toast" type="button" title="Toucher pour fermer" (click)="dismissed.emit()">
          <span class="check" [class.error]="tone() === 'error'" aria-hidden="true">
            @if (tone() === 'error') {
              <svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01" /></svg>
            } @else {
              <svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9" /></svg>
            }
          </span>
          <span class="text">{{ message() }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host { position: absolute; right: 0; bottom: calc(1rem + env(safe-area-inset-bottom)); left: 0; display: flex; justify-content: center; pointer-events: none; }
    .toast { display: flex; max-width: 100%; gap: .65rem; align-items: center; padding: .6rem .9rem .6rem .75rem; border: 0; border-radius: .95rem; background: #1f2a44; box-shadow: 0 .75rem 1.75rem rgb(15 23 42 / 28%); color: #fff; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 600; text-align: left; pointer-events: auto; animation: toast-in 200ms ease-out; }
    .toast:hover { background: #26334f; }
    .check { display: grid; width: 1.5rem; height: 1.5rem; flex: none; place-items: center; border-radius: 50%; background: #2fbf7a; }
    .check.error { background: #e5484d; }
    .text { min-width: 0; }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.4; }
    .check svg { width: .9rem; height: .9rem; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(.75rem); } }
  `,
})
export class ToastComponent {
  readonly message = input('');
  readonly duration = input(3500);
  readonly tone = input<'success' | 'error'>('success');
  readonly dismissed = output<void>();

  constructor() {
    // Re-runs for every new message, so the countdown restarts each time.
    effect((onCleanup) => {
      if (!this.message()) return;
      const timer = setTimeout(() => this.dismissed.emit(), this.duration());
      onCleanup(() => clearTimeout(timer));
    });
  }
}
