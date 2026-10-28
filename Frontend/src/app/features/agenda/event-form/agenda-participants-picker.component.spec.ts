import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { providePlanoTesting, settle } from '../../../testing/plano-testing';
import { AgendaStore } from '../agenda.store';
import { CONTACTS } from '../../../testing/contacts';
import { AgendaParticipantsPickerComponent } from './agenda-participants-picker.component';

describe('AgendaParticipantsPickerComponent', () => {
  let fixture: ComponentFixture<AgendaParticipantsPickerComponent>;
  let picker: AgendaParticipantsPickerComponent;
  let element: HTMLElement;
  let http: HttpTestingController;
  let confirmed: string[][];
  let cancelled: number;
  const selected = ['user-eve'];

  const headings = (): string[] =>
    Array.from(element.querySelectorAll('h3')).map((heading) => heading.textContent ?? '');
  const names = (): string[] =>
    Array.from(element.querySelectorAll('.person .name')).map((name) => name.textContent ?? '');
  const search = (text: string): void => {
    picker.query.set(text);
    fixture.detectChanges();
  };

  async function open(answer: () => void = () => http.expectOne('/api/v1/contacts').flush(CONTACTS)): Promise<void> {
    fixture.detectChanges();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Chargement de vos contacts');
    answer();
    await settle();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AgendaParticipantsPickerComponent],
      providers: providePlanoTesting(),
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgendaParticipantsPickerComponent);
    fixture.componentRef.setInput('selected', selected);
    picker = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    confirmed = [];
    cancelled = 0;
    picker.confirm.subscribe((ids) => confirmed.push(ids));
    picker.cancelled.subscribe(() => cancelled++);
  });

  afterEach(() => http.verify());

  it('offers only contacts: friends first, then each group, everyone once', async () => {
    await open();

    expect(headings()).toEqual(['Amis', 'Famille proche', 'Travail']);
    expect(names()).toEqual(['Bob Test', 'Eve Test', 'Chloé Test', 'Dan Test']);
    // The seed contacts of the local demo data are not invitable.
    expect(names()).not.toContain('Camille');
    expect(element.querySelectorAll('app-user-avatar').length).toBe(4);
  });

  it('starts from a copy of the selection and confirms the picked ids once', async () => {
    await open();
    expect(picker.picked()).toEqual(['user-eve']);
    expect(element.querySelectorAll('input:checked').length).toBe(1);

    (element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]).click();
    picker.toggle('user-eve');
    // Edits stay local until confirmed: the parent's array is untouched.
    expect(selected).toEqual(['user-eve']);
    (element.querySelector('.confirm') as HTMLButtonElement).click();

    expect(confirmed).toEqual([['user-bob']]);
    expect(cancelled).toBe(0);
    (element.querySelector('[aria-label="Annuler"]') as HTMLButtonElement).click();
    expect(cancelled).toBe(1);
    expect(confirmed.length).toBe(1);
  });

  it('searches names and usernames without accents, and says when nobody matches', async () => {
    await open();

    search('chloe');
    expect(headings()).toEqual(['Résultats']);
    expect(names()).toEqual(['Chloé Test']);

    search('Zoé');
    expect(names()).toEqual([]);
    expect(element.querySelector('.empty')?.textContent).toBe('Aucun contact trouvé.');
    // There is no way to invite someone outside the contacts.
    expect(element.textContent).not.toContain('Ajouter');
  });

  it('explains how to get contacts when there are none', async () => {
    await open(() => http.expectOne('/api/v1/contacts').flush([]));

    expect(headings()).toEqual([]);
    expect(element.querySelector('.empty')?.textContent).toContain('ajoutez des amis dans les paramètres');
  });

  it('reports contacts that cannot be loaded, offering nobody', async () => {
    await open(() =>
      http.expectOne('/api/v1/contacts').flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' }),
    );

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger vos contacts.');
    expect(element.querySelectorAll('.person').length).toBe(0);
    expect(TestBed.inject(AgendaStore).invitable()).toEqual([]);
  });
});
