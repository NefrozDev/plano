import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ObjectivesStore } from '../objectives.store';
import { flushObjectives, provideObjectivesTesting } from '../objectives.testing';
import { objectiveSummary } from '../testing/objectives-fixtures';
import { ObjectivesSearchComponent } from './objectives-search.component';

describe('ObjectivesSearchComponent', () => {
  let fixture: ComponentFixture<ObjectivesSearchComponent>;
  let element: HTMLElement;

  const type = (value: string): void => {
    const input = element.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const titles = (): string[] =>
    Array.from(element.querySelectorAll('.objective-list strong')).map((title) => title.textContent ?? '');

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ObjectivesSearchComponent],
      providers: provideObjectivesTesting(),
    });
    fixture = TestBed.createComponent(ObjectivesSearchComponent);
    element = fixture.nativeElement as HTMLElement;
    await flushObjectives([
      objectiveSummary({ id: 'run', title: 'Courir', dueDate: '2026-11-30' }),
      objectiveSummary({ id: 'med', title: 'Méditer 30 min', category: 'learning' }),
      objectiveSummary({ id: 'med2', title: 'Méditer 30 jours', status: 'completed', completedAt: '2026-08-30T12:00:00.000Z' }),
    ]);
    const store = TestBed.inject(ObjectivesStore);
    store.markViewed('med');
    store.markViewed('run');
    fixture.detectChanges();
  });

  it('shows recent objectives and category suggestions before typing', () => {
    expect(titles()).toEqual(['Courir', 'Méditer 30 min']);
    expect(element.textContent).toContain('Échéance : 30 nov. 2026');
    expect(element.textContent).toContain('Sans échéance');
    expect(element.querySelectorAll('.suggestions button').length).toBe(4);
  });

  it('searches as the user types and reports when nothing matches', () => {
    type('mediter');
    expect(titles()).toEqual(['Méditer 30 min', 'Méditer 30 jours']);
    expect(element.querySelector('.objective-list a')?.getAttribute('href')).toBe('/objectives/med');
    expect(element.textContent).toContain('Terminé le 30 août 2026');

    type('xyz');
    expect(element.querySelector('.empty')?.textContent).toContain('« xyz »');
  });

  it('turns a suggestion into a category filter on the overview', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (element.querySelectorAll('.suggestions button')[2] as HTMLButtonElement).click();

    expect(TestBed.inject(ObjectivesStore).filters().categories).toEqual(['finance']);
    expect(navigate).toHaveBeenCalledWith('/objectives');
  });
});
