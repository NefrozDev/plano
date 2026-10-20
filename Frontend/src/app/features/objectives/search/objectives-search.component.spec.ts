import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ObjectivesStore } from '../objectives.store';
import { provideObjectivesTesting } from '../objectives.testing';
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectivesSearchComponent],
      providers: provideObjectivesTesting(),
    });
    fixture = TestBed.createComponent(ObjectivesSearchComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('shows recent objectives and category suggestions before typing', () => {
    expect(titles()).toEqual(['Courir 10 km', 'Apprendre l’italien', 'Économiser 1 000 €', 'Lire 12 livres']);
    expect(element.querySelectorAll('.suggestions button').length).toBe(4);
  });

  it('searches as the user types and reports when nothing matches', () => {
    type('mediter');
    expect(titles()).toEqual(['Méditer 30 min par jour', 'Méditer 30 jours']);
    expect(element.querySelector('.objective-list a')?.getAttribute('href')).toBe('/objectives/mediter-30-min');

    type('xyz');
    expect(element.querySelector('.empty')?.textContent).toContain('« xyz »');
  });

  it('turns a suggestion into a category filter on the overview', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (element.querySelectorAll('.suggestions button')[2] as HTMLButtonElement).click();

    expect(TestBed.inject(ObjectivesStore).filters().categories).toEqual(['finance']);
    expect(navigate).toHaveBeenCalledWith('/objectives');
  });

  it('shows "Sans échéance" for objectives without a due date', () => {
    TestBed.inject(ObjectivesStore).update('lire-12-livres', { dueDate: null });
    fixture.detectChanges();
    expect(element.textContent).toContain('Sans échéance');
  });
});
