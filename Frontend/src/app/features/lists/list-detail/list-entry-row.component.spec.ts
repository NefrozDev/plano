import { ComponentFixture, TestBed } from '@angular/core/testing';
import { entry as listEntry } from '../testing/lists-fixtures';
import { ListEntryRowComponent } from './list-entry-row.component';
import { WHEEL_SWIPE_END_MS } from './swipe-to-delete';

describe('ListEntryRowComponent', () => {
  let fixture: ComponentFixture<ListEntryRowComponent>;
  let row: ListEntryRowComponent;
  let emitted: string[];
  const entry = listEntry('milk', 'Lait');

  /** Minimal PointerEvent: only what the handlers read. */
  function pointer(clientX = 0, target: HTMLElement = document.createElement('div')): PointerEvent {
    return {
      clientX,
      pointerId: 1,
      target,
      currentTarget: { setPointerCapture: vi.fn().mockName('setPointerCapture') },
      preventDefault: vi.fn().mockName('preventDefault'),
      stopPropagation: vi.fn().mockName('stopPropagation'),
    } as unknown as PointerEvent;
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(ListEntryRowComponent);
    fixture.componentRef.setInput('entry', entry);
    fixture.componentRef.setInput('sectionId', 'fresh');
    row = fixture.componentInstance;
    emitted = [];
    row.toggled.subscribe(() => emitted.push('toggle'));
    row.open.subscribe(() => emitted.push('open'));
    row.remove.subscribe(() => emitted.push('remove'));
    row.dragStart.subscribe(() => emitted.push('dragStart'));
    fixture.detectChanges();
  });

  it('exposes its ids for the parent drag hit-test and emits toggle and open', () => {
    const element = fixture.nativeElement as HTMLElement;
    const entryElement = element.querySelector('.entry') as HTMLElement;
    expect(entryElement.dataset['sectionId']).toBe('fresh');
    expect(entryElement.dataset['entryId']).toBe('milk');

    (element.querySelector('.entry-toggle') as HTMLButtonElement).click();
    entryElement.click();

    expect(emitted).toEqual(['toggle', 'open']);
  });

  it('slides with a left swipe, clamped, and deletes past the threshold', () => {
    const start = pointer(200);
    row.startSwipe(start);
    const capture = (start.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> })
      .setPointerCapture;
    // A press alone is still a tap: no capture, so its click keeps its target.
    expect(capture).not.toHaveBeenCalled();
    row.moveSwipe(pointer(190));
    expect(row.offset()).toBe(-10);
    // Now a swipe: capturing keeps the gesture alive when the finger leaves the row, once.
    expect(capture).toHaveBeenCalledExactlyOnceWith(1);
    row.moveSwipe(pointer(50));
    expect(row.offset()).toBe(-58);
    expect(capture).toHaveBeenCalledTimes(1);

    row.finishSwipe();

    expect(row.offset()).toBe(0);
    expect(emitted).toEqual(['remove']);
  });

  it('deletes after a touchpad swipe left, unless read-only', async () => {
    const wheel = new WheelEvent('wheel', { deltaX: 50, cancelable: true });
    row.wheelSwipe(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(row.offset()).toBe(-50);

    await new Promise((resolve) => setTimeout(resolve, WHEEL_SWIPE_END_MS + 50));

    expect(row.offset()).toBe(0);
    expect(emitted).toEqual(['remove']);
    fixture.componentRef.setInput('readonly', true);
    row.wheelSwipe(new WheelEvent('wheel', { deltaX: 80, cancelable: true }));
    expect(row.offset()).toBe(0);
  });

  it('cancels a short swipe but swallows the click that follows it', () => {
    row.startSwipe(pointer(200));
    row.moveSwipe(pointer(180));
    row.finishSwipe();

    const click = new MouseEvent('click', { cancelable: true });
    row.handleClick(click);
    expect(click.defaultPrevented).toBe(true);
    expect(emitted).toEqual([]);

    row.handleClick(new MouseEvent('click'));
    expect(emitted).toEqual(['open']);
  });

  it('ignores swipes starting on the handle or the toggle', () => {
    for (const className of ['drag-handle', 'entry-toggle']) {
      const origin = document.createElement('button');
      origin.className = className;
      const start = pointer(100, origin);
      row.startSwipe(start);
      row.moveSwipe(pointer(10));
      row.finishSwipe();

      expect(row.offset()).toBe(0);
      expect(
        (start.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> })
          .setPointerCapture,
      ).not.toHaveBeenCalled();
    }
    expect(emitted).toEqual([]);
  });

  it('lets viewers open the entry but not toggle, swipe, delete or drag it', () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect((element.querySelector('.entry-toggle') as HTMLButtonElement).disabled).toBe(true);
    expect(element.querySelector('.drag-handle')).toBeNull();
    expect(element.querySelector('.delete-entry')).toBeNull();
    row.startSwipe(pointer(200));
    row.moveSwipe(pointer(50));
    row.finishSwipe();
    (element.querySelector('.entry-name') as HTMLButtonElement).click();

    expect(emitted).toEqual(['open']);
  });

  it('starts a drag from the handle without starting a swipe', () => {
    const event = pointer(100);
    row.startDrag(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual(['dragStart']);
    expect(row.offset()).toBe(0);
  });
});
