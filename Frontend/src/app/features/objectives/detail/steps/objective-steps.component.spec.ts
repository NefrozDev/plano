import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../../objectives.store';
import { provideObjectiveContext, provideObjectivesTesting } from '../../objectives.testing';
import { ObjectiveContext } from '../objective-context';
import { ObjectiveStepsComponent } from './objective-steps.component';

describe('ObjectiveStepsComponent', () => {
  let fixture: ComponentFixture<ObjectiveStepsComponent>;
  let element: HTMLElement;
  let store: ObjectivesStore;

  const captions = (): string[] =>
    Array.from(element.querySelectorAll('li small')).map((caption) => caption.textContent ?? '');
  const openInput = (): HTMLInputElement => {
    (element.querySelector('.add-step') as HTMLButtonElement).click();
    fixture.detectChanges();
    return element.querySelector('.new-step') as HTMLInputElement;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveStepsComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('apprendre-italien')],
    });
    fixture = TestBed.createComponent(ObjectiveStepsComponent);
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  });

  it('lists steps with completion dates and the step in progress', () => {
    expect(element.querySelector('.heading span')?.textContent).toBe('2 / 5 complétées');
    expect(captions()).toEqual([
      'Terminé le 20 août 2026',
      'Terminé le 28 sept. 2026',
      'En cours',
      'À faire',
      'À faire',
    ]);
  });

  it('ticks and removes steps', () => {
    (element.querySelectorAll('.toggle')[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(captions()[2]).toBe('Terminé le 15 oct. 2026');
    expect(captions()[3]).toBe('En cours');

    (element.querySelectorAll('.remove')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.find('apprendre-italien')!.steps.length).toBe(4);
  });

  it('adds a step once on Enter, even though the input then blurs', () => {
    const input = openInput();
    TestBed.flushEffects();
    expect(document.activeElement).toBe(input);

    input.value = 'Écrire une carte postale';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();

    expect(store.find('apprendre-italien')!.steps.map((step) => step.label)).toEqual(
      jasmine.arrayContaining(['Écrire une carte postale']),
    );
    expect(store.find('apprendre-italien')!.steps.length).toBe(6);
  });

  it('cancels with Escape and shows an empty list message', () => {
    const input = openInput();
    input.value = 'Ignoré';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('.new-step')).toBeNull();
    expect(store.find('apprendre-italien')!.steps.length).toBe(5);

    store.update('apprendre-italien', { steps: [] });
    fixture.detectChanges();
    expect(element.querySelector('li.empty')).not.toBeNull();
  });

  it('explains that metric objectives have no steps', () => {
    TestBed.inject(ObjectiveContext).id.set('courir-10-km');
    fixture.detectChanges();
    expect(element.querySelector('p.empty')).not.toBeNull();
  });

  it('ignores actions once the objective has been deleted', () => {
    const component = fixture.componentInstance;
    store.remove('apprendre-italien');
    component.adding.set(true);
    component.toggle('step-1');
    component.remove('step-1');
    component.add('Fantôme');

    expect(component.completedCount()).toBe(0);
    expect(component.adding()).toBeFalse();
  });
});
