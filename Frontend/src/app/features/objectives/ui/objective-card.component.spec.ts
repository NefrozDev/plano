import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMockPlanoData } from '@plano/common';
import { ObjectiveCardComponent, ObjectiveCardView } from './objective-card.component';

describe('ObjectiveCardComponent', () => {
  let fixture: ComponentFixture<ObjectiveCardComponent>;
  let element: HTMLElement;
  const objectives = createMockPlanoData().objectives.items;

  function render(card: Partial<ObjectiveCardView>, tile: boolean): void {
    fixture.componentRef.setInput('card', {
      objective: objectives[0],
      progress: 38,
      progressText: '38 %',
      caption: 'Échéance : 29 nov. 2026',
      tint: '#3264ed',
      ...card,
    });
    fixture.componentRef.setInput('tile', tile);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveCardComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ObjectiveCardComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('keeps the thin bar and the trailing value in list mode', () => {
    render({}, false);

    expect(element.querySelector('.progress b')?.getAttribute('style')).toContain('width: 38%');
    expect(element.querySelector('.value')?.textContent).toContain('38 %');
    expect(element.querySelector('.meter')).toBeNull();
  });

  it('shows the value in a bubble centred on the bar, next to the icon, in tile mode', () => {
    render({}, true);
    const meter = element.querySelector('.meter') as HTMLElement;

    // Icon and meter share the first row; the copy spans the row below.
    expect(meter.previousElementSibling?.tagName).toBe('APP-OBJECTIVE-ICON');
    expect(element.querySelector('.progress')).toBeNull();
    expect(element.querySelector('.value')).toBeNull();

    expect(meter.style.getPropertyValue('--objective-progress')).toBe('38%');
    // A single label, read once by screen readers; the bar itself is decorative.
    expect(meter.querySelectorAll('.meter-bubble').length).toBe(1);
    expect(meter.querySelector('.meter-bubble')?.textContent).toBe('Progression : 38 %');
    expect(meter.querySelector('.meter-track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws a thin line that thickens into a ring around the bubble', () => {
    render({ progress: 50 }, true);
    const track = (element.querySelector('.meter-track') as HTMLElement).getBoundingClientRect();
    const bubbleElement = element.querySelector('.meter-bubble') as HTMLElement;
    const bubble = bubbleElement.getBoundingClientRect();
    const style = getComputedStyle(bubbleElement);

    // The line stays thin; the bubble (with its ring) is clearly taller.
    expect(track.height).toBeLessThanOrEqual(8);
    expect(bubble.height).toBeGreaterThan(track.height + 8);
    // The ring is the bubble's border, painted with the progress gradient.
    expect(style.borderTopWidth).toBe('3px');
    expect(style.backgroundImage.match(/linear-gradient/g)?.length).toBe(2);
    // Line fill and ring read the same progress value.
    const fill = (element.querySelector('.meter-fill') as HTMLElement).getBoundingClientRect();
    const meter = (element.querySelector('.meter') as HTMLElement).getBoundingClientRect();
    expect(fill.width).toBeCloseTo(meter.width / 2, 0);
  });

  describe('"En pause" pill', () => {
    const paused = { ...objectives[0], status: 'paused' as const };
    const centre = (box: DOMRect): { x: number; y: number } => ({
      x: (box.left + box.right) / 2,
      y: (box.top + box.bottom) / 2,
    });

    it('sits on the caption line, vertically centred, in list mode', () => {
      render({ objective: paused, caption: 'Éch. : 29 nov.' }, false);
      const caption = element.querySelector('small') as HTMLElement;
      const pill = (caption.querySelector('em') as HTMLElement).getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(caption.firstChild as Node);

      expect(caption.querySelector('em')?.textContent).toBe('En pause');
      // Same vertical centre for the caption text and the pill (±1px rounding).
      expect(Math.abs(centre(pill).y - centre(text.getBoundingClientRect()).y)).toBeLessThanOrEqual(1);
    });

    it('is horizontally centred in the tile, on its own line', () => {
      render({ objective: paused, caption: 'Éch. : 29 nov.' }, true);
      const caption = element.querySelector('small') as HTMLElement;
      const pill = (caption.querySelector('em') as HTMLElement).getBoundingClientRect();
      const copy = (element.querySelector('.copy') as HTMLElement).getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(caption.firstChild as Node);

      expect(Math.abs(centre(pill).x - centre(copy).x)).toBeLessThanOrEqual(1);
      expect(pill.top).toBeGreaterThanOrEqual(text.getBoundingClientRect().bottom - 1);
    });
  });
  it('keeps the number dark on a white bubble whatever the progress', () => {
    for (const progress of [0, 50, 100]) {
      render({ progress, progressText: `${progress} %` }, true);
      const bubble = getComputedStyle(element.querySelector('.meter-bubble') as HTMLElement);

      // White inner layer (padding-box) under the progress-coloured ring.
      expect(bubble.backgroundImage).toContain('linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255))');
      expect(bubble.color).toBe('rgb(60, 70, 88)');
    }
  });
});
