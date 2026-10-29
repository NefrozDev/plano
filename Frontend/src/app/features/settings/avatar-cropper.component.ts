import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { CropArea } from '../../core/users/resize-avatar';

/** Side of the round preview, in CSS pixels: it fits the dialog on a 320 px phone. */
export const CROP_VIEWPORT = 240;
export const MAX_ZOOM = 4;
/** Arrow keys move the picture by this many CSS pixels. */
const KEY_STEP = 12;
const KEY_ZOOM = 1.1;

interface Point {
  x: number;
  y: number;
}

let nextId = 0;

/**
 * Round preview of the picked picture: drag (or arrow keys) to move it, wheel,
 * pinch, slider or +/- to zoom. Zoom 1 fits the picture's short side to the
 * circle, so the crop never shows anything outside the picture.
 */
@Component({
  selector: 'app-avatar-cropper',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar-cropper.component.html',
  styleUrl: './avatar-cropper.component.scss',
})
export class AvatarCropperComponent {
  /** Object URL of the picked file. */
  readonly src = input.required<string>();
  readonly confirmed = output<CropArea>();
  readonly cancelled = output<void>();
  /** The browser cannot decode the file. */
  readonly failed = output<void>();

  readonly viewport = CROP_VIEWPORT;
  readonly maxZoom = MAX_ZOOM;
  readonly hintId = `avatar-cropper-hint-${nextId++}`;

  private readonly natural = signal<{ width: number; height: number } | null>(null);
  readonly zoom = signal(1);
  /** Centre of the circle, in source pixels. */
  private readonly center = signal<Point>({ x: 0, y: 0 });
  private readonly pointers = new Map<number, Point>();

  readonly loaded = computed(() => this.natural() !== null);
  /** CSS pixels per source pixel. */
  private readonly scale = computed(() => {
    const natural = this.natural();
    return natural ? (CROP_VIEWPORT / Math.min(natural.width, natural.height)) * this.zoom() : 1;
  });
  readonly area = computed<CropArea | null>(() => {
    if (!this.natural()) return null;
    const size = CROP_VIEWPORT / this.scale();
    const { x, y } = this.center();
    return { x: x - size / 2, y: y - size / 2, size };
  });
  readonly imageBox = computed(() => {
    const natural = this.natural();
    const area = this.area();
    if (!natural || !area) return null;
    const scale = this.scale();
    return {
      width: natural.width * scale,
      height: natural.height * scale,
      left: -area.x * scale,
      top: -area.y * scale,
    };
  });

  onLoad(image: HTMLImageElement): void {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) {
      this.failed.emit();
      return;
    }
    this.natural.set({ width, height });
    this.zoom.set(1);
    this.center.set({ x: width / 2, y: height / 2 });
  }

  setZoom(zoom: number): void {
    if (!this.natural() || Number.isNaN(zoom)) return;
    this.zoom.set(Math.min(Math.max(zoom, 1), MAX_ZOOM));
    // Zooming out can leave the circle past an edge: pull it back.
    this.moveCenter(this.center());
  }

  /** Moves the picture by a drag of (dx, dy) CSS pixels. */
  pan(dx: number, dy: number): void {
    const scale = this.scale();
    const { x, y } = this.center();
    this.moveCenter({ x: x - dx / scale, y: y - dy / scale });
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.loaded()) return;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 1) {
      this.pan(current.x - previous.x, current.y - previous.y);
    } else {
      // Pinch: zoom by how much the distance to the other finger changed.
      const other = [...this.pointers].find(([id]) => id !== event.pointerId)?.[1];
      const before = other ? distance(previous, other) : 0;
      if (other && before > 0) this.setZoom((this.zoom() * distance(current, other)) / before);
    }
    this.pointers.set(event.pointerId, current);
  }

  onPointerEnd(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
  }

  onWheel(event: WheelEvent): void {
    if (!this.loaded()) return;
    event.preventDefault();
    this.setZoom(this.zoom() * Math.exp(-event.deltaY / 500));
  }

  onKeydown(event: KeyboardEvent): void {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[event.key];
    if (move) this.pan(...move);
    else if (event.key === '+' || event.key === '=') this.setZoom(this.zoom() * KEY_ZOOM);
    else if (event.key === '-') this.setZoom(this.zoom() / KEY_ZOOM);
    else return;
    event.preventDefault();
  }

  confirm(): void {
    const area = this.area();
    if (area) this.confirmed.emit(area);
  }

  /** Keeps the whole circle on the picture. */
  private moveCenter({ x, y }: Point): void {
    const natural = this.natural();
    if (!natural) return;
    const half = CROP_VIEWPORT / this.scale() / 2;
    this.center.set({
      x: Math.min(Math.max(x, half), natural.width - half),
      y: Math.min(Math.max(y, half), natural.height - half),
    });
  }
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
