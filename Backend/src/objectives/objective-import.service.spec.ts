import type { ImportObjectiveRequest } from '@plano/common';
import { Objective } from './entities/objective.entity';
import { stableId } from './objective-import.service';
import {
  createObjectivesTestBed,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

function local(
  changes: Partial<ImportObjectiveRequest> = {},
): ImportObjectiveRequest {
  return {
    localId: 'courir-10-km',
    title: 'Courir 10 km',
    category: 'health',
    tracking: 'metric',
    status: 'active',
    archived: false,
    createdOn: '2026-09-14',
    dueDate: '2026-11-30',
    completedOn: null,
    description: 'Une fois',
    plan: '3 par semaine',
    reminder: { frequency: 'weekly', time: '09:00', weekday: 2 },
    dueReminder: 'day-before',
    metric: { unit: 'km', target: 10, aggregation: 'max' },
    sessions: [
      {
        date: '2026-09-21',
        status: 'done',
        label: 'Sortie',
        value: 3,
        durationMinutes: 20,
      },
      {
        date: '2026-10-17',
        status: 'planned',
        label: 'Plus tard',
        value: 7,
        durationMinutes: null,
      },
    ],
    steps: [],
    habit: null,
    ...changes,
  };
}

describe('stableId', () => {
  it('gives the same valid UUID for the same parts, and another for others', () => {
    const id = stableId('ada', 'courir');
    expect(id).toBe(stableId('ada', 'courir'));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(id).not.toBe(stableId('bob', 'courir'));
  });
});

describe('ObjectiveImportService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const importOne = (changes: Partial<ImportObjectiveRequest> = {}) =>
    bed.importer.import(bed.ada, { objectives: [local(changes)] });
  const onlyObjective = async () => {
    const [top] = await bed.objectives.findAll(bed.ada);
    return bed.objectives.findOne(top.id, bed.ada);
  };

  it('imports a numeric objective with its sessions and the user’s reminders', async () => {
    expect(await importOne()).toEqual({ imported: 1 });

    const objective = await onlyObjective();
    expect(objective).toMatchObject({
      title: 'Courir 10 km',
      completion: 'metric',
      startDate: '2026-09-14',
      dueDate: '2026-11-30',
      description: 'Une fois',
      plan: '3 par semaine',
      percent: 30,
      metric: { unit: 'km', target: 10, aggregation: 'max' },
      reminder: { frequency: 'weekly', time: '09:00', weekday: 2 },
      dueReminder: 'day-before',
      role: 'owner',
    });
    expect(
      objective.sessions.map(({ label, author }) => [label, author?.id]),
    ).toEqual([
      ['Sortie', bed.ada],
      ['Plus tard', bed.ada],
    ]);
  });

  it('turns steps into sub-objectives, keeping what was done', async () => {
    await importOne({
      tracking: 'steps',
      metric: null,
      sessions: [],
      steps: [
        { label: 'Un', done: true, completedOn: '2026-10-01' },
        { label: 'Deux', done: false, completedOn: null },
      ],
    });

    const objective = await onlyObjective();
    expect(objective.completion).toBe('children');
    expect(objective.percent).toBe(50);
    expect(objective.children).toMatchObject([
      {
        title: 'Un',
        status: 'completed',
        completion: 'none',
        completedAt: '2026-10-01T12:00:00.000Z',
      },
      { title: 'Deux', status: 'active', completedAt: null },
    ]);
  });

  it('imports a habit with its days, once each', async () => {
    await importOne({
      tracking: 'habit',
      metric: null,
      sessions: [],
      habit: {
        targetDays: 4,
        checkIns: ['2026-10-01', '2026-10-02', '2026-10-02'],
      },
    });

    const objective = await onlyObjective();
    expect(objective.completion).toBe('habit');
    expect(objective.habitTargetDays).toBe(4);
    expect(objective.percent).toBe(50);
    expect(objective.checkIns).toEqual([
      { date: '2026-10-01', userId: bed.ada },
      { date: '2026-10-02', userId: bed.ada },
    ]);
  });

  it('keeps the date of a completed objective', async () => {
    await importOne({
      status: 'completed',
      completedOn: '2026-10-05',
      sessions: [
        {
          date: '2026-10-05',
          status: 'done',
          label: '',
          value: 10,
          durationMinutes: null,
        },
      ],
    });

    expect(await onlyObjective()).toMatchObject({
      status: 'completed',
      completedAt: '2026-10-05T12:00:00.000Z',
    });
  });

  it('corrects a status that contradicts the data', async () => {
    await importOne({ status: 'completed', completedOn: '2026-10-05' });

    expect(await onlyObjective()).toMatchObject({
      status: 'active',
      completedAt: null,
    });
  });

  it('keeps paused and archived objectives as they were', async () => {
    await importOne({ status: 'paused', archived: true });

    expect(await onlyObjective()).toMatchObject({
      status: 'paused',
      archived: true,
    });
  });

  it('creates nothing twice when the browser sends it again', async () => {
    await importOne();
    expect(await importOne()).toEqual({ imported: 0 });

    expect(await bed.dataSource.manager.count(Objective)).toBe(1);
  });

  it('adds what is new when part of it was imported before', async () => {
    await importOne();

    expect(
      await bed.importer.import(bed.ada, {
        objectives: [local(), local({ localId: 'autre', title: 'Autre' })],
      }),
    ).toEqual({ imported: 1 });
    expect(await bed.dataSource.manager.count(Objective)).toBe(2);
  });

  it('keeps people apart: the same local id is another objective for someone else', async () => {
    await importOne();

    expect(
      await bed.importer.import(bed.bob, { objectives: [local()] }),
    ).toEqual({ imported: 1 });
    expect(await bed.objectives.findAll(bed.bob)).toHaveLength(1);
  });

  it('keeps the browser’s order', async () => {
    await bed.importer.import(bed.ada, {
      objectives: [
        local({ localId: 'b', title: 'B' }),
        local({ localId: 'a', title: 'A' }),
        local({ localId: 'c', title: 'C' }),
      ],
    });

    expect(
      (await bed.objectives.findAll(bed.ada)).map(({ title }) => title),
    ).toEqual(['B', 'A', 'C']);
  });

  it('accepts an empty import', async () => {
    expect(await bed.importer.import(bed.ada, { objectives: [] })).toEqual({
      imported: 0,
    });
  });
});
