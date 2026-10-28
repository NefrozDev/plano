import { computed, signal } from '@angular/core';

/** Pointer travel (px) under which a press still counts as a tap. */
const TAP_TOLERANCE = 6;
/** Left swipe (px) past which releasing the row asks to delete it. */
const DELETE_THRESHOLD = -32;
/** Furthest the row slides, uncovering the delete button. */
const MAX_OFFSET = -58;

/**
 * Swipe left to uncover a delete button; released far enough, it asks to delete.
 * Shared by list rows (entries, section headers): the owner wires its pointer
 * events here and slides itself by `offset()`.
 */
export class SwipeToDelete {
  private readonly gesture = signal<{ startX: number; currentX: number } | null>(null);
  /** A swipe ends with a click on the row; that click must not trigger the row's tap action. */
  private suppressNextClick = false;

  readonly offset = computed(() => {
    const gesture = this.gesture();
    return gesture ? Math.max(MAX_OFFSET, Math.min(0, gesture.currentX - gesture.startX)) : 0;
  });

  constructor(private readonly onDelete: () => void) {}

  start(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.gesture.set({ startX: event.clientX, currentX: event.clientX });
  }

  move(event: PointerEvent): void {
    const gesture = this.gesture();
    if (!gesture) return;
    if (Math.abs(event.clientX - gesture.startX) > TAP_TOLERANCE) event.preventDefault();
    this.gesture.set({ ...gesture, currentX: event.clientX });
  }

  finish(): void {
    const gesture = this.gesture();
    if (!gesture) return;
    this.gesture.set(null);
    const distance = gesture.currentX - gesture.startX;
    if (Math.abs(distance) > TAP_TOLERANCE) this.suppressNextClick = true;
    if (distance < DELETE_THRESHOLD) this.onDelete();
  }

  /** True, once, for the click that ends a swipe: it is cancelled and the caller ignores it. */
  swallowClick(event: MouseEvent): boolean {
    if (!this.suppressNextClick) return false;
    this.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
}
