import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CreateObjectiveRequest, ObjectiveDetail } from '@plano/common';
import { randomUUID } from 'node:crypto';
import { Objective } from './entities/objective.entity';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { MAX_OBJECTIVE_LEVELS, MAX_TREE_NODES } from './objective-tree';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('ObjectivesService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const create = (
    changes: Partial<CreateObjectiveRequest> = {},
    userId = bed.ada,
  ): Promise<ObjectiveDetail> =>
    bed.objectives.create(userId, objectiveDetails(changes));
  const row = (id: string) =>
    bed.dataSource.manager.findOneByOrFail(Objective, { id });

  describe('create', () => {
    it('creates a private top-level objective, with defaults', async () => {
      const objective = await create();

      expect(objective).toMatchObject({
        parentId: null,
        title: 'Courir',
        category: 'health',
        status: 'active',
        archived: false,
        completion: 'none',
        percent: null,
        amount: null,
        timelapse: 'off',
        startDate: '2026-10-01',
        dueDate: null,
        completedAt: null,
        weight: 1,
        role: 'owner',
        owner: { id: bed.ada, name: 'Ada Test', avatarVersion: null },
        childCount: 0,
        completedChildCount: 0,
        onHome: false,
        description: '',
        plan: '',
        metric: null,
        habitTargetDays: null,
        manualProgress: 0,
        breadcrumb: [],
        children: [],
        descendantCount: 0,
        sessions: [],
        checkIns: [],
        reminder: { frequency: 'none', time: '09:00', weekday: 0 },
        dueReminder: 'none',
      });
      expect((await row(objective.id)).rootId).toBe(objective.id);
    });

    it('creates the sub-objectives given with it, in order and without a bar', async () => {
      const objective = await create({
        completion: 'children',
        children: ['10 km', '15 km'],
      });

      expect(objective.children.map(({ title }) => title)).toEqual([
        '10 km',
        '15 km',
      ]);
      expect(objective.children[0]).toMatchObject({
        parentId: objective.id,
        category: 'health',
        completion: 'none',
        percent: null,
      });
      expect(objective.childCount).toBe(2);
      expect(objective.percent).toBe(0);
    });

    it('stores the settings of each completion mode', async () => {
      const metric = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'max' },
      });
      expect(metric.metric).toEqual({
        unit: 'km',
        target: 10,
        aggregation: 'max',
      });
      expect(metric.percent).toBe(0);
      expect(metric.amount).toEqual({ current: 0, target: 10, unit: 'km' });

      const habit = await create({ completion: 'habit', habitTargetDays: 30 });
      expect(habit.habitTargetDays).toBe(30);
      expect(habit.percent).toBe(0);

      const manual = await create({ completion: 'manual' });
      expect(manual.percent).toBe(0);
    });

    it('keeps the creator’s reminders on their own preference row', async () => {
      const objective = await create({
        reminder: { frequency: 'weekly', time: '18:30', weekday: 2 },
        dueReminder: 'day-before',
      });

      expect(objective.reminder).toEqual({
        frequency: 'weekly',
        time: '18:30',
        weekday: 2,
      });
      expect(objective.dueReminder).toBe('day-before');
      expect(
        await bed.dataSource.manager.findOneByOrFail(ObjectivePreference, {
          objectiveId: objective.id,
        }),
      ).toMatchObject({ userId: bed.ada, reminderFrequency: 'weekly' });
    });

    it.each<[string, Partial<CreateObjectiveRequest>]>([
      ['a metric without a target', { completion: 'metric' }],
      ['a habit without a number of days', { completion: 'habit' }],
      [
        'a deadline before the start',
        { startDate: '2026-10-10', dueDate: '2026-10-01' },
      ],
      ['a timelapse bar without a deadline', { timelapse: 'elapsed' }],
    ])('refuses %s, and stores nothing', async (_, changes) => {
      await expect(create(changes)).rejects.toThrow(BadRequestException);
      expect(await bed.dataSource.manager.count(Objective)).toBe(0);
    });

    it('accepts a timelapse bar with a deadline', async () => {
      const objective = await create({
        timelapse: 'remaining',
        dueDate: '2026-12-01',
      });
      expect(objective).toMatchObject({
        timelapse: 'remaining',
        dueDate: '2026-12-01',
      });
    });
  });

  describe('sub-objectives', () => {
    it('puts a new sub-objective last under its parent, in the same tree', async () => {
      const top = await create({ completion: 'children', children: ['Un'] });
      const child = await create({ parentId: top.id, title: 'Deux' });

      expect(child.parentId).toBe(top.id);
      expect(child.breadcrumb).toEqual([{ id: top.id, title: 'Courir' }]);
      expect((await row(child.id)).rootId).toBe(top.id);
      const reloaded = await bed.objectives.findOne(top.id, bed.ada);
      expect(reloaded.children.map(({ title }) => title)).toEqual([
        'Un',
        'Deux',
      ]);
    });

    it('shows the whole way down, and counts everything below', async () => {
      const top = await create({ title: 'A' });
      const middle = await create({ title: 'B', parentId: top.id });
      const bottom = await create({ title: 'C', parentId: middle.id });

      expect(bottom.breadcrumb.map(({ title }) => title)).toEqual(['A', 'B']);
      expect(
        (await bed.objectives.findOne(top.id, bed.ada)).descendantCount,
      ).toBe(2);
    });

    it('stops at the level limit', async () => {
      let parent = await create();
      for (let level = 2; level <= MAX_OBJECTIVE_LEVELS; level += 1) {
        parent = await create({ parentId: parent.id });
      }

      await expect(create({ parentId: parent.id })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('counts the sub-objectives created along when checking the limit', async () => {
      let parent = await create();
      for (let level = 2; level < MAX_OBJECTIVE_LEVELS; level += 1) {
        parent = await create({ parentId: parent.id });
      }

      await expect(
        create({ parentId: parent.id, children: ['Trop bas'] }),
      ).rejects.toThrow(BadRequestException);
      await expect(create({ parentId: parent.id })).resolves.toBeDefined();
    });

    it('stops at the size limit of a tree', async () => {
      const top = await create();
      await bed.dataSource.manager.insert(
        Objective,
        Array.from({ length: MAX_TREE_NODES - 1 }, (_, position) => ({
          id: randomUUID(),
          rootId: top.id,
          parentId: top.id,
          ownerId: bed.ada,
          title: 'Un de plus',
          category: 'other' as const,
          completion: 'none' as const,
          startDate: '2026-10-01',
          position,
        })),
      );

      await expect(create({ parentId: top.id })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('answers 404 for a parent the user cannot see', async () => {
      const top = await create();

      await expect(create({ parentId: top.id }, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
      await expect(create({ parentId: randomUUID() })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('reorders the children when each is named once', async () => {
      const top = await create({ children: ['Un', 'Deux', 'Trois'] });
      const [one, two, three] = top.children.map(({ id }) => id);

      const reordered = await bed.objectives.reorderChildren(top.id, bed.ada, {
        objectiveIds: [three, one, two],
      });

      expect(reordered.children.map(({ title }) => title)).toEqual([
        'Trois',
        'Un',
        'Deux',
      ]);
    });

    it('refuses an order that does not name each child', async () => {
      const top = await create({ children: ['Un', 'Deux'] });
      const [one] = top.children.map(({ id }) => id);

      for (const objectiveIds of [[one], [one, randomUUID()]]) {
        await expect(
          bed.objectives.reorderChildren(top.id, bed.ada, { objectiveIds }),
        ).rejects.toThrow(BadRequestException);
      }
      const unchanged = await bed.objectives.findOne(top.id, bed.ada);
      expect(unchanged.children.map(({ title }) => title)).toEqual([
        'Un',
        'Deux',
      ]);
    });
  });

  describe('reading', () => {
    it('lists only the top of the user’s own trees', async () => {
      const top = await create({ title: 'Mien', children: ['Sous'] });
      await create({ title: 'Autre' }, bed.bob);

      const objectives = await bed.objectives.findAll(bed.ada);

      expect(objectives.map(({ id }) => id)).toEqual([top.id]);
      expect(objectives[0]).not.toHaveProperty('children');
    });

    it('answers 404 for someone else’s objective or an unknown id', async () => {
      const objective = await create();

      await expect(
        bed.objectives.findOne(objective.id, bed.bob),
      ).rejects.toThrow(NotFoundException);
      await expect(
        bed.objectives.findOne(randomUUID(), bed.ada),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('changes only the fields sent', async () => {
      const objective = await create({ dueDate: '2026-12-01' });

      const updated = await bed.objectives.update(objective.id, bed.ada, {
        title: 'Courir vite',
        plan: '3 fois par semaine',
      });

      expect(updated).toMatchObject({
        title: 'Courir vite',
        plan: '3 fois par semaine',
        dueDate: '2026-12-01',
        category: 'health',
      });
    });

    it('clears the settings of the mode it leaves', async () => {
      const objective = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });

      const updated = await bed.objectives.update(objective.id, bed.ada, {
        completion: 'manual',
      });

      expect(updated.metric).toBeNull();
      expect(await row(objective.id)).toMatchObject({
        metricUnit: null,
        metricTarget: null,
        metricAggregation: null,
      });
    });

    it('refuses settings that do not fit together, and keeps the old ones', async () => {
      const objective = await create({
        timelapse: 'elapsed',
        dueDate: '2026-12-01',
      });

      await expect(
        bed.objectives.update(objective.id, bed.ada, { dueDate: null }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        bed.objectives.update(objective.id, bed.ada, {
          completion: 'metric',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(await row(objective.id)).toMatchObject({
        dueDate: '2026-12-01',
        completion: 'none',
      });
    });

    it('pauses and resumes', async () => {
      const objective = await create();

      const paused = await bed.objectives.update(objective.id, bed.ada, {
        paused: true,
      });
      expect(paused.status).toBe('paused');

      const resumed = await bed.objectives.update(objective.id, bed.ada, {
        paused: false,
      });
      expect(resumed.status).toBe('active');
    });

    it('completes on resuming when the bar is already full', async () => {
      const objective = await create({ completion: 'manual' });
      await bed.objectives.update(objective.id, bed.ada, { paused: true });
      await bed.tracking.setProgress(objective.id, bed.ada, { percent: 100 });
      expect((await bed.objectives.findOne(objective.id, bed.ada)).status).toBe(
        'paused',
      );

      const resumed = await bed.objectives.update(objective.id, bed.ada, {
        paused: false,
      });

      expect(resumed.status).toBe('completed');
    });

    it('does not pause what is complete', async () => {
      const objective = await create();
      await bed.tracking.setCompleted(objective.id, bed.ada, {
        completed: true,
      });

      await expect(
        bed.objectives.update(objective.id, bed.ada, { paused: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('leaves a completed objective alone when resuming', async () => {
      const objective = await create();
      await bed.tracking.setCompleted(objective.id, bed.ada, {
        completed: true,
      });

      const updated = await bed.objectives.update(objective.id, bed.ada, {
        paused: false,
      });

      expect(updated.status).toBe('completed');
    });

    it('archives', async () => {
      const objective = await create();

      const archived = await bed.objectives.update(objective.id, bed.ada, {
        archived: true,
      });

      expect(archived.archived).toBe(true);
    });

    it('recomputes the parent when a weight or an archive changes the balance', async () => {
      const top = await create({ completion: 'children' });
      const done = await create({ parentId: top.id, title: 'Fait' });
      const open = await create({ parentId: top.id, title: 'Ouvert' });
      await bed.tracking.setCompleted(done.id, bed.ada, { completed: true });
      expect((await bed.objectives.findOne(top.id, bed.ada)).percent).toBe(50);

      await bed.objectives.update(open.id, bed.ada, { weight: 3 });
      expect((await bed.objectives.findOne(top.id, bed.ada)).percent).toBe(25);

      await bed.objectives.update(open.id, bed.ada, { archived: true });
      const reloaded = await bed.objectives.findOne(top.id, bed.ada);
      expect(reloaded.percent).toBe(100);
      expect(reloaded.status).toBe('completed');
      expect(reloaded.childCount).toBe(1);
    });

    it('answers 404 to someone who cannot see it, and changes nothing', async () => {
      const objective = await create();

      await expect(
        bed.objectives.update(objective.id, bed.bob, { title: 'Volé' }),
      ).rejects.toThrow(NotFoundException);
      expect((await row(objective.id)).title).toBe('Courir');
    });
  });

  describe('remove', () => {
    it('takes everything below with it', async () => {
      const top = await create({ children: ['Un'] });
      const child = top.children[0];
      await create({ parentId: child.id, title: 'Tout en bas' });

      await bed.objectives.remove(top.id, bed.ada);

      expect(await bed.dataSource.manager.count(Objective)).toBe(0);
    });

    it('settles the parent once a sub-objective is gone', async () => {
      const top = await create({ completion: 'children' });
      const done = await create({ parentId: top.id });
      const open = await create({ parentId: top.id });
      await bed.tracking.setCompleted(done.id, bed.ada, { completed: true });

      await bed.objectives.remove(open.id, bed.ada);

      const reloaded = await bed.objectives.findOne(top.id, bed.ada);
      expect(reloaded.percent).toBe(100);
      expect(reloaded.status).toBe('completed');
    });

    it('answers 404 to someone who cannot see it, and deletes nothing', async () => {
      const objective = await create();

      await expect(
        bed.objectives.remove(objective.id, bed.bob),
      ).rejects.toThrow(NotFoundException);
      expect(await bed.dataSource.manager.count(Objective)).toBe(1);
    });
  });
});
