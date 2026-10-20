import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * Modal built on the native <dialog>: showModal() provides the focus trap,
 * Escape handling and an inert background for free.
 *
 * The parent owns the state through `open`; every way of closing (Escape,
 * backdrop click, `open` becoming false) emits `closed` once the dialog shuts.
 * Projected content: an optional `[dialog-icon]` svg, the body, and a
 * `.dialog-actions` row for buttons.
 */
@Component({
  selector: 'app-modal-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Backdrop clicks are a pointer shortcut: keyboard users close the dialog with Escape. -->
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
    <dialog
      #dialog
      [attr.aria-labelledby]="headingId"
      (close)="closed.emit()"
      (click)="closeOnBackdrop($event)"
    >
      <div class="panel">
        <header>
          <span class="icon" [class.danger]="tone() === 'danger'" aria-hidden="true">
            <ng-content select="[dialog-icon]" />
          </span>
          <h2 [id]="headingId">{{ heading() }}</h2>
        </header>
        <ng-content />
      </div>
    </dialog>
  `,
  styles: `
    dialog { width: min(calc(100% - 2rem), 23rem); max-width: none; padding: 0; border: 0; border-radius: 1.25rem; background: #fff; box-shadow: var(--shadow-card); color: var(--color-text); }
    dialog[open] { animation: dialog-in 160ms ease-out; }
    dialog::backdrop { background: rgb(24 32 48 / 35%); backdrop-filter: blur(2px); }
    .panel { padding: 1.25rem; }
    header { display: flex; gap: .75rem; align-items: center; margin-bottom: .8rem; }
    h2 { margin: 0; font-size: 1.05rem; letter-spacing: -.02em; }
    .icon { display: grid; width: 2.5rem; height: 2.5rem; flex: none; place-items: center; border-radius: .75rem; background: #e6efff; color: var(--color-primary); }
    .icon.danger { background: var(--color-danger-surface); color: var(--color-danger); }
    .icon:empty { display: none; }
    :host ::ng-deep .icon svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.2; }
    :host ::ng-deep .dialog-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; margin-top: 1rem; }
    @keyframes dialog-in { from { opacity: 0; transform: translateY(.75rem) scale(.98); } }
  `,
})
export class ModalDialogComponent {
  readonly heading = input.required<string>();
  readonly open = input(false);
  readonly tone = input<'default' | 'danger'>('default');
  readonly closed = output<void>();

  readonly headingId = `modal-dialog-title-${nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // A modal removed from the DOM while open (e.g. its content disappeared) must
    // leave the top layer cleanly, otherwise later dialogs can misbehave.
    inject(DestroyRef).onDestroy(() => {
      const dialog = this.dialog().nativeElement;
      if (dialog.open) dialog.close();
    });
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) dialog.showModal();
      if (!this.open() && dialog.open) dialog.close();
    });
  }

  /** The panel fills the dialog, so a click whose target is the dialog itself hit the backdrop. */
  closeOnBackdrop(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    if (event.target === dialog) dialog.close();
  }
}
