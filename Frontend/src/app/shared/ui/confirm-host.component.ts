import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmService } from './confirm.service';
import { ModalDialogComponent } from './modal-dialog.component';

/** Renders the pending `ConfirmService` question; mounted once in the root component. */
@Component({
  selector: 'app-confirm-host',
  standalone: true,
  imports: [ModalDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.request(); as request) {
      <app-modal-dialog [heading]="request.heading" [tone]="request.tone ?? 'default'" [open]="true" (closed)="confirm.settle(false)">
        <p class="message">{{ request.message }}</p>
        <div class="dialog-actions">
          <button class="cancel" type="button" (click)="confirm.settle(false)">Annuler</button>
          <button class="confirm" type="button" [class.danger]="request.tone === 'danger'" (click)="confirm.settle(true)">
            {{ request.confirmLabel ?? 'Confirmer' }}
          </button>
        </div>
      </app-modal-dialog>
    }
  `,
  styles: `
    .message { margin: 0; color: var(--color-text-muted); font-size: .85rem; line-height: 1.45; }
    button { min-height: 2.75rem; border: 0; border-radius: .7rem; cursor: pointer; font: inherit; font-size: .85rem; font-weight: 700; }
    .cancel { background: #eef1f6; color: var(--color-text); }
    .confirm { background: var(--color-primary); color: white; }
    .confirm.danger { background: var(--color-danger); }
  `,
})
export class ConfirmHostComponent {
  readonly confirm = inject(ConfirmService);
}
