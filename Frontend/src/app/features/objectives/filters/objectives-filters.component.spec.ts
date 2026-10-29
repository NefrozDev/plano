import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../objectives.store';
import { provideObjectivesTesting } from '../objectives.testing';
import { ObjectivesFiltersComponent } from './objectives-filters.component';

describe('ObjectivesFiltersComponent', () => {
  let fixture: ComponentFixture<ObjectivesFiltersComponent>;
  let element: HTMLElement;
  let store: ObjectivesStore;

  const checkboxes = (fieldset: number): HTMLInputElement[] =>
    Array.from(element.querySelectorAll('fieldset')[fieldset].querySelectorAll('input'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectivesFiltersComponent],
      providers: provideObjectivesTesting(),
    });
    fixture = TestBed.createComponent(ObjectivesFiltersComponent);
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  });

  it('starts unfiltered and previews the number of results', () => {
    expect(checkboxes(0)[0].checked).toBe(true);
    expect(checkboxes(1)[0].checked).toBe(true);
    expect(element.querySelector('.actions a')?.textContent?.trim()).toBe('Afficher 7 objectif(s)');
  });

  it('toggles statuses and categories', () => {
    checkboxes(0)[1].click(); // En cours
    checkboxes(1)[1].click(); // Santé
    fixture.detectChanges();

    expect(store.filters()).toEqual(
      expect.objectContaining({ statuses: ['active'], categories: ['health'] }),
    );
    expect(checkboxes(0)[0].checked).toBe(false);
    expect(element.querySelector('.actions a')?.textContent).toContain('Afficher 2');

    checkboxes(1)[1].click();
    fixture.detectChanges();
    expect(store.filters().categories).toEqual([]);
  });

  it('clears a group with "Tous", which stays ticked', () => {
    store.filters.update((filters) => ({ ...filters, statuses: ['paused'] }));
    fixture.detectChanges();
    checkboxes(0)[0].click();
    fixture.detectChanges();
    expect(store.filters().statuses).toEqual([]);

    // Clicking it again must not untick it: "no restriction" cannot be deselected.
    checkboxes(0)[0].click();
    fixture.detectChanges();
    expect(checkboxes(0)[0].checked).toBe(true);
  });

  it('changes the sort and resets everything', () => {
    const [sort, direction] = Array.from(element.querySelectorAll('select'));
    sort.value = 'progress';
    sort.dispatchEvent(new Event('change'));
    direction.value = 'desc';
    direction.dispatchEvent(new Event('change'));
    expect(store.filters()).toEqual(
      expect.objectContaining({ sort: 'progress', direction: 'desc' }),
    );

    (element.querySelector('.reset') as HTMLButtonElement).click();
    expect(store.filters().sort).toBe('manual');
  });
});
