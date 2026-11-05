import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createMockPlanoData } from '@plano/common';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../../core/data/plano-data.adapter';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { ObjectiveSettingsStore } from '../../core/settings/objective-settings.store';
import { FakeEventSource } from '../../testing/fake-event-source';
import { settle } from '../../testing/plano-testing';
import { ObjectivesStore, REMOVED_MESSAGE } from './objectives.store';
import { provideObjectivesTesting, provideSignedIn } from './objectives.testing';
import { ME, metricDetail, objectiveDetail, objectiveSummary, treeDetail } from './testing/objectives-fixtures';

describe('ObjectivesStore', () => {
  let store: ObjectivesStore;
  let http: HttpTestingController;

  const load = async (objectives = [objectiveSummary()]) => {
    const loading = store.load();
    http.expectOne('/api/v1/objectives').flush(objectives);
    await loading;
  };
  const open = async (detail = objectiveDetail()) => {
    const opening = store.open(detail.id);
    http.expectOne(`/api/v1/objectives/${detail.id}`).flush(detail);
    return opening;
  };

  describe('with the API', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [...provideObjectivesTesting(), provideSignedIn()] });
      store = TestBed.inject(ObjectivesStore);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('loads the objectives and says when it is done', async () => {
      const loading = store.load();
      expect(store.loading()).toBe(true);
      http.expectOne('/api/v1/objectives').flush([objectiveSummary()]);
      await loading;

      expect(store.objectives().map(({ id }) => id)).toEqual(['obj-1']);
      expect(store.find('obj-1')?.title).toBe('Courir 10 km');
      expect(store.find('nope')).toBeUndefined();
      expect(store.loading()).toBe(false);
    });

    it('reports a failed load, with the API message, and keeps what it had', async () => {
      await load();

      const loading = store.load();
      http.expectOne('/api/v1/objectives').flush({ message: 'Hors service' }, { status: 500, statusText: 'Error' });
      await loading;

      expect(store.error()).toBe('Hors service');
      expect(store.objectives()).toHaveLength(1);
      expect(store.loading()).toBe(false);
    });

    it('opens an objective, clearing the previous one first', async () => {
      expect(await open(objectiveDetail({ id: 'a' }))).toBe(true);
      expect(store.detail()?.id).toBe('a');

      const opening = store.open('b');
      expect(store.detail()).toBeNull();
      http.expectOne('/api/v1/objectives/b').flush(objectiveDetail({ id: 'b' }));
      await opening;
      expect(store.detail()?.id).toBe('b');
    });

    it('keeps the objective on screen while reloading it', async () => {
      await open();

      const opening = store.open('obj-1');
      expect(store.detail()?.id).toBe('obj-1');
      http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail());
      await opening;
    });

    it('answers false for an objective it cannot open', async () => {
      const opening = store.open('hidden');
      http.expectOne('/api/v1/objectives/hidden').flush({ message: 'Objectif introuvable.' }, { status: 404, statusText: 'Not Found' });

      expect(await opening).toBe(false);
      expect(store.detail()).toBeNull();
      expect(store.error()).toBe('Objectif introuvable.');
    });

    it('loads the agenda items, and keeps quiet when that fails', async () => {
      const item = {
        kind: 'deadline' as const,
        key: 'deadline:a',
        objectiveId: 'a',
        objectiveTitle: 'A',
        category: 'health' as const,
        date: '2026-10-20',
        label: 'A',
      };
      const loading = store.loadAgenda();
      http.expectOne('/api/v1/objectives/agenda').flush([item]);
      await loading;
      expect(store.agenda()).toEqual([item]);

      const failing = store.loadAgenda();
      http.expectOne('/api/v1/objectives/agenda').flush(null, { status: 500, statusText: 'Error' });
      await failing;
      expect(store.agenda()).toEqual([item]);
      expect(store.error()).toBe('');
    });

    describe('home page', () => {
      it('is unknown until loaded, then holds what is pinned', async () => {
        expect(store.home()).toBeNull();

        const loading = store.loadHome();
        http.expectOne('/api/v1/objectives/home').flush([objectiveSummary()]);
        await loading;

        expect(store.home()?.map(({ id }) => id)).toEqual(['obj-1']);
      });

      it('shows nothing rather than loading forever when it fails', async () => {
        const loading = store.loadHome();
        http.expectOne('/api/v1/objectives/home').flush(null, { status: 500, statusText: 'Error' });
        await loading;

        expect(store.home()).toEqual([]);
      });

      it('follows a pin once loaded, and only then', async () => {
        await open();
        const before = store.updatePreferences('obj-1', { onHome: true });
        http.expectOne('/api/v1/objectives/obj-1/preferences').flush(objectiveDetail({ onHome: true }));
        await before;
        http.expectNone('/api/v1/objectives/home');
        expect(store.detail()?.onHome).toBe(true);
        expect(store.home()).toBeNull();

        const loading = store.loadHome();
        http.expectOne('/api/v1/objectives/home').flush([objectiveSummary()]);
        await loading;
        expect(store.home()).toHaveLength(1);

        const unpinning = store.updatePreferences('obj-1', { onHome: false });
        http.expectOne('/api/v1/objectives/obj-1/preferences').flush(objectiveDetail());
        await settle();
        http.expectOne('/api/v1/objectives/home').flush([]);
        await unpinning;
        expect(store.home()).toEqual([]);

        // Another preference leaves the home page alone.
        const reminding = store.updatePreferences('obj-1', { dueReminder: 'same-day' });
        http.expectOne('/api/v1/objectives/obj-1/preferences').flush(objectiveDetail());
        expect(await reminding).toBe(true);
      });
    });

    describe('live events', () => {
      const emit = (event: Parameters<FakeEventSource['emit']>[0]): void => {
        TestBed.tick();
        FakeEventSource.latest()?.emit(event);
      };

      it('reloads only what is on screen', async () => {
        emit({ type: 'objective.changed', objectiveId: 'x' });
        // Nothing was asked for: nothing to refresh.
        http.expectNone('/api/v1/objectives');
        http.expectNone('/api/v1/objectives/home');
        http.expectNone('/api/v1/objectives/agenda');
        expect(store.objectives()).toEqual([]);
        expect(store.home()).toBeNull();
        expect(store.detail()).toBeNull();
      });

      it('reloads the list, the home page, the agenda and what is open', async () => {
        await load();
        await open();
        const home = store.loadHome();
        http.expectOne('/api/v1/objectives/home').flush([]);
        await home;
        const agenda = store.loadAgenda();
        http.expectOne('/api/v1/objectives/agenda').flush([]);
        await agenda;

        emit({ type: 'objective.changed', objectiveId: 'child' });

        http.expectOne('/api/v1/objectives').flush([objectiveSummary({ title: 'Nouveau' })]);
        http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail({ title: 'Ouvert' }));
        http.expectOne('/api/v1/objectives/home').flush([objectiveSummary()]);
        http.expectOne('/api/v1/objectives/agenda').flush([]);
        await settle();

        expect(store.objectives()[0].title).toBe('Nouveau');
        expect(store.detail()?.title).toBe('Ouvert');
        expect(store.home()).toHaveLength(1);
      });

      it('keeps what it has, quietly, when a reload fails', async () => {
        await load();
        await open();

        emit({ type: 'objective.changed', objectiveId: 'obj-1' });
        http.expectOne('/api/v1/objectives').flush(null, { status: 500, statusText: 'Error' });
        http.expectOne('/api/v1/objectives/obj-1').flush(null, { status: 500, statusText: 'Error' });
        await settle();

        expect(store.objectives()).toHaveLength(1);
        expect(store.detail()).not.toBeNull();
        expect(store.error()).toBe('');
      });

      it('closes what is open when it turns out to be gone', async () => {
        await open();

        emit({ type: 'objective.changed', objectiveId: 'parent' });
        http.expectOne('/api/v1/objectives/obj-1').flush(null, { status: 404, statusText: 'Not Found' });
        await settle();

        expect(store.detail()).toBeNull();
        expect(store.error()).toBe(REMOVED_MESSAGE);
      });

      it('ignores an answer for what is no longer open', async () => {
        await open();

        emit({ type: 'objective.changed', objectiveId: 'obj-1' });
        const opening = store.open('other');
        http.expectOne('/api/v1/objectives/other').flush(objectiveDetail({ id: 'other' }));
        await opening;
        http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail());
        await settle();

        expect(store.detail()?.id).toBe('other');
      });

      it('takes away what was removed, and says so when it was open', async () => {
        await load();
        await open();

        emit({ type: 'objective.removed', objectiveId: 'obj-1' });
        http.expectOne('/api/v1/objectives').flush([]);
        await settle();

        expect(store.objectives()).toEqual([]);
        expect(store.detail()).toBeNull();
        expect(store.error()).toBe(REMOVED_MESSAGE);
      });

      it('leaves what is open alone when something else is removed', async () => {
        await load([objectiveSummary(), objectiveSummary({ id: 'other' })]);
        await open();

        emit({ type: 'objective.removed', objectiveId: 'other' });
        http.expectOne('/api/v1/objectives').flush([objectiveSummary()]);
        http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail());
        await settle();

        expect(store.detail()?.id).toBe('obj-1');
        expect(store.error()).toBe('');
      });

      it('ignores other events', async () => {
        await load();

        emit({ type: 'objective.news', objectiveId: 'obj-1', kind: 'invited', title: 'X', actor: 'Y' });
        emit({ type: 'friends.changed' });

        http.expectNone('/api/v1/objectives');
        expect(store.objectives().map(({ id }) => id)).toEqual(['obj-1']);
        expect(store.error()).toBe('');
      });
    });

    describe('overview queries', () => {
      const mine = objectiveSummary({ id: 'mine', title: 'B', percent: 80, dueDate: '2026-12-01' });
      const shared = objectiveSummary({
        id: 'shared',
        title: 'A',
        role: 'contributor',
        category: 'finance',
        status: 'paused',
        percent: 20,
        dueDate: '2026-11-01',
      });
      const noBar = objectiveSummary({ id: 'nobar', title: 'C', category: 'learning', status: 'completed' });
      const archived = objectiveSummary({ id: 'archived', title: 'D', archived: true });
      const ids = (tab: Parameters<ObjectivesStore['query']>[0]) => store.query(tab).map(({ id }) => id);

      beforeEach(() => load([mine, shared, noBar, archived]));

      it('splits objectives across the four tabs', () => {
        expect(ids('all')).toEqual(['mine', 'shared', 'nobar']);
        expect(ids('mine')).toEqual(['mine', 'nobar']);
        expect(ids('shared')).toEqual(['shared']);
        expect(ids('archived')).toEqual(['archived']);
      });

      it('puts what the user shares in "Partagés" too', async () => {
        await load([mine, objectiveSummary({ id: 'mine-shared', sharing: 'shared' }), objectiveSummary({ id: 'mine-common', sharing: 'common' })]);

        expect(ids('shared')).toEqual(['mine-shared', 'mine-common']);
        expect(ids('mine')).toEqual(['mine', 'mine-shared', 'mine-common']);
      });

      it('includes archived objectives in "Tous" when the setting asks for it', () => {
        store.updateSettings({ showArchived: true });
        expect(ids('all')).toContain('archived');
        expect(ids('mine')).not.toContain('archived');
      });

      it('filters by status and category', () => {
        store.filters.set({ statuses: ['paused'], categories: ['finance'], sort: 'manual', direction: 'asc' });

        expect(ids('all')).toEqual(['shared']);
        expect(store.activeFilterCount()).toBe(2);

        store.filters.update((filters) => ({ ...filters, categories: ['health'] }));
        expect(ids('all')).toEqual([]);

        store.resetFilters();
        expect(store.activeFilterCount()).toBe(0);
        expect(ids('all')).toHaveLength(3);
      });

      it('sorts by progress, with bars before what has none going down', () => {
        store.filters.update((filters) => ({ ...filters, sort: 'progress', direction: 'desc' }));
        expect(ids('all')).toEqual(['mine', 'shared', 'nobar']);
      });

      it('sorts by title and by deadline, undated last', () => {
        store.filters.update((filters) => ({ ...filters, sort: 'title' }));
        expect(ids('all')).toEqual(['shared', 'mine', 'nobar']);

        store.filters.update((filters) => ({ ...filters, sort: 'dueDate' }));
        expect(ids('all')).toEqual(['shared', 'mine', 'nobar']);
      });

      it('reverses the user’s own order', () => {
        store.filters.update((filters) => ({ ...filters, direction: 'desc' }));
        expect(ids('all')).toEqual(['nobar', 'shared', 'mine']);
      });

      it('searches titles and category names, ignoring accents and case', () => {
        expect(store.search('').map(({ id }) => id)).toEqual([]);
        expect(store.search('  ').map(({ id }) => id)).toEqual([]);
        expect(store.search('b').map(({ id }) => id)).toContain('mine');
        expect(store.search('finances').map(({ id }) => id)).toEqual(['shared']);
        expect(store.search('sante').map(({ id }) => id)).toContain('mine');
      });
    });

    describe('order', () => {
      const a = objectiveSummary({ id: 'a' });
      const b = objectiveSummary({ id: 'b' });
      const c = objectiveSummary({ id: 'c' });
      const order = () => store.objectives().map(({ id }) => id);

      beforeEach(() => load([a, b, c]));

      it('moves locally without calling the API, ignoring impossible moves', () => {
        store.moveObjective('c', 'a');
        expect(order()).toEqual(['c', 'a', 'b']);

        store.moveObjective('c', 'c');
        store.moveObjective('nope', 'a');
        store.moveObjective('a', 'nope');
        expect(order()).toEqual(['c', 'a', 'b']);
      });

      it('saves the order on demand', async () => {
        store.moveObjective('c', 'a');

        const saving = store.saveOrder();
        const request = http.expectOne('/api/v1/objectives/order');
        expect(request.request.method).toBe('PUT');
        expect(request.request.body).toEqual({ objectiveIds: ['c', 'a', 'b'] });
        request.flush(null);

        expect(await saving).toBe(true);
      });

      it('takes the server’s order back when saving fails', async () => {
        store.moveObjective('c', 'a');

        const saving = store.saveOrder();
        http.expectOne('/api/v1/objectives/order').flush(null, { status: 500, statusText: 'Error' });
        await settle();
        http.expectOne('/api/v1/objectives').flush([a, b, c]);

        expect(await saving).toBe(false);
        expect(order()).toEqual(['a', 'b', 'c']);
      });
    });

    describe('order of sub-objectives', () => {
      const children = () => store.detail()?.children.map(({ id }) => id);

      it('does nothing without an open objective', async () => {
        store.moveChild('a', 'b');
        expect(await store.saveChildOrder()).toBe(false);
      });

      it('moves locally, then saves and takes the server’s answer', async () => {
        await open(treeDetail());

        store.moveChild('child-2', 'child-1');
        expect(children()).toEqual(['child-2', 'child-1']);
        store.moveChild('child-2', 'child-2');
        store.moveChild('nope', 'child-1');
        expect(children()).toEqual(['child-2', 'child-1']);

        const saving = store.saveChildOrder();
        const request = http.expectOne('/api/v1/objectives/obj-1/children/order');
        expect(request.request.method).toBe('PUT');
        expect(request.request.body).toEqual({ objectiveIds: ['child-2', 'child-1'] });
        request.flush(treeDetail({ title: 'Du serveur' }));

        expect(await saving).toBe(true);
        expect(store.detail()?.title).toBe('Du serveur');
      });

      it('reloads the objective when saving fails', async () => {
        await open(treeDetail());
        store.moveChild('child-2', 'child-1');

        const saving = store.saveChildOrder();
        http.expectOne('/api/v1/objectives/obj-1/children/order').flush(null, { status: 500, statusText: 'Error' });
        await settle();
        http.expectOne('/api/v1/objectives/obj-1').flush(treeDetail());

        expect(await saving).toBe(false);
        expect(children()).toEqual(['child-1', 'child-2']);
      });
    });

    describe('create', () => {
      const details = { title: 'Nager', category: 'health', completion: 'none', startDate: '2026-10-15' } as const;

      it('adds a top-level objective to the list and opens it', async () => {
        await load();

        const creating = store.create(details);
        const request = http.expectOne('/api/v1/objectives');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual(details);
        request.flush(objectiveDetail({ id: 'new', title: 'Nager' }));

        expect((await creating)?.id).toBe('new');
        expect(store.objectives().map(({ id }) => id)).toEqual(['obj-1', 'new']);
        expect(store.detail()?.id).toBe('new');
      });

      it('keeps a sub-objective out of the top-level list', async () => {
        await load();

        const creating = store.create({ ...details, parentId: 'obj-1' });
        http.expectOne('/api/v1/objectives').flush(objectiveDetail({ id: 'new', parentId: 'obj-1' }));
        await creating;

        expect(store.objectives().map(({ id }) => id)).toEqual(['obj-1']);
      });

      it('answers null and reports a refusal', async () => {
        const creating = store.create(details);
        http.expectOne('/api/v1/objectives').flush({ message: 'Trop de niveaux' }, { status: 400, statusText: 'Bad Request' });

        expect(await creating).toBeNull();
        expect(store.error()).toBe('Trop de niveaux');
        expect(store.objectives()).toEqual([]);
      });
    });

    describe('changes', () => {
      beforeEach(async () => {
        await load();
        await open();
      });

      it.each<[string, (store: ObjectivesStore) => Promise<boolean>, string, string, unknown]>([
        ['update', (s) => s.update('obj-1', { title: 'X' }), 'PATCH', '/obj-1', { title: 'X' }],
        ['preferences', (s) => s.updatePreferences('obj-1', { onHome: true }), 'PATCH', '/obj-1/preferences', { onHome: true }],
        [
          'a session',
          (s) => s.addSession('obj-1', { date: '2026-10-15', status: 'done', label: 'A', value: 1 }),
          'POST',
          '/obj-1/sessions',
          { date: '2026-10-15', status: 'done', label: 'A', value: 1 },
        ],
        ['removing a session', (s) => s.removeSession('obj-1', 's1'), 'DELETE', '/obj-1/sessions/s1', null],
        ['a check-in', (s) => s.setCheckIn('obj-1', '2026-10-15', true), 'PUT', '/obj-1/check-ins/2026-10-15', {}],
        ['removing a check-in', (s) => s.setCheckIn('obj-1', '2026-10-15', false), 'DELETE', '/obj-1/check-ins/2026-10-15', null],
        ['the percentage', (s) => s.setProgress('obj-1', 40), 'PUT', '/obj-1/progress', { percent: 40 }],
        ['completing', (s) => s.setCompleted('obj-1', true), 'PUT', '/obj-1/completed', { completed: true }],
        [
          'an invitation',
          (s) => s.addMember('obj-1', { userId: 'b', role: 'viewer' }),
          'POST',
          '/obj-1/members',
          { userId: 'b', role: 'viewer' },
        ],
        ['a role', (s) => s.updateMemberRole('obj-1', 'b', 'contributor'), 'PATCH', '/obj-1/members/b', { role: 'contributor' }],
        ['removing someone', (s) => s.removeMember('obj-1', 'b'), 'DELETE', '/obj-1/members/b', null],
      ])('sends %s and applies the answer everywhere', async (_, act, method, path, body) => {
        const changing = act(store);
        const request = http.expectOne(`/api/v1/objectives${path}`);
        expect(request.request.method).toBe(method);
        expect(request.request.body).toEqual(body);
        request.flush(objectiveDetail({ title: 'Du serveur' }));

        expect(await changing).toBe(true);
        expect(store.detail()?.title).toBe('Du serveur');
        expect(store.find('obj-1')?.title).toBe('Du serveur');
      });

      it('reports a failed change and keeps the state', async () => {
        const changing = store.update('obj-1', { title: 'X' });
        http.expectOne('/api/v1/objectives/obj-1').flush({ message: 'Interdit' }, { status: 403, statusText: 'Forbidden' });

        expect(await changing).toBe(false);
        expect(store.error()).toBe('Interdit');
        expect(store.detail()?.title).toBe('Courir 10 km');
      });

      it('clears the previous error on the next request', async () => {
        const failing = store.update('obj-1', { title: 'X' });
        http.expectOne('/api/v1/objectives/obj-1').flush({ message: 'Interdit' }, { status: 403, statusText: 'Forbidden' });
        await failing;

        const changing = store.update('obj-1', { title: 'Y' });
        expect(store.error()).toBe('');
        http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail());
        await changing;
      });

      it('leaves other objectives alone when a sub-objective changes', async () => {
        const changing = store.update('child', { title: 'X' });
        http.expectOne('/api/v1/objectives/child').flush(objectiveDetail({ id: 'child', parentId: 'obj-1', title: 'X' }));
        await changing;

        expect(store.find('obj-1')?.title).toBe('Courir 10 km');
        expect(store.objectives()).toHaveLength(1);
      });

      it('ticks a sub-objective, then reloads its parent, which stays open', async () => {
        await open(treeDetail());

        const ticking = store.setChildCompleted('child-2', true);
        const request = http.expectOne('/api/v1/objectives/child-2/completed');
        expect(request.request.body).toEqual({ completed: true });
        request.flush(objectiveDetail({ id: 'child-2' }));
        await settle();
        http.expectOne('/api/v1/objectives/obj-1').flush(treeDetail({ percent: 100 }));

        expect(await ticking).toBe(true);
        expect(store.detail()).toMatchObject({ id: 'obj-1', percent: 100 });
      });

      it('does not reload the parent when ticking fails', async () => {
        const ticking = store.setChildCompleted('child-2', true);
        http.expectOne('/api/v1/objectives/child-2/completed').flush(null, { status: 500, statusText: 'Error' });

        expect(await ticking).toBe(false);
      });

      it('takes an objective off the screens when leaving it', async () => {
        const leaving = store.leave('obj-1');
        const request = http.expectOne('/api/v1/objectives/obj-1/members/me');
        expect(request.request.method).toBe('DELETE');
        request.flush(null);

        expect(await leaving).toBe(true);
        expect(store.detail()).toBeNull();
        expect(store.objectives()).toEqual([]);
      });

      it('stays on what it could not leave', async () => {
        const leaving = store.leave('obj-1');
        http.expectOne('/api/v1/objectives/obj-1/members/me').flush(null, { status: 500, statusText: 'Error' });

        expect(await leaving).toBe(false);
        expect(store.objectives()).toHaveLength(1);
      });

      it('removes an objective from the list and forgets it', async () => {
        store.markViewed('obj-1');

        const removing = store.remove('obj-1');
        const request = http.expectOne('/api/v1/objectives/obj-1');
        expect(request.request.method).toBe('DELETE');
        request.flush(null);

        expect(await removing).toBe(true);
        expect(store.detail()).toBeNull();
        expect(store.objectives()).toEqual([]);
        expect(TestBed.inject(PlanoDataStore).data().objectives.recentIds).toEqual([]);
      });

      it('keeps the objective when removing it fails', async () => {
        const removing = store.remove('obj-1');
        http.expectOne('/api/v1/objectives/obj-1').flush(null, { status: 500, statusText: 'Error' });

        expect(await removing).toBe(false);
        expect(store.objectives()).toHaveLength(1);
        expect(store.detail()).not.toBeNull();
      });

      it('keeps the open objective when removing another', async () => {
        const removing = store.remove('other');
        http.expectOne('/api/v1/objectives/other').flush(null);
        await removing;

        expect(store.detail()?.id).toBe('obj-1');
      });
    });

    describe('templates', () => {
      const template = { id: 't1', name: 'Voyage', nodeCount: 3 };

      it('loads them, and keeps quiet when that fails', async () => {
        const loading = store.loadTemplates();
        http.expectOne('/api/v1/objectives/templates').flush([template]);
        await loading;
        expect(store.templates()).toEqual([template]);

        const failing = store.loadTemplates();
        http.expectOne('/api/v1/objectives/templates').flush(null, { status: 500, statusText: 'Error' });
        await failing;
        expect(store.templates()).toEqual([template]);
        expect(store.error()).toBe('');
      });

      it('saves one from an objective', async () => {
        const saving = store.saveTemplate('obj-1', 'Voyage');
        const request = http.expectOne('/api/v1/objectives/obj-1/template');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ name: 'Voyage' });
        request.flush(template);

        expect(await saving).toBe(true);
        expect(store.templates()).toEqual([template]);
      });

      it('reports what could not be saved', async () => {
        const saving = store.saveTemplate('obj-1', 'Voyage');
        http.expectOne('/api/v1/objectives/obj-1/template').flush({ message: 'Trop de modèles' }, { status: 400, statusText: 'Bad Request' });

        expect(await saving).toBe(false);
        expect(store.error()).toBe('Trop de modèles');
        expect(store.templates()).toEqual([]);
      });

      it('removes one, keeping it when that fails', async () => {
        const loading = store.loadTemplates();
        http.expectOne('/api/v1/objectives/templates').flush([template]);
        await loading;

        const failing = store.removeTemplate('t1');
        http.expectOne('/api/v1/objectives/templates/t1').flush(null, { status: 500, statusText: 'Error' });
        expect(await failing).toBe(false);
        expect(store.templates()).toHaveLength(1);

        const removing = store.removeTemplate('t1');
        const request = http.expectOne('/api/v1/objectives/templates/t1');
        expect(request.request.method).toBe('DELETE');
        request.flush(null);
        expect(await removing).toBe(true);
        expect(store.templates()).toEqual([]);
      });

      it('makes an objective from one, which opens', async () => {
        await load();

        const using = store.useTemplate('t1', '2026-10-15');
        const request = http.expectOne('/api/v1/objectives/templates/t1/use');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ startDate: '2026-10-15' });
        request.flush(objectiveDetail({ id: 'made' }));

        expect((await using)?.id).toBe('made');
        expect(store.detail()?.id).toBe('made');
        expect(store.objectives().map(({ id }) => id)).toEqual(['obj-1', 'made']);
      });

      it('answers null when a template cannot be used', async () => {
        const using = store.useTemplate('t1', '2026-10-15');
        http.expectOne('/api/v1/objectives/templates/t1/use').flush(null, { status: 404, statusText: 'Not Found' });

        expect(await using).toBeNull();
      });
    });

    describe('recent objectives and display settings', () => {
      it('remembers what was viewed, most recent first, once each, five at most', async () => {
        const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => objectiveSummary({ id }));
        await load(items);

        for (const { id } of items) store.markViewed(id);
        store.markViewed('d');
        store.markViewed('d');

        expect(store.recent().map(({ id }) => id)).toEqual(['d', 'f', 'e', 'c', 'b']);
      });

      it('leaves out of the recents what is no longer visible', async () => {
        await load([objectiveSummary({ id: 'a' })]);
        store.markViewed('a');
        store.markViewed('gone');

        expect(store.recent().map(({ id }) => id)).toEqual(['a']);
      });

      it('keeps display settings on the account, not in this browser', () => {
        const update = vi.spyOn(TestBed.inject(ObjectiveSettingsStore), 'update');
        store.updateSettings({ showPercentage: false });

        expect(update).toHaveBeenCalledExactlyOnceWith({ showPercentage: false });
        expect(store.settings().showPercentage).toBe(false);
        expect(TestBed.inject(PlanoDataStore).data().objectives.settings.showPercentage).toBe(true);
      });

      it('knows who is signed in', () => {
        expect(store.currentUserId()).toBe(ME);
      });
    });

    it('gives its date from the clock', () => {
      expect(store.today()).toBe('2026-10-15');
    });

    it('applies a metric answer as it is', async () => {
      await open(metricDetail());
      expect(store.detail()?.amount?.current).toBe(6.5);
    });
  });

  describe('importing what this browser stored', () => {
    let adapter: MemoryPlanoDataAdapter;

    beforeEach(() => {
      adapter = new MemoryPlanoDataAdapter(createMockPlanoData());
      TestBed.configureTestingModule({
        providers: [...provideObjectivesTesting(), provideSignedIn(), { provide: PLANO_DATA_ADAPTER, useValue: adapter }],
      });
      store = TestBed.inject(ObjectivesStore);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    const stored = () => adapter.load()?.objectives.items ?? [];

    it('sends everything once before loading, then forgets it', async () => {
      const count = stored().length;
      expect(count).toBeGreaterThan(0);

      const loading = store.load();
      // Nothing is read before the import has reached the server.
      http.expectNone('/api/v1/objectives');
      const request = http.expectOne('/api/v1/objectives/import');
      expect(request.request.method).toBe('POST');
      const body = request.request.body as { objectives: { localId: string }[]; offset: number };
      expect(body.objectives.map(({ localId }) => localId)).toContain('courir-10-km');
      expect(body.objectives).toHaveLength(count);
      expect(body.offset).toBe(0);
      request.flush({ imported: count });
      await settle();
      http.expectOne('/api/v1/objectives').flush([objectiveSummary()]);
      await loading;

      expect(stored()).toEqual([]);
      expect(adapter.load()?.objectives.contacts).toEqual([]);
      expect(adapter.load()?.objectives.recentIds).toEqual([]);
      expect(store.objectives()).toHaveLength(1);

      // Nothing left: the next load goes straight to the list.
      const again = store.load();
      http.expectNone('/api/v1/objectives/import');
      http.expectOne('/api/v1/objectives').flush([]);
      await again;
    });

    it('keeps everything when the import fails, still loads, and tries again next time', async () => {
      const count = stored().length;

      const loading = store.load();
      http.expectOne('/api/v1/objectives/import').flush(null, { status: 500, statusText: 'Error' });
      await settle();
      http.expectOne('/api/v1/objectives').flush([]);
      await loading;

      expect(stored()).toHaveLength(count);
      // Being stuck on this is not the user's problem to read about.
      expect(store.error()).toBe('');

      const retrying = store.load();
      http.expectOne('/api/v1/objectives/import').flush({ imported: count });
      await settle();
      http.expectOne('/api/v1/objectives').flush([]);
      await retrying;

      expect(stored()).toEqual([]);
    });

    it('sends a lot in several requests, each knowing its place, and keeps it all if one fails', async () => {
      const data = createMockPlanoData();
      const [first] = data.objectives.items;
      const big = (id: string) => ({
        ...first,
        id,
        sessions: Array.from({ length: 400 }, (_, index) => ({
          id: `s${index}`,
          date: '2026-10-01',
          status: 'done' as const,
          label: 'Une séance de course',
          value: 1,
        })),
      });
      adapter.save({ ...data, objectives: { ...data.objectives, items: [big('a'), big('b')] } });
      const stored = TestBed.inject(PlanoDataStore);
      stored.update((current) => ({ ...current, objectives: { ...current.objectives, items: [big('a'), big('b')] } }));

      const loading = store.load();
      const firstBatch = http.expectOne('/api/v1/objectives/import');
      expect(firstBatch.request.body).toMatchObject({ offset: 0, objectives: [{ localId: 'a' }] });
      firstBatch.flush({ imported: 1 });
      await settle();
      const secondBatch = http.expectOne('/api/v1/objectives/import');
      expect(secondBatch.request.body).toMatchObject({ offset: 1, objectives: [{ localId: 'b' }] });
      secondBatch.flush(null, { status: 500, statusText: 'Error' });
      await settle();
      http.expectOne('/api/v1/objectives').flush([]);
      await loading;

      // Half done: everything stays, and the next try skips what the API already has.
      expect(stored.data().objectives.items).toHaveLength(2);
    });

    it('imports once when several screens ask at the same time', async () => {
      const loading = store.load();
      const agenda = store.loadAgenda();
      const opening = store.open('obj-1');

      const requests = http.match('/api/v1/objectives/import');
      expect(requests).toHaveLength(1);
      http.expectNone('/api/v1/objectives');
      requests[0].flush({ imported: 1 });
      await settle();
      http.expectOne('/api/v1/objectives').flush([]);
      http.expectOne('/api/v1/objectives/agenda').flush([]);
      http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail());
      await Promise.all([loading, agenda, opening]);

      expect(stored()).toEqual([]);
      expect(store.detail()?.id).toBe('obj-1');
    });
  });
});
