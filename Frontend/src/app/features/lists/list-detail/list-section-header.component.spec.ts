import { onTestFinished } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';
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
      stopPropagation: vi.fn().mockName('stopPropagation'),
    } as unknown as PointerEvent;
  }

  function render(editable: boolean): void {
    fixture = TestBed.createComponent(ListSectionHeaderComponent);
    fixture.componentRef.setInput('name', 'Frais');
    fixture.componentRef.setInput('color', '#7868ef');
    fixture.componentRef.setInput('editable', editable);
    header = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    emitted = [];
    header.renamed.subscribe((name) => emitted.push(`renamed:${name}`));
    header.recoloured.subscribe((color) => emitted.push(`recoloured:${color}`));
    header.collapse.subscribe(() => emitted.push('collapse'));
    header.remove.subscribe(() => emitted.push('remove'));
    header.dragStart.subscribe(() => emitted.push('drag'));
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

  it('starts a drag from its handle, which neither swipes nor renames', () => {
    render(true);
    const handle = element.querySelector('.drag-handle') as HTMLButtonElement;
    expect(handle.getAttribute('aria-label')).toBe('Déplacer la section Frais');
    const swipeStart = pointer(200, handle);
    header.startSwipe(swipeStart);
    header.swipe.move(pointer(50));
    header.swipe.finish();

    const dragStart = pointer(200, handle);
    header.startDrag(dragStart);
    handle.click();
    fixture.detectChanges();

    expect(emitted).toEqual(['drag']);
    expect((swipeStart.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .not.toHaveBeenCalled();
    expect((dragStart.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .toHaveBeenCalledWith(1);
    expect(element.querySelector('.name-input')).toBeNull();
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

  describe('editing', () => {
    const field = () => element.querySelector('.name-input') as HTMLTextAreaElement;
    const colours = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.color'));

    /** Rendered in the document, 12rem wide, so the name wraps and the focus is real. */
    async function edit(): Promise<void> {
      render(true);
      element.style.width = '12rem';
      document.body.append(element);
      onTestFinished(() => element.remove());
      expect(element.querySelector('.section-title')?.getAttribute('aria-label')).toBe('Modifier la section Frais');
      (element.querySelector('.section-title') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('edits the name in a field that grows with its text, never scrolling', async () => {
      await edit();
      expect(field().tagName).toBe('TEXTAREA');
      expect(document.activeElement).toBe(field());
      expect(field().value).toBe('Frais');
      const oneLine = field().getBoundingClientRect().height;

      await userEvent.fill(field(), 'Les produits frais à prendre au marché du samedi matin');

      // Several lines, all of them visible.
      expect(field().getBoundingClientRect().height).toBeGreaterThan(oneLine * 2);
      expect(field().scrollHeight).toBeLessThanOrEqual(Math.ceil(field().getBoundingClientRect().height));
      expect(field().scrollWidth).toBeLessThanOrEqual(field().clientWidth);

      await userEvent.keyboard('{Enter}');
      fixture.detectChanges();

      // Enter saves instead of adding a line.
      expect(emitted).toEqual(['renamed:Les produits frais à prendre au marché du samedi matin']);
      expect(element.querySelector('.name-input')).toBeNull();
    });

    it('turns pasted line breaks into spaces', async () => {
      await edit();
      header.draft.set('  Fruits\net \n légumes ');

      header.commit();

      expect(emitted).toEqual(['renamed:Fruits et légumes']);
    });

    it('offers the colours, marks the current one and saves a pick at once, staying open', async () => {
      await edit();

      expect(element.querySelector('.colors')?.getAttribute('aria-label')).toBe('Couleur');
      expect(colours().map((colour) => [colour.getAttribute('aria-label'), colour.getAttribute('aria-pressed')])).toEqual([
        ['Choisir la couleur #2ecb70', 'false'],
        ['Choisir la couleur #7868ef', 'true'],
        ['Choisir la couleur #f4a51c', 'false'],
        ['Choisir la couleur #e65591', 'false'],
        ['Choisir la couleur #3978ed', 'false'],
      ]);

      // A real click: pressing a colour must not take the focus, which would close the editor.
      await userEvent.click(colours()[2]);
      fixture.detectChanges();

      expect(emitted).toEqual(['recoloured:#f4a51c']);
      expect(document.activeElement).toBe(field());
      expect(header.editing()).toBe(true);
    });

    it('stays open while the keyboard moves from the name to a colour, and saves on leaving both', async () => {
      await edit();
      await userEvent.fill(field(), 'Surgelés');

      await userEvent.tab();
      fixture.detectChanges();
      expect(document.activeElement).toBe(colours()[0]);
      expect(header.editing()).toBe(true);
      expect(emitted).toEqual([]);

      await userEvent.keyboard('{Enter}');
      expect(emitted).toEqual(['recoloured:#2ecb70']);

      (document.activeElement as HTMLElement).blur();
      fixture.detectChanges();

      expect(emitted).toEqual(['recoloured:#2ecb70', 'renamed:Surgelés']);
      expect(header.editing()).toBe(false);
    });

    it('cancels with Escape, from the name or from a colour', async () => {
      await edit();
      await userEvent.fill(field(), 'Surgelés');
      await userEvent.tab();

      await userEvent.keyboard('{Escape}');
      fixture.detectChanges();

      expect(emitted).toEqual([]);
      expect(element.querySelector('.name-input')).toBeNull();
      expect(element.querySelector('.section-title')?.textContent).toBe('Frais');
    });
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
    expect(element.querySelector('.drag-handle')).toBeNull();
    expect(element.querySelector('.name-input')).toBeNull();
    expect(element.querySelector('.color')).toBeNull();
    expect((start.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .not.toHaveBeenCalled();
  });
});
