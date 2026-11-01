import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ObjectivePreference } from './entities/objective-preference.entity';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('ObjectivePreferencesService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const create = (title: string, userId = bed.ada) =>
    bed.objectives.create(userId, objectiveDetails({ title }));
  const titles = async (userId = bed.ada) =>
    (await bed.objectives.findAll(userId)).map(({ title }) => title);

  describe('order', () => {
    it('keeps the default order until the user reorders, then follows theirs', async () => {
      const a = await create('A');
      const b = await create('B');
      const c = await create('C');
      expect(await titles()).toEqual(['A', 'B', 'C']);

      await bed.objectivePreferences.reorder(bed.ada, [c.id, a.id, b.id]);

      expect(await titles()).toEqual(['C', 'A', 'B']);
      // An objective created afterwards comes last.
      await create('D');
      expect(await titles()).toEqual(['C', 'A', 'B', 'D']);
    });

    it('puts objectives left out of a new order after the ones it places', async () => {
      const a = await create('A');
      const b = await create('B');
      const c = await create('C');
      await bed.objectivePreferences.reorder(bed.ada, [c.id, b.id, a.id]);

      await bed.objectivePreferences.reorder(bed.ada, [b.id]);

      expect((await titles())[0]).toBe('B');
    });

    it('answers 404 for an objective the user cannot see, and changes nothing', async () => {
      const mine = await create('A');
      const theirs = await create('B', bed.bob);

      await expect(
        bed.objectivePreferences.reorder(bed.ada, [theirs.id, mine.id]),
      ).rejects.toThrow(NotFoundException);
      expect(await bed.dataSource.manager.count(ObjectivePreference)).toBe(0);
    });

    it('refuses a sub-objective: it is ordered by its parent', async () => {
      const top = await bed.objectives.create(
        bed.ada,
        objectiveDetails({ children: ['Sous'] }),
      );

      await expect(
        bed.objectivePreferences.reorder(bed.ada, [top.children[0].id]),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts an empty order', async () => {
      const a = await create('A');
      await bed.objectivePreferences.reorder(bed.ada, [a.id]);

      await bed.objectivePreferences.reorder(bed.ada, []);

      expect(await titles()).toEqual(['A']);
    });
  });

  describe('update', () => {
    it('pins to the home page and changes nothing else', async () => {
      const a = await bed.objectives.create(
        bed.ada,
        objectiveDetails({ dueReminder: 'same-day' }),
      );

      const updated = await bed.objectivePreferences.update(a.id, bed.ada, {
        onHome: true,
      });

      expect(updated.onHome).toBe(true);
      expect(updated.dueReminder).toBe('same-day');
      expect((await bed.objectives.findAll(bed.ada))[0].onHome).toBe(true);
    });

    it('stores reminders and keeps the pin', async () => {
      const a = await create('A');
      await bed.objectivePreferences.update(a.id, bed.ada, { onHome: true });

      const updated = await bed.objectivePreferences.update(a.id, bed.ada, {
        reminder: { frequency: 'daily', time: '07:15', weekday: 0 },
        dueReminder: 'week-before',
      });

      expect(updated).toMatchObject({
        onHome: true,
        reminder: { frequency: 'daily', time: '07:15', weekday: 0 },
        dueReminder: 'week-before',
      });
    });

    it('keeps the place when pinning', async () => {
      const a = await create('A');
      const b = await create('B');
      await bed.objectivePreferences.reorder(bed.ada, [b.id, a.id]);

      await bed.objectivePreferences.update(a.id, bed.ada, { onHome: true });

      expect(await titles()).toEqual(['B', 'A']);
    });

    it('answers 404 for an objective the user cannot see', async () => {
      const theirs = await create('B', bed.bob);

      for (const id of [theirs.id, randomUUID()]) {
        await expect(
          bed.objectivePreferences.update(id, bed.ada, { onHome: true }),
        ).rejects.toThrow(NotFoundException);
      }
      expect(await bed.dataSource.manager.count(ObjectivePreference)).toBe(0);
    });
  });
});
