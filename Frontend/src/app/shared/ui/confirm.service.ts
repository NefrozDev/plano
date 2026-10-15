import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  heading: string;
  message: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Promise-based replacement for `window.confirm`, rendered by `ConfirmHostComponent`
 * with the app's modal dialog: `if (!(await confirm.ask({...}))) return;`.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly current = signal<ConfirmRequest | null>(null);
  readonly request = this.current.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    // Only one question at a time: a new one cancels the pending one.
    this.settle(false);
    return new Promise((resolve) => this.current.set({ ...options, resolve }));
  }

  settle(confirmed: boolean): void {
    const request = this.current();
    if (!request) return;
    this.current.set(null);
    request.resolve(confirmed);
  }
}
