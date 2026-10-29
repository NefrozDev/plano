import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CropArea } from '../../core/users/resize-avatar';
import { AvatarCropperComponent, CROP_VIEWPORT, MAX_ZOOM } from './avatar-cropper.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarCropperComponent],
  template: `
    <app-avatar-cropper
      [src]="src()"
      (confirmed)="confirmed.push($event)"
      (cancelled)="cancelled = cancelled + 1"
      (failed)="failed = failed + 1"
    />
  `,
})
class HostComponent {
  readonly src = signal('');
  readonly confirmed: CropArea[] = [];
  cancelled = 0;
  failed = 0;
}

/** Object URL of a real PNG, so the cropper decodes it like a picked photo. */
async function pictureUrl(width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  (canvas.getContext('2d') as CanvasRenderingContext2D).fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((png) => resolve(png as Blob), 'image/png'));
  return URL.createObjectURL(blob);
}

describe('AvatarCropperComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let cropper: AvatarCropperComponent;
  let element: HTMLElement;
  let url: string;

  const viewport = () => element.querySelector('.viewport') as HTMLElement;
  const image = () => element.querySelector('img') as HTMLImageElement;
  const zoomInput = () => element.querySelector('input[type="range"]') as HTMLInputElement;
  const saveButton = () => element.querySelector('.primary-button') as HTMLButtonElement;
  const pointer = (type: string, pointerId: number, clientX: number, clientY: number) =>
    viewport().dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY, bubbles: true }));

  /** Renders `src` and waits until the picture is decoded or rejected. */
  async function load(src: string): Promise<void> {
    render(src);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(cropper.loaded() || host.failed > 0).toBe(true);
    });
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    url = await pictureUrl(400, 200);
  });

  afterEach(() => URL.revokeObjectURL(url));

  /** First render with a source: an empty one would make the image fail at once. */
  function render(src: string): void {
    host.src.set(src);
    fixture.detectChanges();
    cropper = fixture.debugElement.children[0].componentInstance as AvatarCropperComponent;
  }

  describe('with a decoded picture', () => {
    beforeEach(async () => {
      await load(url);
    });

    it('fits the short side to the circle and offers its centred square', () => {
      expect(viewport().style.width).toBe(`${CROP_VIEWPORT}px`);
      expect(image().classList).toContain('ready');
      // 400×200 at 240/200 = 1.2 CSS px per source px, centred.
      expect(image().style.width).toBe('480px');
      expect(image().style.height).toBe('240px');
      expect(image().style.left).toBe('-120px');
      expect(image().style.top).toBe('0px');
      expect(zoomInput().disabled).toBe(false);

      saveButton().click();

      expect(host.confirmed).toEqual([{ x: 100, y: 0, size: 200 }]);
      expect(host.cancelled).toBe(0);
    });

    it('moves the picture with a drag and never past its edges', () => {
      const capture = vi.fn();
      viewport().setPointerCapture = capture;

      pointer('pointerdown', 1, 100, 100);
      pointer('pointermove', 1, 160, 100);
      fixture.detectChanges();
      expect(capture).toHaveBeenCalledExactlyOnceWith(1);
      // 60 CSS px right = 50 source px: the area shows more of the left.
      expect(cropper.area()).toEqual({ x: 50, y: 0, size: 200 });
      expect(image().style.left).toBe('-60px');

      // Far right and down: stops at the left edge, and height leaves no room to move.
      pointer('pointermove', 1, 1000, 400);
      expect(cropper.area()).toEqual({ x: 0, y: 0, size: 200 });

      // After release, moving the mouse no longer drags.
      pointer('pointerup', 1, 1000, 400);
      pointer('pointermove', 1, 0, 0);
      expect(cropper.area()).toEqual({ x: 0, y: 0, size: 200 });
    });

    it('zooms with the slider, between 1 and the maximum, around the centre', () => {
      zoomInput().value = '2';
      zoomInput().dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(cropper.zoom()).toBe(2);
      expect(cropper.area()).toEqual({ x: 150, y: 50, size: 100 });
      expect(image().style.width).toBe('960px');

      cropper.setZoom(MAX_ZOOM + 3);
      expect(cropper.zoom()).toBe(MAX_ZOOM);
      cropper.setZoom(0.2);
      expect(cropper.zoom()).toBe(1);
      cropper.setZoom(Number.NaN);
      expect(cropper.zoom()).toBe(1);
    });

    it('pulls the area back inside the picture when zooming out from an edge', () => {
      cropper.setZoom(2);
      cropper.pan(1000, 1000);
      expect(cropper.area()).toEqual({ x: 0, y: 0, size: 100 });

      cropper.setZoom(1);

      expect(cropper.area()).toEqual({ x: 0, y: 0, size: 200 });
    });

    it('zooms with the wheel and keeps the page from scrolling', () => {
      const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });

      viewport().dispatchEvent(wheel);

      expect(wheel.defaultPrevented).toBe(true);
      expect(cropper.zoom()).toBeCloseTo(Math.exp(0.2));
    });

    it('zooms with a two-finger pinch', () => {
      viewport().setPointerCapture = vi.fn();
      pointer('pointerdown', 1, 100, 100);
      pointer('pointerdown', 2, 140, 100);

      // The fingers move twice as far apart.
      pointer('pointermove', 2, 180, 100);

      expect(cropper.zoom()).toBeCloseTo(2);
    });

    it('moves with the arrow keys and zooms with + and -', () => {
      const key = (name: string) => {
        const event = new KeyboardEvent('keydown', { key: name, cancelable: true, bubbles: true });
        viewport().dispatchEvent(event);
        return event.defaultPrevented;
      };

      expect(key('ArrowRight')).toBe(true);
      // 12 CSS px = 10 source px.
      expect(cropper.area()).toEqual({ x: 90, y: 0, size: 200 });
      expect(key('+')).toBe(true);
      expect(cropper.zoom()).toBeCloseTo(1.1);
      expect(key('-')).toBe(true);
      expect(cropper.zoom()).toBeCloseTo(1);
      // Other keys (e.g. Tab) keep their meaning.
      expect(key('Tab')).toBe(false);
    });

    it('cancels without confirming an area', () => {
      (element.querySelector('button.secondary') as HTMLButtonElement).click();

      expect(host.cancelled).toBe(1);
      expect(host.confirmed).toEqual([]);
    });
  });

  it('cannot be confirmed, moved or zoomed before the picture is decoded', () => {
    render(url);

    expect(saveButton().disabled).toBe(true);
    expect(zoomInput().disabled).toBe(true);
    cropper.setZoom(2);
    cropper.confirm();
    expect(cropper.zoom()).toBe(1);
    expect(host.confirmed).toEqual([]);
  });

  it('reports a file the browser cannot decode', async () => {
    const text = URL.createObjectURL(new Blob(['not an image'], { type: 'text/plain' }));

    await load(text);
    URL.revokeObjectURL(text);

    expect(host.failed).toBe(1);
    expect(cropper.loaded()).toBe(false);
    expect(saveButton().disabled).toBe(true);
  });
});
