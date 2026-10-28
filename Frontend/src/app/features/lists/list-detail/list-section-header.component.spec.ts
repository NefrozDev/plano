import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListSectionHeaderComponent } from './list-section-header.component';

describe('ListSectionHeaderComponent', () => {
  let fixture: ComponentFixture<ListSectionHeaderComponent>;
  let header: ListSectionHeaderComponent;
  let element: HTMLElement;
  let emitted: string[];

  /** Minimal PointerEvent: only what the handlers read. */
  function pointer(clientX: number, target: HTMLElement = element.querySelector('.section-title')!): PointerEvent {
    return {
      clientX,
      pointerId: 1,
      target,
      currentTarget: { setPointerCapture: vi.fn().mockName('setPointerCapture') },
      preventDefault: vi.fn().mockName('preventDefault'),
    } as unknown as PointerEvent;
  }

  function render(editable: boolean): void {
    fixture = TestBed.createComponent(ListSectionHeaderComponent);
    fixture.componentRef.setInput('name', 'Frais');
    fixture.componentRef.setInput('editable', editable);
    header = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    emitted = [];
    header.renamed.subscribe((name) => emitted.push(`renamed:${name}`));
    header.collapse.subscribe(() => emitted.push('collapse'));
    header.remove.subscribe(() => emitted.push('remove'));
    fixture.detectChanges();
  }

  it('slides with a left swipe and asks to delete past the threshold', () => {
    render(true);
    const start = pointer(200);
    header.startSwipe(start);
    header.swipe.move(pointer(150));
    fixture.detectChanges();
    expect(header.swipe.offset()).toBe(-50);
    expect(element.querySelector('.header-shell')?.classList).toContain('revealed');

    header.swipe.finish();

    expect(emitted).toEqual(['remove']);
    expect(header.swipe.offset()).toBe(0);
    expect((start.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .toHaveBeenCalledWith(1);
  });

  it('does not start renaming from the click that ends a swipe', () => {
    render(true);
    header.startSwipe(pointer(200));
    header.swipe.move(pointer(185));
    header.swipe.finish();

    (element.querySelector('.section-title') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.name-input')).toBeNull();

    (element.querySelector('.section-title') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.name-input')).not.toBeNull();
    expect(emitted).toEqual([]);
  });

  it('folds from the chevron, which never starts a swipe', () => {
    render(true);
    const chevron = element.querySelector('.collapse') as HTMLButtonElement;
    const start = pointer(200, chevron);
    header.startSwipe(start);
    header.swipe.move(pointer(100));
    header.swipe.finish();
    chevron.click();

    expect(emitted).toEqual(['collapse']);
    expect((start.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .not.toHaveBeenCalled();
  });

  it('renames once when Enter is followed by blur', () => {
    render(true);
    header.beginEditing();
    header.draft.set(' Surgelés ');
    header.commit();
    header.commit();

    expect(emitted).toEqual(['renamed:Surgelés']);
    expect(header.editing()).toBe(false);
  });

  it('lets viewers fold the section with its title, without swipe, rename or delete', () => {
    render(false);
    const start = pointer(200);
    header.startSwipe(start);
    header.swipe.move(pointer(50));
    header.swipe.finish();
    (element.querySelector('.section-title') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted).toEqual(['collapse']);
    expect(element.querySelector('.delete-section')).toBeNull();
    expect(element.querySelector('.collapse')).toBeNull();
    expect(element.querySelector('.name-input')).toBeNull();
    expect((start.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .not.toHaveBeenCalled();
  });
});
