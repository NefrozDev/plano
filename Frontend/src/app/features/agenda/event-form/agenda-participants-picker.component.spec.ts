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

  it('searches without accents and offers to add only a name nobody has', () => {
    search('chloe');
    expect(headings()).toEqual(['Résultats']);
    expect(names()).toEqual(['Chloé']);
    // "Chloé" exists exactly once typed with its accent: nothing to add.
    search('Chloé');
    expect(element.querySelector('.add')).toBeNull();

    search('Zoé');
    expect(names()).toEqual([]);
    expect(element.querySelector('.empty')?.textContent).toBe('Aucun contact trouvé.');
    expect(element.querySelector('.add')?.textContent).toContain('Ajouter « Zoé »');
  });

  it('adds a typed contact, picks them and clears the search', () => {
    const addContact = vi.spyOn(store, 'addContact');
    search('  Zoé ');
    (element.querySelector('.add') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(addContact).toHaveBeenCalledTimes(1);
    expect(addContact).toHaveBeenCalledWith('  Zoé ');
    const zoe = store.contacts().find(({ name }) => name === 'Zoé');
    expect(zoe).toBeDefined();
    expect(picker.picked()).toEqual(['alex', zoe!.id]);
    expect(picker.query()).toBe('');
  });

  it('picks nobody when the store refuses the name', () => {
    const addContact = vi.spyOn(store, 'addContact');
    const contactsBefore = store.contacts().length;
    picker.query.set('   ');

    picker.addContact();

    expect(addContact).toHaveBeenCalledTimes(1);
    expect(store.contacts().length).toBe(contactsBefore);
    expect(picker.picked()).toEqual(['alex']);
    expect(picker.query()).toBe('   ');
  });
});
