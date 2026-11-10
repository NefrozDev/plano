import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ObjectiveDetail } from '@plano/common';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { ModalDialogComponent } from '../../../shared/ui/modal-dialog.component';
import { ObjectiveRemovalService } from '../objective-removal.service';
import { ObjectivesStore } from '../objectives.store';

const CONFETTI_COLORS = ['#325BE2', '#6B2DEB', '#32E2A5', '#DF32E2', '#f4a51c'];

/**
 * Pops up when the open objective becomes complete. Its owner chooses what
 * happens next: start again (top-level only), archive or delete it.
 */
@Component({
  selector: 'app-objective-celebration',
  imports: [AutofocusDirective, ModalDialogComponent, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.celebration(); as objective) {
      <app-modal-dialog [heading]="'objectives.celebration.heading' | transloco" [open]="true" (closed)="store.dismissCelebration()">
        <svg dialog-icon viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4" /></svg>
        <div class="confetti" aria-hidden="true">
          @for (piece of confetti; track $index) {
            <i [style.left.%]="piece.left" [style.--delay]="piece.delay" [style.--drift]="piece.drift" [style.background]="piece.color"></i>
          }
        </div>
        <p class="message">{{ 'objectives.celebration.message' | transloco: { title: objective.title } }}</p>
        @if (isOwner()) {
          <div class="choices" role="group" [attr.aria-label]="'objectives.celebration.next' | transloco">
            @if (!objective.parentId) {
              <button class="choice" type="button" (click)="restart(objective)">
                <strong>{{ 'objectives.celebration.restart' | transloco }}</strong><small>{{ 'objectives.celebration.restartHint' | transloco }}</small>
              </button>
            }
            <button class="choice" type="button" (click)="archive(objective)">
              <strong>{{ 'objectives.detail.archive' | transloco }}</strong><small>{{ 'objectives.celebration.archiveHint' | transloco }}</small>
            </button>
            <button class="choice danger" type="button" (click)="remove(objective)">
              <strong>{{ 'objectives.removal.delete' | transloco }}</strong><small>{{ 'objectives.celebration.deleteHint' | transloco }}</small>
            </button>
          </div>
          <!-- The safe choice has the focus: nothing is lost by pressing Enter. -->
          <button class="later" type="button" appAutofocus (click)="store.dismissCelebration()">{{ 'objectives.celebration.keep' | transloco }}</button>
        } @else {
          <button class="later solid" type="button" appAutofocus (click)="store.dismissCelebration()">{{ 'objectives.celebration.bravo' | transloco }}</button>
        }
      </app-modal-dialog>
    }
  `,
  styles: `
    .message { margin: 0 0 .9rem; color: var(--color-text); font-size: .9rem; font-weight: 650; line-height: 1.4; }
    .choices { display: grid; gap: .45rem; }
    .choice { display: grid; gap: .15rem; padding: .7rem .8rem; border: 1px solid #dce5f5; border-radius: .8rem; background: #f8faff; color: var(--color-text); cursor: pointer; font: inherit; text-align: left; }
    .choice strong { font-size: .86rem; }
    .choice small { color: var(--color-text-muted); font-size: .74rem; line-height: 1.35; }
    .choice.danger strong { color: var(--color-danger); }
    .later { width: 100%; min-height: 2.6rem; margin-top: .7rem; border: 0; border-radius: .78rem; background: #eef1f6; color: var(--color-text); cursor: pointer; font: inherit; font-size: .85rem; font-weight: 700; }
    .later.solid { background: var(--color-primary); color: white; }
    .confetti { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
    .confetti i { position: absolute; top: -1rem; width: .45rem; height: .75rem; border-radius: .1rem; opacity: 0; animation: fall 1.8s var(--delay) ease-in forwards; }
    @keyframes fall {
      10% { opacity: 1; }
      to { opacity: 0; transform: translate(var(--drift), 22rem) rotate(540deg); }
    }
    @media (prefers-reduced-motion: reduce) { .confetti { display: none; } }
  `,
  host: { '[style.display]': '"contents"' },
})
export class ObjectiveCelebrationComponent {
  readonly store = inject(ObjectivesStore);
  private readonly removal = inject(ObjectiveRemovalService);
  private readonly router = inject(Router);

  readonly isOwner = computed(() => this.store.celebration()?.role === 'owner');
  /** Spread by index rather than at random, so every celebration looks the same. */
  readonly confetti = Array.from({ length: 28 }, (_, index) => ({
    left: (index * 37) % 100,
    delay: `${(index % 7) * 0.12}s`,
    drift: `${((index * 53) % 9) - 4}rem`,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  }));

  async restart(objective: ObjectiveDetail): Promise<void> {
    this.store.dismissCelebration();
    await this.store.restart(objective.id);
  }

  async archive(objective: ObjectiveDetail): Promise<void> {
    this.store.dismissCelebration();
    await this.store.update(objective.id, { archived: true });
  }

  /** Off to its parent, or the overview, once deleted. */
  async remove(objective: ObjectiveDetail): Promise<void> {
    this.store.dismissCelebration();
    const removed = await this.removal.remove(objective, this.removal.messageFor(objective));
    if (removed) void this.router.navigate(objective.parentId ? ['/objectives', objective.parentId] : ['/objectives']);
  }
}
