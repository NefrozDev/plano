import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ListEntry } from '@plano/common';
import { SwipeToDelete } from './swipe-to-delete';

/**
 * One list entry: tap to open, circle to toggle, swipe left to delete, and a
 * handle that starts a drag (the parent tracks the drag across rows).
 */
@Component({
  selector: 'app-list-entry-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="entry-shell" [class.revealed]="offset() < 0">
      @if (!readonly()) {
        <button
          class="delete-entry"
          type="button"
          [attr.aria-label]="'Supprimer définitivement ' + entry().name"
          (click)="remove.emit()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
        </button>
      }
      <!-- Tapping anywhere on the row is a pointer shortcut: keyboard users open the entry with its name button. -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div
        class="entry"
        [class.done]="entry().done"
        [class.highlighted]="entry().highlighted"
        [class.dragging]="dragging()"
        [attr.data-section-id]="sectionId()"
        [attr.data-entry-id]="entry().id"
        [style.transform]="'translateX(' + offset() + 'px) scale(' + (dragging() ? 0.98 : 1) + ')'"
        (click)="handleClick($event)"
        (pointerdown)="startSwipe($event)"
        (pointermove)="moveSwipe($event)"
        (pointerup)="finishSwipe()"
        (pointercancel)="finishSwipe()"
        (wheel)="wheelSwipe($event)"
      >
        <button
          class="entry-toggle"
          type="button"
          [attr.aria-label]="'Marquer ' + entry().name + (entry().done ? ' comme non terminé' : ' comme terminé')"
          [attr.aria-pressed]="entry().done"
          [disabled]="readonly()"
          (click)="$event.stopPropagation(); toggled.emit()"
        ><i aria-hidden="true"></i></button>
        <!-- Its click bubbles to the row, which opens the entry (or swallows it after a swipe). -->
        <button class="entry-name" type="button">{{ entry().name }}</button>
        @if (!readonly()) {
          <button
            class="drag-handle"
            type="button"
            [attr.aria-label]="'Déplacer ' + entry().name"
            [attr.aria-grabbed]="dragging()"
            (click)="$event.preventDefault(); $event.stopPropagation()"
            (pointerdown)="startDrag($event)"
          >⠿</button>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .entry-shell { position: relative; overflow: hidden; border-radius: .5rem; }
    .entry { position: relative; z-index: 1; display: grid; min-height: 2.6rem; grid-template-columns: 1.7rem 1fr auto; gap: .55rem; align-items: center; cursor: pointer; touch-action: pan-y; transition: transform 180ms ease; }
    .entry-shell.revealed .entry { transition: transform 120ms ease-out; }
    .delete-entry { position: absolute; top: 0; right: 0; bottom: 0; display: grid; width: 3.65rem; place-items: center; border: 0; background: #d92d20; color: white; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 100ms ease; }
    .entry-shell.revealed .delete-entry { opacity: 1; pointer-events: auto; }
    .delete-entry svg { width: 1.3rem; height: 1.3rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
    .entry-toggle { display: grid; padding: 0; place-items: center; border: 0; background: transparent; cursor: pointer; }
    .entry-toggle:disabled { cursor: default; }
    .entry-toggle i { display: grid; width: 1.55rem; height: 1.55rem; place-items: center; border: 2px solid #aab4c5; border-radius: 50%; }
    .entry.done .entry-toggle i { border-color: #3264ed; background: #3264ed; }
    .entry.done .entry-toggle i::after { width: .55rem; height: .3rem; border-bottom: 2px solid white; border-left: 2px solid white; content: ''; transform: translateY(-.1rem) rotate(-45deg); }
    .entry.highlighted .entry-toggle i { border-color: #ff9d72; }
    .entry-name { min-height: 2.6rem; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 550; text-align: left; }
    .entry.done .entry-name { color: #737b89; text-decoration: line-through; }
  `,
})
export class ListEntryRowComponent {
  readonly entry = input.required<ListEntry>();
  readonly sectionId = input.required<string>();
  readonly dragging = input(false);
  /** Viewers can open the entry but not change, delete or move it. */
  readonly readonly = input(false);

  readonly toggled = output<void>();
  readonly open = output<void>();
  readonly remove = output<void>();
  readonly dragStart = output<void>();

  private readonly swipe = new SwipeToDelete(() => this.remove.emit());
  readonly offset = this.swipe.offset;

  startSwipe(event: PointerEvent): void {
    if (this.readonly()) return;
    if ((event.target as HTMLElement).closest('.drag-handle, .entry-toggle')) return;
    this.swipe.start(event);
  }

  moveSwipe(event: PointerEvent): void {
    this.swipe.move(event);
  }

  finishSwipe(): void {
    this.swipe.finish();
  }

  wheelSwipe(event: WheelEvent): void {
    if (!this.readonly()) this.swipe.wheel(event);
  }

  /** A click ending a swipe must not open the entry. */
  handleClick(event: MouseEvent): void {
    if (this.swipe.swallowClick(event)) return;
    this.open.emit();
  }

  startDrag(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart.emit();
  }
}
