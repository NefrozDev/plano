import { signal } from '@angular/core';

/**
 * Reordering by grip: the dragged item takes the place of the one under the
 * pointer as it moves, and the order is saved once, on release. Arrow keys on
 * the grip do the same, past the neighbour on screen.
 */
export class DragReorder {
  readonly dragged = signal<string | null>(null);
  private moved = false;

  constructor(
    private readonly document: Document,
    /** Finds the item under the pointer, from the element there. */
    private readonly itemIdAt: (element: Element | null) => string | undefined,
    private readonly move: (id: string, targetId: string) => void,
    private readonly save: () => void,
  ) {}

  start(id: string, event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragged.set(id);
    this.moved = false;
  }

  over(event: PointerEvent): void {
    const id = this.dragged();
    if (!id) return;
    event.preventDefault();
    const targetId = this.itemIdAt(this.document.elementFromPoint(event.clientX, event.clientY));
    if (targetId && targetId !== id) {
      this.move(id, targetId);
      this.moved = true;
    }
  }

  end(): void {
    if (this.dragged() && this.moved) this.save();
    this.dragged.set(null);
    this.moved = false;
  }

  /** `visibleIds`: the items in the order they show. */
  keydown(id: string, event: KeyboardEvent, visibleIds: readonly string[]): void {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const targetId = visibleIds[visibleIds.indexOf(id) + step];
    if (targetId) {
      this.move(id, targetId);
      this.save();
    }
  }
}
