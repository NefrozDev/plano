import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { AuthService } from '../../core/auth/auth.service';
import { FakeEventSource } from '../../testing/fake-event-source';
import { ListsStore, REMOVED_MESSAGE } from './lists.store';
import type { HomeList } from '@plano/common';
import { MEMBER_ID, entry, listDetail, listSettings, listSummary } from './testing/lists-fixtures';

describe('ListsStore', () => {
  let store: ListsStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    store = TestBed.inject(ListsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Opens list-1 with its settings, as the detail screen does. */
  async function openList(): Promise<void> {
    const opening = store.open('list-1');
    http.expectOne('/api/v1/lists/list-1').flush(listDetail());
    http.expectOne('/api/v1/settings/lists').flush(listSettings());
    expect(await opening).toBe(true);
  }

  const names = (sectionIndex = 0) => store.detail()?.sections[sectionIndex].entries.map(({ name }) => name);

  it('loads the lists and the settings once', async () => {
    const loading = store.loadLists();
    expect(store.loading()).toBe(true);
    http.expectOne('/api/v1/lists').flush([listSummary()]);
    http.expectOne('/api/v1/settings/lists').flush(listSettings());
    await loading;

    expect(store.lists().map(({ name }) => name)).toEqual(['Courses']);
    expect(store.settings()?.defaultView).toBe('list');
    expect(store.loading()).toBe(false);

    const reloading = store.loadLists();
    http.expectOne('/api/v1/lists').flush([]);
    http.expectNone('/api/v1/settings/lists');
    await reloading;
  });

  it('reports a list it cannot open, with the API message', async () => {
    const opening = store.open('list-x');
    http
      .expectOne('/api/v1/lists/list-x')
      .flush({ message: 'Liste introuvable.' }, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/v1/settings/lists').flush(listSettings());

    expect(await opening).toBe(false);
    expect(store.detail()).toBeNull();
    expect(store.error()).toBe('Liste introuvable.');
    store.clearError();
    expect(store.error()).toBe('');
  });

  it('applies entry changes from the server and keeps the counts in sync', async () => {
    await openList();

    const adding = store.addEntry('fresh', 'Beurre');
    const add = http.expectOne('/api/v1/lists/list-1/sections/fresh/entries');
    expect(add.request.body).toEqual({ name: 'Beurre' });
    add.flush(entry('butter', 'Beurre'));
    await adding;
    expect(names()).toEqual(['Lait', 'Œufs', 'Tomates', 'Salade', 'Beurre']);
    expect(store.detail()?.total).toBe(7);

    const milk = store.detail()!.sections[0].entries[0];
    const toggling = store.toggleEntry(milk);
    const toggle = http.expectOne('/api/v1/lists/list-1/entries/milk');
    expect(toggle.request.method).toBe('PATCH');
    expect(toggle.request.body).toEqual({ done: true });
    toggle.flush({ ...milk, done: true });
    await toggling;
    expect(store.detail()?.completed).toBe(3);

    const removing = store.removeEntry('salad');
    http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1/entries/salad' }).flush(null);
    await removing;
    expect(names()).toEqual(['Lait', 'Œufs', 'Tomates', 'Beurre']);
  });

  it('renames and removes sections, refreshing reminders after a removal', async () => {
    await openList();
    const loading = store.loadReminders();
    http.expectOne('/api/v1/lists/reminders').flush([]);
    await loading;

    const renaming = store.renameSection('fresh', 'Frais');
    const rename = http.expectOne('/api/v1/lists/list-1/sections/fresh');
    expect(rename.request.method).toBe('PATCH');
    expect(rename.request.body).toEqual({ name: 'Frais' });
    rename.flush(null);
    expect(await renaming).toBe(true);
    expect(store.detail()?.sections[0].name).toBe('Frais');
    http.expectNone('/api/v1/lists/reminders');

    const removing = store.removeSection('fresh');
    http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1/sections/fresh' }).flush(null);
    expect(await removing).toBe(true);
    expect(store.detail()?.sections.map(({ id }) => id)).not.toContain('fresh');
    expect(store.detail()?.total).toBe(2);
    http.expectOne('/api/v1/lists/reminders').flush([]);
  });

  it('keeps a section when the server refuses to rename or remove it', async () => {
    await openList();
    const refuse = (method: string) =>
      http
        .expectOne({ method, url: '/api/v1/lists/list-1/sections/fresh' })
        .flush({ message: 'Vous pouvez seulement consulter cette liste.' }, { status: 403, statusText: 'Forbidden' });

    const renaming = store.renameSection('fresh', 'Frais');
    refuse('PATCH');
    expect(await renaming).toBe(false);
    const removing = store.removeSection('fresh');
    refuse('DELETE');
    expect(await removing).toBe(false);

    expect(store.detail()?.sections[0]).toEqual(expect.objectContaining({ id: 'fresh', name: 'Produits frais' }));
    expect(store.error()).toBe('Vous pouvez seulement consulter cette liste.');
  });

  it('moves sections locally and saves their order once', async () => {
    await openList();
    const sectionIds = () => store.detail()?.sections.map(({ id }) => id);

    store.moveSection('fresh', 'grocery');
    store.moveSection('fresh', 'unknown');
    expect(sectionIds()).toEqual(['grocery', 'fresh']);
    http.expectNone('/api/v1/lists/list-1/sections/order');

    const saving = store.saveSectionOrder();
    const order = http.expectOne('/api/v1/lists/list-1/sections/order');
    expect(order.request.method).toBe('PUT');
    expect(order.request.body).toEqual({ sectionIds: ['grocery', 'fresh'] });
    order.flush(null);
    await saving;
    expect(sectionIds()).toEqual(['grocery', 'fresh']);
  });

  it('reloads the server section order when saving it fails', async () => {
    await openList();
    store.moveSection('fresh', 'grocery');

    const saving = store.saveSectionOrder();
    http
      .expectOne('/api/v1/lists/list-1/sections/order')
      .flush({ message: 'Ordre invalide.' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    http.expectOne('/api/v1/lists/list-1').flush(listDetail());
    await saving;

    expect(store.detail()?.sections.map(({ id }) => id)).toEqual(['fresh', 'grocery']);
    expect(store.error()).toBe('Ordre invalide.');
  });

  it('keeps the list unchanged when the server refuses a change', async () => {
    await openList();

    const toggling = store.toggleEntry(store.detail()!.sections[0].entries[0]);
    http
      .expectOne('/api/v1/lists/list-1/entries/milk')
      .flush({ message: 'Vous pouvez seulement consulter cette liste.' }, { status: 403, statusText: 'Forbidden' });

    expect(await toggling).toBe(false);
    expect(store.detail()?.sections[0].entries[0].done).toBe(false);
    expect(store.error()).toBe('Vous pouvez seulement consulter cette liste.');
  });

  it('reorders locally while dragging and saves the order once', async () => {
    await openList();

    store.moveEntry('fresh', 'milk', 'tomatoes');
    store.moveEntry('fresh', 'milk', 'unknown');
    expect(names()).toEqual(['Œufs', 'Tomates', 'Lait', 'Salade']);

    const saving = store.saveOrder('fresh');
    const order = http.expectOne({ method: 'PUT', url: '/api/v1/lists/list-1/sections/fresh/order' });
    expect(order.request.body).toEqual({ entryIds: ['eggs', 'tomatoes', 'milk', 'salad'] });
    order.flush(null);
    await saving;
  });

  it('reloads the server order when saving it fails', async () => {
    await openList();
    store.moveEntry('fresh', 'milk', 'salad');

    const saving = store.saveOrder('fresh');
    http
      .expectOne('/api/v1/lists/list-1/sections/fresh/order')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    http.expectOne('/api/v1/lists/list-1').flush(listDetail());
    await saving;

    expect(names()).toEqual(['Lait', 'Œufs', 'Tomates', 'Salade']);
  });

  describe('order and home page', () => {
    const homeList = (changes: Partial<HomeList> = {}): HomeList => ({
      id: 'list-1',
      name: 'Courses',
      icon: 'cart',
      color: '#2ecb70',
      role: 'owner',
      remaining: 2,
      entries: [
        { id: 'milk', name: 'Lait' },
        { id: 'eggs', name: 'Œufs' },
      ],
      ...changes,
    });

    async function loadThree(): Promise<void> {
      const loading = store.loadLists();
      http.expectOne('/api/v1/lists').flush([
        listSummary({ id: 'a', name: 'A' }),
        listSummary({ id: 'b', name: 'B' }),
        listSummary({ id: 'c', name: 'C' }),
      ]);
      http.expectOne('/api/v1/settings/lists').flush(listSettings());
      await loading;
    }
    const order = () => store.lists().map(({ id }) => id);

    it('moves lists locally and saves the whole order once', async () => {
      await loadThree();

      store.moveList('c', 'a');
      store.moveList('missing', 'a');
      store.moveList('c', 'c');
      expect(order()).toEqual(['c', 'a', 'b']);
      http.expectNone('/api/v1/lists/order');

      const saving = store.saveListOrder();
      const request = http.expectOne('/api/v1/lists/order');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ listIds: ['c', 'a', 'b'] });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await saving;

      expect(order()).toEqual(['c', 'a', 'b']);
      // The home page was never shown: nothing to refresh.
      http.expectNone('/api/v1/lists/home');
    });

    it('restores the server order when saving it fails', async () => {
      await loadThree();
      store.moveList('c', 'a');

      const saving = store.saveListOrder();
      http.expectOne('/api/v1/lists/order').flush({ message: 'Liste introuvable.' }, { status: 404, statusText: 'Not Found' });
      await settle();
      http.expectOne('/api/v1/lists').flush([listSummary({ id: 'a' }), listSummary({ id: 'b' }), listSummary({ id: 'c' })]);
      await saving;

      expect(order()).toEqual(['a', 'b', 'c']);
      expect(store.error()).toBe('Liste introuvable.');
    });

    it('pins the open list to the home page and refreshes the home lists', async () => {
      const loadingHome = store.loadHome();
      http.expectOne('/api/v1/lists/home').flush([]);
      await loadingHome;
      expect(store.home()).toEqual([]);
      await loadThree();
      // Settings already loaded with the overview.
      const opening = store.open('list-1');
      http.expectOne('/api/v1/lists/list-1').flush(listDetail());
      await opening;

      const pinning = store.setOnHome(true);
      const request = http.expectOne('/api/v1/lists/list-1/preferences');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ onHome: true });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      http.expectOne('/api/v1/lists/home').flush([homeList()]);
      expect(await pinning).toBe(true);
      await settle();

      expect(store.detail()?.onHome).toBe(true);
      // Only the open list is pinned; the other lists of the overview are untouched.
      expect(store.lists().map(({ onHome }) => onHome)).toEqual([false, false, false]);
      expect(store.home()?.map(({ name }) => name)).toEqual(['Courses']);
    });

    it('keeps the pin unchanged when the server refuses it, and needs an open list', async () => {
      expect(await store.setOnHome(true)).toBe(false);
      http.expectNone('/api/v1/lists/list-1/preferences');
      await openList();

      const pinning = store.setOnHome(true);
      http.expectOne('/api/v1/lists/list-1/preferences').flush(null, { status: 500, statusText: 'Error' });

      expect(await pinning).toBe(false);
      expect(store.detail()?.onHome).toBe(false);
      expect(store.error()).not.toBe('');
    });

    it('ticks a home item, then reloads the home lists', async () => {
      const loadingHome = store.loadHome();
      http.expectOne('/api/v1/lists/home').flush([homeList()]);
      await loadingHome;

      const checking = store.checkHomeEntry('list-1', 'milk');
      const request = http.expectOne('/api/v1/lists/list-1/entries/milk');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ done: true });
      request.flush(entry('milk', 'Lait', { done: true }));
      await settle();
      http.expectOne('/api/v1/lists/home').flush([homeList({ remaining: 1, entries: [{ id: 'eggs', name: 'Œufs' }] })]);
      expect(await checking).toBe(true);
      await settle();

      expect(store.home()?.[0].entries.map(({ name }) => name)).toEqual(['Œufs']);
    });

    it('keeps the home lists when ticking fails', async () => {
      const loadingHome = store.loadHome();
      http.expectOne('/api/v1/lists/home').flush([homeList()]);
      await loadingHome;

      const checking = store.checkHomeEntry('list-1', 'milk');
      http.expectOne('/api/v1/lists/list-1/entries/milk').flush(null, { status: 500, statusText: 'Error' });

      expect(await checking).toBe(false);
      http.expectNone('/api/v1/lists/home');
      expect(store.home()?.[0].remaining).toBe(2);
    });
  });

  it('manages members and sharing', async () => {
    await openList();

    const updating = store.updateMemberRole(MEMBER_ID, 'viewer');
    http
      .expectOne(`/api/v1/lists/list-1/members/${MEMBER_ID}`)
      .flush({ id: MEMBER_ID, name: 'Bob Martin', role: 'viewer' });
    await updating;
    expect(store.detail()?.members[1].role).toBe('viewer');

    const stopping = store.stopSharing();
    http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1/members' }).flush(null);
    await stopping;
    expect(store.detail()?.members.map(({ role }) => role)).toEqual(['owner']);
    expect(store.detail()?.memberCount).toBe(1);
  });

  it('removes a member, and keeps everyone when the server refuses to stop sharing', async () => {
    await openList();
    const membersBefore = store.detail()!.memberCount;

    const removing = store.removeMember(MEMBER_ID);
    const removal = http.expectOne(`/api/v1/lists/list-1/members/${MEMBER_ID}`);
    expect(removal.request.method).toBe('DELETE');
    removal.flush(null);
    expect(await removing).toBe(true);
    expect(store.detail()?.members.map(({ id }) => id)).not.toContain(MEMBER_ID);
    expect(store.detail()?.memberCount).toBe(membersBefore - 1);

    const members = store.detail()!.members;
    const stopping = store.stopSharing();
    http
      .expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1/members' })
      .flush({ message: 'Action interdite.' }, { status: 403, statusText: 'Forbidden' });
    expect(await stopping).toBe(false);
    expect(store.detail()?.members).toEqual(members);
    expect(store.error()).toBe('Action interdite.');
  });

  it('sends no request without an open list and ignores late answers for a list left meanwhile', async () => {
    // Nothing open: http.verify() in afterEach proves no request went out.
    expect(await store.removeMember(MEMBER_ID)).toBe(false);
    expect(await store.stopSharing()).toBe(false);

    await openList();
    const updating = store.updateMemberRole(MEMBER_ID, 'viewer');
    const lateAnswer = http.expectOne(`/api/v1/lists/list-1/members/${MEMBER_ID}`);

    // The user opens another list before the server answers.
    const opening = store.open('list-2');
    http.expectOne('/api/v1/lists/list-2').flush(listDetail({ id: 'list-2', name: 'Maison' }));
    await opening;
    lateAnswer.flush({ id: MEMBER_ID, name: 'Bob Martin', role: 'viewer' });
    await updating;

    expect(store.detail()?.id).toBe('list-2');
    expect(store.detail()?.members).toEqual(listDetail({ id: 'list-2', name: 'Maison' }).members);
  });

  it('creates and deletes lists', async () => {
    const creating = store.createList({ name: 'Maison', icon: 'home', color: '#7868ef' });
    http.expectOne({ method: 'POST', url: '/api/v1/lists' }).flush(listDetail({ id: 'list-2', name: 'Maison' }));
    expect((await creating)?.id).toBe('list-2');
    expect(store.lists().map(({ id }) => id)).toEqual(['list-2']);

    const deleting = store.deleteList();
    http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-2' }).flush(null);
    expect(await deleting).toBe(true);
    expect(store.lists()).toEqual([]);
    expect(store.detail()).toBeNull();
  });

  it('applies settings at once and rolls them back when saving fails', async () => {
    const loading = store.loadLists();
    http.expectOne('/api/v1/lists').flush([]);
    http.expectOne('/api/v1/settings/lists').flush(listSettings());
    await loading;

    const saving = store.updateSettings({ defaultView: 'grid' });
    expect(store.settings()?.defaultView).toBe('grid');
    http.expectOne({ method: 'PATCH', url: '/api/v1/settings/lists' }).flush(null, { status: 500, statusText: 'Error' });
    await saving;

    expect(store.settings()?.defaultView).toBe('list');
    expect(store.error()).toContain('échoué');
  });

  it('refreshes reminders after entry changes once they are in use', async () => {
    await openList();
    const reminder = {
      listId: 'list-1',
      listName: 'Courses',
      listColor: '#2ecb70',
      entryId: 'milk',
      name: 'Lait',
      done: false,
      reminder: '2026-10-15T18:00',
    };

    const loading = store.loadReminders();
    http.expectOne('/api/v1/lists/reminders').flush([reminder]);
    await loading;
    expect(store.reminders()).toEqual([reminder]);

    const updating = store.updateEntry('milk', { reminder: null });
    http.expectOne('/api/v1/lists/list-1/entries/milk').flush(entry('milk', 'Lait'));
    await updating;
    http.expectOne('/api/v1/lists/reminders').flush([]);
    await settle();
    expect(store.reminders()).toEqual([]);
  });

  describe('live updates', () => {
    /** The signed-in app's stream (LiveUpdatesService opens it on sign-in). */
    async function signedInStream(): Promise<FakeEventSource> {
      FakeEventSource.created = [];
      TestBed.inject(AuthService).login({ username: 'ada', password: 'secret' }).subscribe();
      http.expectOne('/api/v1/auth/login').flush({ id: 'user-1', locale: 'fr', avatarVersion: null });
      TestBed.tick();
      return FakeEventSource.latest() as FakeEventSource;
    }

    it('reloads the open list and the overview when they change elsewhere', async () => {
      const stream = await signedInStream();
      const loading = store.loadLists();
      http.expectOne('/api/v1/lists').flush([listSummary()]);
      http.expectOne('/api/v1/settings/lists').flush(listSettings());
      await loading;
      const opening = store.open('list-1');
      http.expectOne('/api/v1/lists/list-1').flush(listDetail());
      await opening;

      stream.emit({ type: 'list.changed', listId: 'list-1' });
      await settle();
      http.expectOne('/api/v1/lists/list-1').flush(listDetail({ name: 'Courses du week-end' }));
      await settle();
      http.expectOne('/api/v1/lists').flush([listSummary({ name: 'Courses du week-end' })]);
      await settle();

      expect(store.detail()?.name).toBe('Courses du week-end');
      expect(store.lists()[0].name).toBe('Courses du week-end');
      expect(store.error()).toBe('');
      // Reminders were never loaded: nothing to refresh.
      http.expectNone('/api/v1/lists/reminders');
    });

    it('reloads the home lists when a list changes elsewhere, once they are shown', async () => {
      const stream = await signedInStream();
      const loadingHome = store.loadHome();
      http.expectOne('/api/v1/lists/home').flush([]);
      await loadingHome;

      stream.emit({ type: 'list.changed', listId: 'list-1' });
      await settle();

      http.expectOne('/api/v1/lists/home').flush([]);
      http.expectNone('/api/v1/lists');
    });

    it('reloads only what is on screen', async () => {
      const stream = await signedInStream();
      await openList();

      stream.emit({ type: 'list.changed', listId: 'list-2' });
      await settle();

      // Another list, and the overview was never shown: no request at all.
      http.expectNone('/api/v1/lists/list-1');
      http.expectNone('/api/v1/lists');
      expect(store.detail()?.id).toBe('list-1');
    });

    it('leaves a list removed elsewhere, with an explanation', async () => {
      const stream = await signedInStream();
      await openList();

      stream.emit({ type: 'list.removed', listId: 'list-1' });
      await settle();

      expect(store.detail()).toBeNull();
      expect(store.error()).toBe(REMOVED_MESSAGE);
    });

    it('treats a changed list it can no longer read as removed', async () => {
      const stream = await signedInStream();
      await openList();

      stream.emit({ type: 'list.changed', listId: 'list-1' });
      await settle();
      http
        .expectOne('/api/v1/lists/list-1')
        .flush({ message: 'Liste introuvable.' }, { status: 404, statusText: 'Not Found' });
      await settle();

      expect(store.detail()).toBeNull();
      expect(store.error()).toBe(REMOVED_MESSAGE);
    });
  });

  it('turns network failures into a readable message', async () => {
    const loading = store.loadLists();
    http.expectOne('/api/v1/lists').error(new ProgressEvent('error'));
    http.expectOne('/api/v1/settings/lists').flush(listSettings());
    await loading;

    expect(store.error()).toContain('Impossible de joindre Plano');
  });
});
