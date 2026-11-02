import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ObjectiveDetail, ObjectiveLinkedList } from '@plano/common';
import { ConfirmService } from '../../../../shared/ui/confirm.service';
import { listSettings, listSummary } from '../../../lists/testing/lists-fixtures';
import { ObjectivesStore } from '../../objectives.store';
import { provideObjectivesTesting, settleObjectives } from '../../objectives.testing';
import { objectiveDetail } from '../../testing/objectives-fixtures';
import { ObjectiveListsComponent } from './objective-lists.component';

const linked = (changes: Partial<ObjectiveLinkedList> = {}): ObjectiveLinkedList => ({
  id: 'list-1',
  name: 'Valise',
  icon: 'suitcase',
  color: '#7868ef',
  done: 2,
  total: 5,
  removeChecked: false,
  ...changes,
});

describe('ObjectiveListsComponent', () => {
  let fixture: ComponentFixture<ObjectiveListsComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;

  function render(detail: ObjectiveDetail, owner = true): void {
    fixture = TestBed.createComponent(ObjectiveListsComponent);
    fixture.componentRef.setInput('objective', detail);
    fixture.componentRef.setInput('owner', owner);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }
  const button = (label: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    )!;
  const click = async (label: string) => {
    button(label).click();
    await settleObjectives();
    fixture.detectChanges();
  };
  const rows = () =>
    Array.from(element.querySelectorAll('.list-row a'), (row) => [
      row.getAttribute('href'),
      row.querySelector('.name')?.textContent,
      row.querySelector('.count')?.textContent,
    ]);
  /** The owner's lists, as the lists screen loads them. */
  const flushLists = () => {
    http.expectOne('/api/v1/lists').flush([
      listSummary({ id: 'free', name: 'Papiers', ownership: 'mine', objectiveId: null }),
      listSummary({ id: 'taken', name: 'Courses', ownership: 'mine', objectiveId: 'obj-9' }),
      listSummary({ id: 'shared', name: 'De Bob', ownership: 'shared', role: 'editor', objectiveId: null }),
      listSummary({ id: 'old', name: 'Ancienne', ownership: 'mine', archived: true, objectiveId: null }),
    ]);
    for (const request of http.match('/api/v1/settings/lists')) request.flush(listSettings());
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ObjectiveListsComponent], providers: provideObjectivesTesting() });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows nothing to someone else when no list is linked', () => {
    render(objectiveDetail(), false);

    expect(element.querySelector('section')).toBeNull();
  });

  it('shows each linked list as a way to it, with its checked items', () => {
    render(objectiveDetail({ lists: [linked(), linked({ id: 'list-2', name: 'Papiers', done: 0, total: 1 })] }), false);

    expect(rows()).toEqual([
      ['/lists/list-1', 'Valise', '2 / 5'],
      ['/lists/list-2', 'Papiers', '0 / 1'],
    ]);
    // Only the owner changes them.
    expect(element.querySelector('.unlink')).toBeNull();
    expect(element.querySelector('.actions')).toBeNull();
  });

  it('says how the bar is made in the "Liste" mode, and why a list does not count', () => {
    render(
      objectiveDetail({
        completion: 'list',
        amount: { current: 2, target: 5, unit: 'éléments' },
        lists: [linked(), linked({ id: 'list-2', name: 'Courses', removeChecked: true })],
      }),
    );

    expect(element.querySelector('.heading span')?.textContent).toBe('2 / 5 cochés');
    expect(Array.from(element.querySelectorAll('.note'), (note) => note.textContent)).toEqual([
      'Ses éléments cochés sont supprimés : elle ne compte pas dans la barre.',
    ]);

    render(objectiveDetail({ completion: 'list', lists: [] }));
    expect(element.querySelector('.note')?.textContent).toContain('Ajoutez une liste');
  });

  it('creates a list from the objective, named by the owner', async () => {
    render(objectiveDetail());
    await click('Nouvelle liste');
    const name = element.querySelector('.new-list input') as HTMLInputElement;
    expect(document.activeElement).toBe(name);

    // A blank name asks nothing.
    await click('Créer');
    http.expectNone('/api/v1/objectives/obj-1/lists/new');

    name.value = '  Valise  ';
    await click('Créer');
    const request = http.expectOne({ method: 'POST', url: '/api/v1/objectives/obj-1/lists/new' });
    expect(request.request.body).toEqual({ name: 'Valise', icon: 'cart', color: '#2ecb70' });
    request.flush(objectiveDetail({ lists: [linked()] }));
    await settleObjectives();
    flushLists();
    fixture.detectChanges();

    expect(TestBed.inject(ObjectivesStore).detail()?.lists).toEqual([linked()]);
    expect(element.querySelector('.new-list')).toBeNull();
  });

  it('stays on the form when the list cannot be created', async () => {
    render(objectiveDetail());
    await click('Nouvelle liste');
    (element.querySelector('.new-list input') as HTMLInputElement).value = 'Valise';
    await click('Créer');

    http.expectOne('/api/v1/objectives/obj-1/lists/new').flush({ message: 'Refusé' }, { status: 403, statusText: 'Forbidden' });
    await settleObjectives();
    fixture.detectChanges();

    expect(element.querySelector('.new-list')).not.toBeNull();
    expect(TestBed.inject(ObjectivesStore).error()).toBe('Refusé');
    http.expectNone('/api/v1/lists');
  });

  it('links one of the owner’s lists that counts for no objective yet', async () => {
    render(objectiveDetail());
    await click('Lier une liste');
    flushLists();
    await settleObjectives();
    fixture.detectChanges();

    const choices = Array.from(element.querySelectorAll('.picker button:not(.secondary)'), (choice) => choice.textContent?.trim());
    expect(choices).toEqual(['Papiers']);

    await click('Papiers');
    const request = http.expectOne({ method: 'POST', url: '/api/v1/objectives/obj-1/lists' });
    expect(request.request.body).toEqual({ listId: 'free' });
    request.flush(objectiveDetail({ lists: [linked({ id: 'free', name: 'Papiers' })] }));
    await settleObjectives();
    // The lists screen learns the list is taken now.
    flushLists();
    fixture.detectChanges();
    expect(element.querySelector('.picker')).toBeNull();
  });

  it('explains when no list can be linked', async () => {
    render(objectiveDetail());
    await click('Lier une liste');
    http.expectOne('/api/v1/lists').flush([listSummary({ objectiveId: 'obj-9' })]);
    for (const request of http.match('/api/v1/settings/lists')) request.flush(listSettings());
    await settleObjectives();
    fixture.detectChanges();

    expect(element.querySelector('.picker .note')?.textContent).toContain('chacune compte pour un objectif au plus');
    await click('Annuler');
    expect(element.querySelector('.actions')).not.toBeNull();
  });

  it('unlinks a list once confirmed, never without', async () => {
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(objectiveDetail({ lists: [linked()] }));

    (element.querySelector('.unlink') as HTMLButtonElement).click();
    await settleObjectives();
    http.expectNone('/api/v1/objectives/obj-1/lists/list-1');

    (element.querySelector('.unlink') as HTMLButtonElement).click();
    await settleObjectives();
    expect(ask).toHaveBeenLastCalledWith({
      heading: 'Retirer la liste',
      message: '« Valise » ne comptera plus pour cet objectif. Elle reste dans vos listes.',
      confirmLabel: 'Retirer',
    });
    const request = http.expectOne({ method: 'DELETE', url: '/api/v1/objectives/obj-1/lists/list-1' });
    request.flush(objectiveDetail());
    await settleObjectives();
    expect(TestBed.inject(ObjectivesStore).detail()?.lists).toEqual([]);
  });
});
