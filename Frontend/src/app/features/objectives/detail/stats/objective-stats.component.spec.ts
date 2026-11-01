import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ObjectiveDetail } from '@plano/common';
import { openObjective, provideObjectiveContext, provideObjectivesTesting } from '../../objectives.testing';
import { metricDetail, treeDetail } from '../../testing/objectives-fixtures';
import { ObjectiveStatsComponent, niceStep } from './objective-stats.component';

describe('niceStep', () => {
  it('picks round tick intervals', () => {
    expect(niceStep(10)).toBe(2.5);
    expect(niceStep(1000)).toBe(250);
    expect(niceStep(12)).toBe(5);
    expect(niceStep(7)).toBe(2);
    expect(niceStep(3)).toBe(1);
    expect(niceStep(35)).toBe(10);
    expect(niceStep(0)).toBe(1);
  });
});

describe('ObjectiveStatsComponent', () => {
  let fixture: ComponentFixture<ObjectiveStatsComponent>;
  let component: ObjectiveStatsComponent;
  let element: HTMLElement;

  const tiles = (): string[] =>
    Array.from(element.querySelectorAll('.tile')).map(
      (tile) => `${tile.querySelector('strong')?.textContent} | ${tile.querySelector('span')?.textContent}`,
    );
  const show = async (detail: ObjectiveDetail): Promise<void> => {
    await openObjective(detail);
    fixture.detectChanges();
  };
  const session = (date: string, value: number) => ({
    id: date,
    date,
    status: 'done' as const,
    label: '',
    value,
    durationMinutes: null,
    author: null,
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ObjectiveStatsComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('obj-1')],
    });
    fixture = TestBed.createComponent(ObjectiveStatsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    await show(metricDetail());
  });

  it('summarizes completed sessions', () => {
    // 2 runs done (77 min, 12.5 km in total) and 1 missed; the planned one does not count.
    expect(tiles()).toEqual([
      '6,5 km | Meilleure valeur',
      '1 h 17 | Temps total',
      '6,3 km | Moyenne par séance',
      '67 % | Assiduité',
    ]);
  });

  it('draws the running best as an SVG line against the target', () => {
    const chart = component.chart()!;

    expect(chart.points.map((point) => point.value)).toEqual([6, 6.5]);
    expect(chart.ticks.map((tick) => tick.label)).toEqual(['0', '2,5', '5', '7,5', '10']);
    expect(chart.line.startsWith('M')).toBe(true);
    expect(element.querySelector('.target-label')?.textContent).toBe('Objectif : 10 km');
    expect(element.querySelector('.chart-card header strong')?.textContent).toBe('6,5 km');
    // Lines rendered inside @for blocks must still be real SVG elements.
    expect(element.querySelector('line.grid')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(element.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('shows a tooltip for the point nearest to the pointer', () => {
    const svg = element.querySelector('svg') as SVGSVGElement;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 180));
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: 0 }));
    fixture.detectChanges();

    expect(component.activeIndex()).toBe(0);
    expect(element.querySelector('.tooltip strong')?.textContent).toBe('6 km');
    expect(element.querySelector('.crosshair')).not.toBeNull();

    svg.dispatchEvent(new PointerEvent('pointerleave'));
    fixture.detectChanges();
    expect(element.querySelector('.tooltip')).toBeNull();
  });

  it('lets keyboard users walk through the points', () => {
    const chart = element.querySelector('.chart') as HTMLElement;
    const press = (key: string): void => {
      chart.dispatchEvent(new KeyboardEvent('keydown', { key }));
    };

    chart.dispatchEvent(new FocusEvent('focus'));
    expect(component.activeIndex()).toBe(1);
    press('ArrowLeft');
    expect(component.activeIndex()).toBe(0);
    press('ArrowLeft');
    expect(component.activeIndex()).toBe(0);
    press('End');
    press('ArrowRight');
    expect(component.activeIndex()).toBe(1);
    press('Home');
    expect(component.activeIndex()).toBe(0);
    press('a');
    expect(component.activeIndex()).toBe(0);
  });

  it('exposes the chart as a slider that announces the current point', () => {
    const chart = element.querySelector('.chart') as HTMLElement;
    const slider = () =>
      ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'].map((name) => chart.getAttribute(name));

    // Before any interaction it sits on the latest point.
    expect(slider()).toEqual(['slider', '0', '1', '1', '6,5 km, le 14 oct. 2026']);

    chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    fixture.detectChanges();
    expect(slider()).toEqual(['slider', '0', '1', '0', '6 km, le 12 oct. 2026']);
    // The visual tooltip repeats the value, so it stays hidden from screen readers.
    expect(element.querySelector('.tooltip')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses totals for cumulative objectives without durations', async () => {
    await show(
      metricDetail({
        amount: { current: 450, target: 1000, unit: '€' },
        metric: { unit: '€', target: 1000, aggregation: 'sum' },
        sessions: [session('2026-09-01', 150), session('2026-09-15', 150), session('2026-10-01', 150)],
      }),
    );

    expect(tiles().slice(0, 2)).toEqual(['450 € | Total cumulé', '3 | Séances réalisées']);
    expect(component.chart()?.points.map((point) => point.value)).toEqual([150, 300, 450]);
  });

  it('handles a single session, no session and other modes', async () => {
    await show(metricDetail({ sessions: [], amount: { current: 0, target: 10, unit: 'km' } }));
    expect(element.querySelector('.chart-card .empty')).not.toBeNull();
    expect(tiles()[3]).toBe('0 % | Assiduité');

    await show(metricDetail({ sessions: [session('2026-10-15', 1)] }));
    expect(component.chart()?.xLabels.length).toBe(1);

    await show(treeDetail());
    expect(element.querySelector('.chart-card')).toBeNull();
    expect(component.tiles()).toEqual([]);
  });

  it('copes with a hidden chart and empty pointer input', () => {
    const svg = element.querySelector('svg') as SVGSVGElement;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 0));
    component.trackPointer(new PointerEvent('pointermove', { clientX: 10 }), svg);

    // A zero-width (hidden) chart cannot map the pointer to a point.
    expect(component.activeIndex()).toBeNull();
  });
});

describe('ObjectiveStatsComponent without an objective', () => {
  it('stays quiet', () => {
    TestBed.configureTestingModule({
      imports: [ObjectiveStatsComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('gone')],
    });
    const fixture = TestBed.createComponent(ObjectiveStatsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.tint()).toBe('#3264ed');
    expect(component.unit()).toBe('');
    expect(component.tooltip()).toBeNull();
    component.trackPointer(new PointerEvent('pointermove'), document.createElement('div'));
    component.navigate(new KeyboardEvent('keydown', { key: 'End' }));
    component.focusChart();
    expect(component.activeIndex()).toBe(0);
  });
});
