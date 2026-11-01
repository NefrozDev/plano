import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { SwipeToDelete } from '../../../shared/ui/swipe-to-delete';
import { ObjectivesStore } from '../objectives.store';
import { ObjectiveCardComponent, ObjectiveCardView } from './objective-card.component';

export const NOT_OWNER_NOTICE = 'Seule la personne qui a créé cet objectif peut le supprimer.';

/**
 * An objective's card that swipes left to delete, like list cards: its owner gets
 * the confirmation, anyone else's card stays put and `refused` says why.
 */
@Component({
  selector: 'app-objective-swipe-card',
  imports: [ObjectiveCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.revealed]': 'offset() < 0',
    '[class.tile]': 'tile()',
    '(keydown.delete)': 'deletable() && askToDelete()',
  },
  template: `
    @if (deletable()) {
      <button class="delete" type="button" [attr.aria-label]="'Supprimer l’objectif ' + card().objective.title" (click)="askToDelete()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
      </button>
    }
    <!-- A link drags natively, which would cancel a mouse swipe. -->
    <div
      class="slide"
      [style.transform]="offset() ? 'translateX(' + offset() + 'px)' : null"
      (pointerdown)="swipe.start($event)"
      (pointermove)="swipe.move($event)"
      (pointerup)="swipe.finish()"
      (pointercancel)="swipe.finish()"
      (wheel)="swipe.wheel($event)"
      (dragstart)="$event.preventDefault()"
    >
      <app-objective-card [card]="card()" [tile]="tile()" />
    </div>
  `,
  styles: `
    /* Isolated so the slide's z-index does not cover a grip laid over the tile. */
    :host { position: relative; display: block; min-width: 0; isolation: isolate; }
    .slide { position: relative; z-index: 1; touch-action: pan-y; transition: transform 180ms ease; user-select: none; }
    .delete { position: absolute; top: 0; right: 0; bottom: 0; display: grid; width: 4.5rem; place-items: center; border: 0; border-radius: .9rem; background: #d92d20; color: white; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 100ms ease; }
    :host(.revealed) .delete { opacity: 1; pointer-events: auto; }
    :host(.tile) .delete { top: auto; width: 100%; height: 3rem; }
    svg { width: 1.35rem; height: 1.35rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
  `,
})
export class ObjectiveSwipeCardComponent {
  private readonly confirm = inject(ConfirmService);
  private readonly store = inject(ObjectivesStore);

  readonly card = input.required<ObjectiveCardView>();
  readonly tile = input(false);
  readonly refused = output<string>();

  readonly deletable = computed(() => this.card().objective.role === 'owner');
  readonly swipe = new SwipeToDelete(() => {
    if (this.deletable()) void this.askToDelete();
    else this.refused.emit(NOT_OWNER_NOTICE);
  });
  readonly offset = computed(() => (this.deletable() ? this.swipe.offset() : 0));

  constructor() {
    // RouterLink listens on the link itself: the click ending a swipe must be stopped on its way down.
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.addEventListener(
      'click',
      (event) => this.swipe.swallowClick(event),
      { capture: true },
    );
  }

  /** Summaries do not count everything below, and archived sub-objectives go too. */
  async askToDelete(): Promise<void> {
    const { id, title, sharing } = this.card().objective;
    const confirmed = await this.confirm.ask({
      heading: 'Supprimer l’objectif ?',
      message: `« ${title} » et tout ce qu’il contient seront supprimés définitivement${sharing === 'private' ? '' : ', pour tout le monde'}.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (confirmed) await this.store.remove(id);
  }
}
