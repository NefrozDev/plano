import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../../objectives.store';
import { provideObjectiveContext, provideObjectivesTesting } from '../../objectives.testing';
import { ObjectiveContext } from '../objective-context';
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
  const show = (id: string): void => {
    TestBed.inject(ObjectiveContext).id.set(id);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveStatsComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('courir-10-km')],
    });
    fixture = TestBed.createComponent(ObjectiveStatsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('summarizes completed sessions', () => {
    // 8 runs done (243 min, 38.5 km in total) and 1 missed.
    expect(tiles()).toEqual([
      '6,5 km | Meilleure séance',
      '4 h 03 | Temps total',
      '4,8 km | Moyenne par séance',
      '89 % | Assiduité',
    ]);
  });

  it('draws the running best as an SVG line against the target', () => {
    const chart = component.chart()!;

    expect(chart.points.map((point) => point.value)).toEqual([3, 3.5, 4.2, 4.8, 5, 5.5, 6, 6.5]);
    expect(chart.ticks.map((tick) => tick.label)).toEqual(['0', '2,5', '5', '7,5', '10']);
    expect(chart.line.startsWith('M')).toBeTrue();
    expect(element.querySelector('.target-label')?.textContent).toBe('Objectif : 10 km');
    expect(element.querySelector('.chart-card header strong')?.textContent).toBe('6,5 km');
    // Lines rendered inside @for blocks must still be real SVG elements.
    expect(element.querySelector('line.grid')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(element.querySelectorAll('tbody tr').length).toBe(8);
  });

  it('shows a tooltip for the point nearest to the pointer', () => {
    const svg = element.querySelector('svg') as SVGSVGElement;
    spyOn(svg, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 0, 320, 180));
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: 0 }));
    fixture.detectChanges();

    expect(component.activeIndex()).toBe(0);
    expect(element.querySelector('.tooltip strong')?.textContent).toBe('3 km');
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
    expect(component.activeIndex()).toBe(7);
    press('ArrowLeft');
    expect(component.activeIndex()).toBe(6);
    press('Home');
    expect(component.activeIndex()).toBe(0);
    press('ArrowLeft');
    expect(component.activeIndex()).toBe(0);
    press('End');
    press('ArrowRight');
    expect(component.activeIndex()).toBe(7);
    press('a');
    expect(component.activeIndex()).toBe(7);
  });

  it('uses totals for cumulative objectives without durations', () => {
    show('economiser-1000');

    expect(tiles().slice(0, 2)).toEqual(['450 € | Total cumulé', '3 | Séances réalisées']);
    expect(component.chart()?.points.map((point) => point.value)).toEqual([150, 300, 450]);
  });

  it('handles a single session, no session and non-metric objectives', () => {
    const store = TestBed.inject(ObjectivesStore);
    const created = store.create({
      title: 'Nager', category: 'health', tracking: 'metric', dueDate: null, description: '', plan: '',
      reminder: { frequency: 'none', time: '09:00', weekday: 0 },
      metric: { unit: 'km', target: 2, aggregation: 'max' }, steps: [], habitTargetDays: 1,
    });
    show(created.id);
    expect(element.querySelector('.chart-card .empty')).not.toBeNull();
    expect(tiles()[3]).toBe('0 % | Assiduité');

    store.addSession(created.id, { date: '2026-10-15', status: 'done', value: 1, label: 'Bassin' });
    fixture.detectChanges();
    expect(component.chart()?.xLabels.length).toBe(1);

    show('apprendre-italien');
    expect(element.querySelector('.chart-card')).toBeNull();
    expect(component.tiles()).toEqual([]);
  });

  it('copes with a missing objective, a hidden chart and empty pointer input', () => {
    const svg = element.querySelector('svg') as SVGSVGElement;
    spyOn(svg, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 0, 0, 0));
    component.trackPointer(new PointerEvent('pointermove', { clientX: 10 }), svg);
    // A zero-width (hidden) chart cannot map the pointer to a point.
    expect(component.activeIndex()).toBeNull();

    show('inconnu');
    expect(component.tint()).toBe('#3264ed');
    expect(component.unit()).toBe('');
    expect(component.tooltip()).toBeNull();
    component.trackPointer(new PointerEvent('pointermove'), svg);
    component.navigate(new KeyboardEvent('keydown', { key: 'End' }));
    component.focusChart();
    expect(component.activeIndex()).toBe(0);
  });
});
