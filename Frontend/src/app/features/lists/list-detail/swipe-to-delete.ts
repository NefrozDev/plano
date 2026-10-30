import { computed, signal } from '@angular/core';

/** Pointer travel (px) under which a press still counts as a tap. */
const TAP_TOLERANCE = 6;
/** Left swipe (px) past which releasing the row asks to delete it. */
const DELETE_THRESHOLD = -32;
/** Furthest the row slides, uncovering the delete button. */
const MAX_OFFSET = -58;
/** A touchpad swipe is a burst of wheel events: this long without one ends it. */
export const WHEEL_SWIPE_END_MS = 160;

/**
 * Swipe left to uncover a delete button; released far enough, it asks to delete.
 * Shared by list rows (entries, section headers, list cards): the owner wires
 * its pointer events (finger, pen, mouse drag) and wheel events (two-finger
 * touchpad swipe) here and slides itself by `offset()`.
 */
export class SwipeToDelete {
  private readonly gesture = signal<{ startX: number; currentX: number } | null>(null);
  /** Captured only once the press turns into a swipe (see move()). */
  private pressed: { element: HTMLElement; pointerId: number } | null = null;
  /** A swipe ends with a click on the row; that click must not trigger the row's tap action. */
  private suppressNextClick = false;
  private wheelEnd: ReturnType<typeof setTimeout> | null = null;

  readonly offset = computed(() => {
    const gesture = this.gesture();
    return gesture ? Math.max(MAX_OFFSET, Math.min(0, gesture.currentX - gesture.startX)) : 0;
  });

  constructor(private readonly onDelete: () => void) {}

  start(event: PointerEvent): void {
    this.pressed = { element: event.currentTarget as HTMLElement, pointerId: event.pointerId };
    this.gesture.set({ startX: event.clientX, currentX: event.clientX });
  }

  /**
   * Capturing at once would retarget a plain tap's click to the row itself,
   * hiding which button inside it was tapped: capture once it is a swipe.
   */
  move(event: PointerEvent): void {
    const gesture = this.gesture();
    if (!gesture) return;
    if (Math.abs(event.clientX - gesture.startX) > TAP_TOLERANCE) {
      event.preventDefault();
      if (this.pressed) {
        this.pressed.element.setPointerCapture(this.pressed.pointerId);
        this.pressed = null;
      }
    }
    this.gesture.set({ ...gesture, currentX: event.clientX });
  }

  finish(): void {
    this.end(true);
  }

  /**
   * A two-finger touchpad swipe: horizontal wheel events, with the content
   * moving opposite to the fingers. Vertical ones are left to scroll the page;
   * horizontal ones are kept from the browser, which would go back or forward.
   */
  wheel(event: WheelEvent): void {
    if (this.pressed || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    const gesture = this.gesture() ?? { startX: 0, currentX: 0 };
    this.gesture.set({ ...gesture, currentX: gesture.currentX - event.deltaX });
    if (this.wheelEnd) clearTimeout(this.wheelEnd);
    this.wheelEnd = setTimeout(() => {
      this.wheelEnd = null;
      // No click follows a touchpad swipe: nothing to swallow.
      this.end(false);
    }, WHEEL_SWIPE_END_MS);
  }

  private end(clickFollows: boolean): void {
    const gesture = this.gesture();
    if (!gesture) return;
    this.pressed = null;
    this.gesture.set(null);
    const distance = gesture.currentX - gesture.startX;
    if (clickFollows && Math.abs(distance) > TAP_TOLERANCE) this.suppressNextClick = true;
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
