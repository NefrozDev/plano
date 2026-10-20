import { ComponentFixture, TestBed } from '@angular/core/testing';
import { entry as listEntry } from '../testing/lists-fixtures';
import { ListEntryRowComponent } from './list-entry-row.component';

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
    row.startSwipe(pointer(200));
    row.moveSwipe(pointer(190));
    expect(row.offset()).toBe(-10);
    row.moveSwipe(pointer(50));
    expect(row.offset()).toBe(-58);

    row.finishSwipe();

    expect(row.offset()).toBe(0);
    expect(emitted).toEqual(['remove']);
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
    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    row.startSwipe(pointer(100, handle));
    row.moveSwipe(pointer(10));
    row.finishSwipe();

    expect(row.offset()).toBe(0);
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

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(emitted).toEqual(['dragStart']);
  });
});
