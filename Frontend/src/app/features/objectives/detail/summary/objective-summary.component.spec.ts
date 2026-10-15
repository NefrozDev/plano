import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../../objectives.store';
import { provideObjectiveContext, provideObjectivesTesting } from '../../objectives.testing';
import { ObjectiveContext } from '../objective-context';
import { ObjectiveSummaryComponent } from './objective-summary.component';

describe('ObjectiveSummaryComponent', () => {
  let fixture: ComponentFixture<ObjectiveSummaryComponent>;
  let element: HTMLElement;
  let store: ObjectivesStore;

  const tiles = (): string[] =>
    Array.from(element.querySelectorAll('.tile')).map(
      (tile) => `${tile.querySelector('strong')?.textContent} ${tile.querySelector('span')?.textContent}`,
    );
  const show = (id: string): void => {
    TestBed.inject(ObjectiveContext).id.set(id);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveSummaryComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('courir-10-km')],
    });
    fixture = TestBed.createComponent(ObjectiveSummaryComponent);
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  });

  it('shows the hero, key figures and people for a metric objective', () => {
    expect(element.querySelector('h2')?.textContent).toContain('Courir 10 km');
    expect(element.querySelector('.due')?.textContent).toBe('Échéance : 30 nov. 2026');
    expect(element.querySelector('.percent')?.textContent).toBe('65 %');
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('65');
    expect(tiles()).toEqual(['6,5 km Meilleure séance', '8 / 24 Séances', '46 jours Restants']);
    // Six people: four avatars and a "+2" bubble.
    expect(element.querySelectorAll('.avatar').length).toBe(5);
    expect(element.querySelector('.avatar.more')?.textContent).toBe('+2');
  });

  it('adapts key figures to steps, habits, completion and deadlines', () => {
    show('apprendre-italien');
    expect(tiles().slice(0, 2)).toEqual(['2 / 5 Étapes', '3 Restantes']);

    show('mediter-30-min');
    expect(tiles().slice(0, 2)).toEqual(['34 Jours réussis', '3 j Meilleure série']);

    show('mediter-30-jours');
    expect(tiles()[2]).toBe('Terminé 30 août');

    store.update('courir-10-km', { dueDate: '2026-10-14' });
    show('courir-10-km');
    expect(tiles()[2]).toBe('1 jour De retard');

    store.update('courir-10-km', { dueDate: null });
    fixture.detectChanges();
    expect(tiles()[2]).toBe('— Sans échéance');
    expect(element.querySelector('.due')?.textContent).toBe('Sans échéance');
  });

  it('renames the objective inline and lets Escape cancel', () => {
    (element.querySelector('h2 button') as HTMLButtonElement).click();
    fixture.detectChanges();
    TestBed.flushEffects();
    const input = element.querySelector('.title-input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    input.value = '  Courir 12 km ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(store.find('courir-10-km')?.title).toBe('Courir 12 km');

    (element.querySelector('h2 button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const second = element.querySelector('.title-input') as HTMLInputElement;
    second.value = 'Ignoré';
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    // The trailing blur after Escape must not save the draft.
    fixture.componentInstance.saveTitle('Ignoré');
    expect(store.find('courir-10-km')?.title).toBe('Courir 12 km');
  });

  it('edits description and plan from expandable rows', () => {
    const rows = element.querySelectorAll<HTMLButtonElement>('button.row');
    rows[0].click();
    fixture.detectChanges();
    const textarea = element.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = ' Nouvelle description ';
    textarea.dispatchEvent(new Event('change'));

    rows[1].click();
    fixture.detectChanges();
    expect(element.querySelector('textarea')).toBeNull();
    const plan = element.querySelector('input.editor') as HTMLInputElement;
    plan.value = '4 sorties par semaine';
    plan.dispatchEvent(new Event('change'));

    expect(store.find('courir-10-km')).toEqual(jasmine.objectContaining({
      description: 'Nouvelle description',
      plan: '4 sorties par semaine',
    }));
  });

  it('edits reminders', () => {
    fixture.componentInstance.toggleRow('reminder');
    fixture.detectChanges();
    const selects = element.querySelectorAll<HTMLSelectElement>('.reminder-editor select');
    // Weekly reminder: frequency, weekday and due-date selects are visible.
    expect(selects.length).toBe(3);
    expect(selects[1].value).toBe('0');

    selects[1].value = '2';
    selects[1].dispatchEvent(new Event('change'));
    selects[2].value = 'week-before';
    selects[2].dispatchEvent(new Event('change'));
    const time = element.querySelector('.reminder-editor input') as HTMLInputElement;
    time.value = '07:30';
    time.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(store.find('courir-10-km')?.reminder).toEqual({ frequency: 'weekly', time: '07:30', weekday: 2 });
    expect(element.textContent).toContain('Chaque mercredi à 07:30 · Échéance : 1 semaine avant');

    fixture.componentInstance.updateReminder({ frequency: 'none' });
    fixture.detectChanges();
    expect(element.querySelector('.reminder-editor input')).toBeNull();
  });

  it('shows progress as amounts when percentages are turned off', () => {
    store.updateSettings({ showPercentage: false });
    fixture.detectChanges();

    expect(element.querySelector('.percent')?.textContent).toBe('6,5 / 10 km');
  });

  it('marks paused objectives and handles objectives without sharing', () => {
    store.update('apprendre-italien', { status: 'paused' });
    show('apprendre-italien');

    expect(element.querySelector('.pill')?.textContent).toBe('En pause');
    expect(element.textContent).toContain('Personne pour l’instant');
  });

  it('ignores edits once the objective has been deleted', () => {
    store.remove('courir-10-km');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.editingTitle.set(true);
    component.saveTitle('Fantôme');
    component.updateText('plan', 'x');
    component.updateReminder({ time: '10:00' });
    component.updateDueReminder('none');

    expect(component.view()).toBeNull();
    expect(element.querySelector('.hero')).toBeNull();
    expect(store.objectives().length).toBe(7);
  });
});
