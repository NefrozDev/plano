import type {
  CreateObjectiveRequest,
  ObjectiveRecurrence,
} from '@plano/common';
import { ObjectivePeriod } from './entities/objective-period.entity';
import { periodStartAfter } from './objective-recurrence.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('periodStartAfter', () => {
  it('goes a week on', () => {
    expect(periodStartAfter('2026-10-01', 'weekly')).toBe('2026-10-08');
    expect(periodStartAfter('2026-10-01', 'weekly', 2)).toBe('2026-10-15');
  });

  it('goes to the same day of the next month, or the last one of a shorter month', () => {
    expect(periodStartAfter('2026-10-15', 'monthly')).toBe('2026-11-15');
    expect(periodStartAfter('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(periodStartAfter('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(periodStartAfter('2026-12-15', 'monthly')).toBe('2027-01-15');
  });

  it('goes a year on', () => {
    expect(periodStartAfter('2026-10-15', 'yearly')).toBe('2027-10-15');
    expect(periodStartAfter('2024-02-29', 'yearly')).toBe('2025-02-28');
  });
});

describe('ObjectiveRecurrenceService', () => {
  let bed: ObjectivesTestBed;

  /** Periods depend on today: only the date is frozen, timers keep running for the database. */
  const setToday = (date: string) => vi.setSystemTime(`${date}T12:00:00Z`);

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setToday('2026-10-01');
    bed = await createObjectivesTestBed();
  });

  afterEach(async () => {
    await bed.destroy();
    vi.useRealTimers();
  });

  const create = (changes: Partial<CreateObjectiveRequest> = {}) =>
    bed.objectives.create(bed.ada, objectiveDetails(changes));
  const recurring = (
    recurrence: ObjectiveRecurrence = 'weekly',
    changes: Partial<CreateObjectiveRequest> = {},
  ) => create({ recurrence, startDate: '2026-10-01', ...changes });
  const restart = (id: string, today: string) =>
    bed.recurrence.restartDue([id], today);
  const read = (id: string) => bed.objectives.findOne(id, bed.ada);
  const session = (date: string, value = 5) => ({
    date,
    status: 'done' as const,
    label: 'Sortie',
    value,
  });

  describe('settings', () => {
    it('starts the first period with the objective', async () => {
      const objective = await recurring('monthly');

      expect(objective.recurrence).toBe('monthly');
      expect(objective.periods).toEqual([]);
    });

    it('is off by default', async () => {
      expect((await create()).recurrence).toBe('none');
    });

    it('is for top-level objectives only', async () => {
      const top = await create();

      await expect(
        create({ parentId: top.id, recurrence: 'weekly' }),
      ).rejects.toThrow('Only a top-level goal');
      const child = await create({ parentId: top.id });
      await expect(
        bed.objectives.update(child.id, bed.ada, { recurrence: 'weekly' }),
      ).rejects.toThrow('Only a top-level goal');
    });

    it('starts a new period today when turned on later, without losing anything yet', async () => {
      const objective = await create({
        startDate: '2020-01-01',
        completion: 'manual',
      });
      await bed.tracking.setProgress(objective.id, bed.ada, { percent: 40 });

      const updated = await bed.objectives.update(objective.id, bed.ada, {
        recurrence: 'monthly',
      });

      // Started years ago, but nothing restarts on the next read.
      expect(updated.percent).toBe(40);
      expect((await read(objective.id)).periods).toEqual([]);
    });

    it('can be turned off, which counts everything again', async () => {
      const objective = await recurring('weekly', {
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });
      await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session('2026-10-02'),
      );
      await restart(objective.id, '2026-10-09');
      expect((await read(objective.id)).percent).toBe(0);

      const updated = await bed.objectives.update(objective.id, bed.ada, {
        recurrence: 'none',
      });

      expect(updated.percent).toBe(50);
    });
  });

  describe('restarting', () => {
    it('does nothing before the period is over', async () => {
      const objective = await recurring('weekly', { completion: 'manual' });
      await bed.tracking.setProgress(objective.id, bed.ada, { percent: 40 });

      await restart(objective.id, '2026-10-07');

      const seen = await read(objective.id);
      expect(seen.percent).toBe(40);
      expect(seen.periods).toEqual([]);
    });

    it('keeps the result, and starts again from zero', async () => {
      const objective = await recurring('weekly', {
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });
      await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session('2026-10-02', 10),
      );
      expect((await read(objective.id)).status).toBe('completed');

      await restart(objective.id, '2026-10-08');

      const seen = await read(objective.id);
      expect(seen).toMatchObject({
        percent: 0,
        status: 'active',
        completedAt: null,
        completedBy: null,
        startDate: '2026-10-08',
        amount: { current: 0 },
      });
      expect(seen.periods).toEqual([
        {
          startDate: '2026-10-01',
          endDate: '2026-10-07',
          percent: 100,
          completed: true,
        },
      ]);
      // What was logged stays, for the calendar and the stats.
      expect(seen.sessions).toHaveLength(1);
      expect(seen.contributions).toEqual([]);
    });

    it('counts only what falls in the current period', async () => {
      const objective = await recurring('weekly', {
        completion: 'habit',
        habitTargetDays: 2,
      });
      await bed.tracking.setCheckIn(objective.id, '2026-10-02', bed.ada, true);
      await restart(objective.id, '2026-10-08');
      setToday('2026-10-09');

      const seen = await bed.tracking.setCheckIn(
        objective.id,
        '2026-10-09',
        bed.ada,
        true,
      );

      expect(seen.percent).toBe(50);
      expect(seen.amount?.current).toBe(1);
      expect(seen.checkIns).toHaveLength(2);
    });

    it('resets the whole tree, and moves the deadlines with it', async () => {
      const top = await recurring('weekly', {
        completion: 'children',
        dueDate: '2026-10-07',
        timelapse: 'elapsed',
      });
      const manual = await create({
        parentId: top.id,
        completion: 'manual',
        startDate: '2026-10-01',
        dueDate: '2026-10-05',
      });
      const plain = await create({
        parentId: top.id,
        startDate: '2026-10-01',
      });
      await bed.tracking.setProgress(manual.id, bed.ada, { percent: 100 });
      await bed.tracking.setCompleted(plain.id, bed.ada, { completed: true });
      expect((await read(top.id)).status).toBe('completed');

      await restart(top.id, '2026-10-08');

      const seen = await read(top.id);
      expect(seen).toMatchObject({
        percent: 0,
        status: 'active',
        startDate: '2026-10-08',
        dueDate: '2026-10-14',
      });
      expect(await read(manual.id)).toMatchObject({
        percent: 0,
        manualProgress: 0,
        status: 'active',
        dueDate: '2026-10-12',
      });
      expect(await read(plain.id)).toMatchObject({
        status: 'active',
        completedAt: null,
      });
    });

    it('keeps a pause', async () => {
      const objective = await recurring('weekly');
      await bed.objectives.update(objective.id, bed.ada, { paused: true });

      await restart(objective.id, '2026-10-08');

      expect((await read(objective.id)).status).toBe('paused');
    });

    it('catches up on several periods, recording what actually ended', async () => {
      const objective = await recurring('weekly', { completion: 'manual' });
      await bed.tracking.setProgress(objective.id, bed.ada, { percent: 30 });

      await restart(objective.id, '2026-10-30');

      const seen = await read(objective.id);
      expect(seen.startDate).toBe('2026-10-29');
      expect(seen.periods).toEqual([
        {
          startDate: '2026-10-01',
          endDate: '2026-10-07',
          percent: 30,
          completed: false,
        },
      ]);
    });

    it('restarts once, even when asked twice', async () => {
      const objective = await recurring('weekly');

      await Promise.all([
        restart(objective.id, '2026-10-08'),
        restart(objective.id, '2026-10-08'),
      ]);
      await restart(objective.id, '2026-10-08');

      expect(await bed.dataSource.manager.count(ObjectivePeriod)).toBe(1);
    });

    it('records no bar for an objective without one', async () => {
      const objective = await recurring('weekly');

      await restart(objective.id, '2026-10-08');

      expect((await read(objective.id)).periods[0]).toMatchObject({
        percent: null,
        completed: false,
      });
    });

    it('lists the latest period first', async () => {
      const objective = await recurring('weekly');

      await restart(objective.id, '2026-10-08');
      await restart(objective.id, '2026-10-15');

      expect(
        (await read(objective.id)).periods.map(({ startDate }) => startDate),
      ).toEqual(['2026-10-08', '2026-10-01']);
    });

    it('tells who is concerned, and says so in the history', async () => {
      const objective = await recurring('weekly', {
        members: [{ userId: bed.bob, role: 'viewer' }],
      });
      const publish = vi.spyOn(bed.live, 'publish');

      await restart(objective.id, '2026-10-08');

      expect(publish).toHaveBeenCalledWith(
        expect.arrayContaining([bed.ada, bed.bob]),
        { type: 'objective.changed', objectiveId: objective.id },
      );
      const [latest] = await bed.activity.history(objective.id, bed.ada);
      expect(latest).toMatchObject({ kind: 'restarted', actor: null });
    });

    it('settles what the new period already holds', async () => {
      const objective = await recurring('weekly', {
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });
      setToday('2026-10-07');
      await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session('2026-10-08', 10),
      );

      await restart(objective.id, '2026-10-08');

      expect(await read(objective.id)).toMatchObject({
        percent: 100,
        status: 'completed',
      });
    });

    it('ignores what does not recur, or is gone', async () => {
      const objective = await create();

      await restart(objective.id, '2099-01-01');
      await bed.recurrence.restartDue([]);
      await restart('00000000-0000-4000-8000-000000000000', '2099-01-01');

      expect(await bed.dataSource.manager.count(ObjectivePeriod)).toBe(0);
    });
  });

  describe('on the way to the screens', () => {
    /** Started long ago: its period is over whatever today is. */
    const overdue = () => recurring('weekly', { startDate: '2020-01-02' });
    const periods = () => bed.dataSource.manager.count(ObjectivePeriod);

    it('restarts when listed', async () => {
      await overdue();
      await bed.objectives.findAll(bed.ada);
      expect(await periods()).toBe(1);
    });

    it('restarts when opened, even from a sub-objective', async () => {
      const top = await overdue();
      const child = await create({ parentId: top.id });
      await bed.objectives.findOne(child.id, bed.ada);
      expect(await periods()).toBe(1);
    });

    it('restarts for the home page and the agenda', async () => {
      const top = await overdue();
      await bed.objectivePreferences.update(top.id, bed.ada, { onHome: true });
      await bed.objectivePreferences.home(bed.ada);
      expect(await periods()).toBe(1);

      await overdue();
      await bed.agenda.find(bed.ada);
      expect(await periods()).toBe(2);
    });
  });

  describe('restarting by hand', () => {
    const create = (changes = {}) =>
      bed.objectives.create(
        bed.ada,
        objectiveDetails({
          title: 'Voyage',
          startDate: '2026-10-01',
          ...changes,
        }),
      );

    it('starts a finished objective again today, its result kept in its history', async () => {
      setToday('2026-10-20');
      const objective = await create({
        completion: 'manual',
        dueDate: '2026-10-31',
      });
      await bed.tracking.setProgress(objective.id, bed.ada, { percent: 100 });

      await bed.recurrence.restartNow(objective.id, bed.ada);

      const restarted = await bed.objectives.findOne(objective.id, bed.ada);
      expect(restarted).toMatchObject({
        status: 'active',
        percent: 0,
        completedAt: null,
        recurrence: 'none',
        startDate: '2026-10-20',
        dueDate: '2026-11-19',
      });
      expect(restarted.periods).toEqual([
        {
          startDate: '2026-10-01',
          endDate: '2026-10-20',
          percent: 100,
          completed: true,
        },
      ]);
      expect(
        (await bed.activity.history(objective.id, bed.ada)).map(
          ({ kind }) => kind,
        ),
      ).toContain('restarted');
    });

    it('stops counting what was done before', async () => {
      setToday('2026-10-20');
      const objective = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });
      await bed.tracking.addSession(objective.id, bed.ada, {
        date: '2026-10-05',
        status: 'done',
        label: '',
        value: 10,
      });

      await bed.recurrence.restartNow(objective.id, bed.ada);

      expect(await bed.objectives.findOne(objective.id, bed.ada)).toMatchObject(
        { percent: 0, status: 'active' },
      );
    });

    it('unchecks the lists that make the bar, not the lists linked as shortcuts', async () => {
      setToday('2026-10-20');
      const objective = await create({ completion: 'list' });
      const shortcut = await create({ title: 'Lire', completion: 'manual' });
      const packing = await bed.lists.create(bed.ada, {
        name: 'Valise',
        icon: 'suitcase',
        color: '#3264ed',
      });
      const reading = await bed.lists.create(bed.ada, {
        name: 'Livres',
        icon: 'home',
        color: '#3264ed',
      });
      await bed.objectiveLists.link(objective.id, bed.ada, packing.id);
      await bed.objectiveLists.link(shortcut.id, bed.ada, reading.id);
      for (const list of [packing, reading]) {
        const section = await bed.content.addSection(list.id, bed.ada, {
          name: 'Tout',
          color: '#3264ed',
        });
        const entry = await bed.content.addEntry(list.id, section.id, bed.ada, {
          name: 'Un',
        });
        await bed.content.updateEntry(list.id, entry.id, bed.ada, {
          done: true,
        });
      }
      await vi.waitFor(async () =>
        expect(
          (await bed.objectives.findOne(objective.id, bed.ada)).status,
        ).toBe('completed'),
      );

      await bed.recurrence.restartNow(objective.id, bed.ada);

      const done = async (listId: string) =>
        (await bed.lists.findOne(listId, bed.ada)).sections
          .flatMap(({ entries }) => entries)
          .map((entry) => entry.done);
      expect(await done(packing.id)).toEqual([false]);
      expect(await done(reading.id)).toEqual([true]);
      expect(await bed.objectives.findOne(objective.id, bed.ada)).toMatchObject(
        { status: 'active', percent: 0 },
      );
    });

    it('refuses a sub-objective and anyone but the owner, changing nothing', async () => {
      setToday('2026-10-20');
      const top = await create({ completion: 'children' });
      const step = await create({ parentId: top.id, completion: 'manual' });
      await bed.members.add(top.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });

      await expect(bed.recurrence.restartNow(step.id, bed.ada)).rejects.toThrow(
        'Only a top-level goal',
      );
      await expect(
        bed.recurrence.restartNow(top.id, bed.bob),
      ).rejects.toThrow();

      expect((await bed.objectives.findOne(top.id, bed.ada)).periods).toEqual(
        [],
      );
    });
  });
});
