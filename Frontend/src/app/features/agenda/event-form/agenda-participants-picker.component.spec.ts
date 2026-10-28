import { ComponentFixture, TestBed } from '@angular/core/testing';
import { providePlanoTesting } from '../../../testing/plano-testing';
import { AgendaStore } from '../agenda.store';
import { AgendaParticipantsPickerComponent } from './agenda-participants-picker.component';

describe('AgendaParticipantsPickerComponent', () => {
  let fixture: ComponentFixture<AgendaParticipantsPickerComponent>;
  let picker: AgendaParticipantsPickerComponent;
  let element: HTMLElement;
  let store: AgendaStore;
  let confirmed: string[][];
  let cancelled: number;
  const selected = ['alex'];

  const headings = (): string[] =>
    Array.from(element.querySelectorAll('h3')).map((heading) => heading.textContent ?? '');
  const names = (): string[] =>
    Array.from(element.querySelectorAll('.person .name')).map((name) => name.textContent ?? '');
  const search = (text: string): void => {
    picker.query.set(text);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AgendaParticipantsPickerComponent],
      providers: providePlanoTesting(),
    });
    store = TestBed.inject(AgendaStore);
    fixture = TestBed.createComponent(AgendaParticipantsPickerComponent);
    fixture.componentRef.setInput('selected', selected);
    picker = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    confirmed = [];
    cancelled = 0;
    picker.confirm.subscribe((ids) => confirmed.push(ids));
    picker.cancelled.subscribe(() => cancelled++);
    fixture.detectChanges();
  });

  it('starts from a copy of the selection, frequent contacts first', () => {
    expect(picker.picked()).toEqual(['alex']);
    expect(headings()).toEqual(['Fréquemment contactés', 'Tous les contacts']);
    const frequent = store.contacts().filter(({ frequent }) => frequent).map(({ name }) => name);
    expect(names().slice(0, frequent.length)).toEqual(frequent);
    expect(element.querySelectorAll('input:checked').length).toBe(1);

    picker.toggle('camille');
    // Edits stay local until confirmed: the parent's array is untouched.
    expect(selected).toEqual(['alex']);
  });

  it('confirms the picked ids once, or cancels without confirming', () => {
    (element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]).click();
    picker.toggle('alex');
    (element.querySelector('.confirm') as HTMLButtonElement).click();

    expect(confirmed).toEqual([['camille']]);
    expect(cancelled).toBe(0);

    (element.querySelector('[aria-label="Annuler"]') as HTMLButtonElement).click();
    expect(cancelled).toBe(1);
    expect(confirmed.length).toBe(1);
  });

  it('searches without accents and never offers to invite someone outside the contacts', () => {
    const contactsBefore = store.contacts();
    search('chloe');
    expect(headings()).toEqual(['Résultats']);
    expect(names()).toEqual(['Chloé']);

    search('Zoé');
    expect(names()).toEqual([]);
    expect(element.querySelector('.empty')?.textContent).toBe('Aucun contact trouvé.');
    expect(element.textContent).not.toContain('Ajouter');
    expect(element.querySelectorAll('.lists button').length).toBe(0);
    expect(store.contacts()).toEqual(contactsBefore);
  });
});
