import { TestBed } from '@angular/core/testing';
import { MemoryPlanoDataAdapter, PLANO_DATA_ADAPTER } from '../../core/data/plano-data.adapter';
import { ObjectiveDraft, ObjectivesStore } from './objectives.store';
import { provideObjectivesTesting } from './objectives.testing';

const draft: ObjectiveDraft = {
  title: '  Courir un semi  ',
  category: 'health',
  tracking: 'steps',
  dueDate: '2027-04-01',
  description: ' Avant le printemps ',
  plan: '',
  reminder: { frequency: 'none', time: '09:00', weekday: 0 },
  metric: { unit: 'km', target: 21, aggregation: 'max' },
  steps: ['10 km', '  ', '15 km'],
  habitTargetDays: 30,
};

describe('ObjectivesStore', () => {
  let store: ObjectivesStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideObjectivesTesting() });
    store = TestBed.inject(ObjectivesStore);
  });

  describe('overview queries', () => {
    it('splits objectives across the four tabs', () => {
      const ids = (tab: Parameters<ObjectivesStore['query']>[0]) => store.query(tab).map((item) => item.id);

      expect(ids('all')).not.toContain('apprendre-guitare');
      expect(ids('archived')).toEqual(['apprendre-guitare']);
      // "Économiser" belongs to Camille: shared with me, so not in "Mes objectifs".
      expect(ids('mine')).not.toContain('economiser-1000');
      // Exact contents, in any order.
      expect([...ids('shared')].sort()).toEqual(['courir-10-km', 'economiser-1000']);
    });

    it('includes archived objectives in "Tous" when the setting asks for it', () => {
      store.updateSettings({ showArchived: true });
      expect(store.query('all').map((item) => item.id)).toContain('apprendre-guitare');
    });

    it('filters by status and category, then sorts', () => {
      store.filters.set({ statuses: ['active'], categories: ['health'], sort: 'progress', direction: 'desc' });

      expect(store.query('all').map((item) => item.id)).toEqual(['courir-10-km', 'mediter-30-min']);
      expect(store.activeFilterCount()).toBe(2);

      store.filters.update((filters) => ({ ...filters, statuses: [], categories: [], sort: 'title', direction: 'asc' }));
      expect(store.query('all')[0].title).toBe('Apprendre l’italien');

      store.resetFilters();
      // Default sort is by due date, earliest first.
      expect(store.query('all')[0].id).toBe('mediter-30-jours');
    });

    it('searches titles, descriptions and category names without caring about accents', () => {
      expect(store.search('economiser').map((item) => item.id)).toEqual(['economiser-1000']);
      expect(store.search('sante').length).toBe(3);
      expect(store.search('   ')).toEqual([]);
    });
  });

  describe('mutations', () => {
    it('creates an objective from a draft and keeps only the fields of its tracking mode', () => {
      const created = store.create(draft);

      expect(created).toEqual(
        expect.objectContaining({
          id: 'courir-un-semi',
          title: 'Courir un semi',
          description: 'Avant le printemps',
          ownerId: 'me',
          createdOn: '2026-10-15',
          dueReminder: 'day-before',
          metric: null,
          habit: null,
        }),
      );
      expect(created.steps.map((step) => step.label)).toEqual(['10 km', '15 km']);
      // A second objective with the same title gets a unique id.
      expect(store.create(draft).id).not.toBe('courir-un-semi');
    });

    it('creates metric and habit objectives', () => {
      const metric = store.create({ ...draft, title: 'Épargner', tracking: 'metric' });
      const habit = store.create({ ...draft, title: 'Lire', tracking: 'habit', habitTargetDays: 0 });

      expect(metric.metric).toEqual({ unit: 'km', target: 21, aggregation: 'max', sessionsTarget: 0 });
      expect(metric.steps).toEqual([]);
      // At least one day is required for a habit.
      expect(habit.habit).toEqual({ targetDays: 1, checkIns: [] });
    });

    it('completes an objective when its last step is ticked and reopens it when unticked', () => {
      store.toggleStep('apprendre-guitare', 'song');
      expect(store.find('apprendre-guitare')).toEqual(
        expect.objectContaining({ status: 'completed', completedOn: '2026-10-15' }),
      );

      store.toggleStep('apprendre-guitare', 'song');
      expect(store.find('apprendre-guitare')?.status).toBe('active');
    });

    it('adds and removes steps, ignoring blank labels', () => {
      store.addStep('apprendre-italien', '   ');
      store.addStep('apprendre-italien', 'Commander au restaurant');
      const steps = store.find('apprendre-italien')!.steps;
      expect(steps.length).toBe(6);

      store.removeStep('apprendre-italien', steps[5].id);
      expect(store.find('apprendre-italien')!.steps.length).toBe(5);
    });

    it('toggles habit check-ins but refuses future days', () => {
      const before = store.find('mediter-30-min')!.habit!.checkIns.length;
      store.toggleCheckIn('mediter-30-min', '2026-10-16');
      expect(store.find('mediter-30-min')!.habit!.checkIns.length).toBe(before);

      // Today is already checked in the seed: the first toggle unchecks it, the second restores it.
      store.toggleCheckIn('mediter-30-min', '2026-10-15');
      expect(store.find('mediter-30-min')!.habit!.checkIns).not.toContain('2026-10-15');
      store.toggleCheckIn('mediter-30-min', '2026-10-15');
      expect(store.find('mediter-30-min')!.habit!.checkIns).toContain('2026-10-15');
      // Toggling a habit on a non-habit objective changes nothing.
      store.toggleCheckIn('courir-10-km', '2026-10-15');
      expect(store.find('courir-10-km')!.habit).toBeNull();
    });

    it('keeps sessions sorted by date and removes them', () => {
      store.addSession('courir-10-km', { date: '2026-09-01', status: 'done', value: 2, label: 'Reprise' });
      const sessions = store.find('courir-10-km')!.sessions;
      expect(sessions[0].label).toBe('Reprise');

      store.removeSession('courir-10-km', sessions[0].id);
      expect(store.find('courir-10-km')!.sessions[0].label).toBe('Sortie 3 km');
    });

    it('pauses, resumes, shares and deletes objectives', () => {
      store.setPaused('courir-10-km', true);
      expect(store.find('courir-10-km')!.status).toBe('paused');
      store.setPaused('courir-10-km', false);
      expect(store.find('courir-10-km')!.status).toBe('active');

      store.share('courir-10-km', ['alex']);
      expect(store.find('courir-10-km')!.sharedWith).toEqual(['alex']);

      store.remove('courir-10-km');
      expect(store.find('courir-10-km')).toBeUndefined();
      expect(store.recent().map((item) => item.id)).not.toContain('courir-10-km');
    });

    it('adds contacts with initials and ignores blank names', () => {
      expect(store.addContact('  ')).toBeNull();
      expect(store.addContact('zoé')).toEqual(
        expect.objectContaining({ name: 'zoé', initials: 'Z' }),
      );
      expect(store.contacts().length).toBe(8);
    });

    it('keeps the five most recently viewed objectives, newest first', () => {
      store.markViewed('mediter-30-min');
      store.markViewed('mediter-30-min');
      store.markViewed('pompes-50');

      expect(store.recent().map((item) => item.id)).toEqual([
        'pompes-50', 'mediter-30-min', 'courir-10-km', 'apprendre-italien', 'economiser-1000',
      ]);
    });
  });

  it('persists every change through the data adapter', () => {
    const adapter = TestBed.inject(PLANO_DATA_ADAPTER) as MemoryPlanoDataAdapter;
    const save = vi.spyOn(adapter, 'save');
    store.updateSettings({ defaultView: 'grid' });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].objectives.settings.defaultView).toBe('grid');
    expect(adapter.load()?.objectives.settings.defaultView).toBe('grid');
  });
});
