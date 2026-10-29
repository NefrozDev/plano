import { NotFoundException } from '@nestjs/common';
import { ListPreference } from './entities/list-preference.entity';
import { HOME_ENTRY_LIMIT } from './list-preferences.service';
import {
  createListsTestBed,
  type ListsTestBed,
} from './testing/lists-test-bed';

describe('ListPreferencesService', () => {
  let bed: ListsTestBed;

  beforeEach(async () => {
    bed = await createListsTestBed();
  });

  afterEach(() => bed.destroy());

  const createList = (name: string, userId = bed.ada) =>
    bed.lists.create(userId, { name, icon: 'cart', color: '#2ecb70' });
  const names = async (userId: string) =>
    (await bed.lists.findAll(userId)).map(({ name }) => name);
  /** Ada's list shared with Bob (they are in the same group). */
  const shareWithBob = (listId: string) =>
    bed.lists.addMember(listId, bed.ada, { userId: bed.bob, role: 'editor' });

  describe('order', () => {
    it('keeps the default order until the user reorders, then follows theirs', async () => {
      const courses = await createList('Courses');
      const maison = await createList('Maison');
      const voyage = await createList('Voyage');
      expect(await names(bed.ada)).toEqual(['Courses', 'Maison', 'Voyage']);

      await bed.preferences.reorder(bed.ada, [
        voyage.id,
        courses.id,
        maison.id,
      ]);

      expect(await names(bed.ada)).toEqual(['Voyage', 'Courses', 'Maison']);
      // A list created afterwards comes last.
      await createList('Cadeaux');
      expect(await names(bed.ada)).toEqual([
        'Voyage',
        'Courses',
        'Maison',
        'Cadeaux',
      ]);
    });

    it('puts lists left out of a new order after the ones it places', async () => {
      const courses = await createList('Courses');
      const maison = await createList('Maison');
      const voyage = await createList('Voyage');
      await bed.preferences.reorder(bed.ada, [
        voyage.id,
        maison.id,
        courses.id,
      ]);

      await bed.preferences.reorder(bed.ada, [maison.id]);

      // Voyage and Courses lost their places: default order after Maison.
      expect(await names(bed.ada)).toEqual(['Maison', 'Courses', 'Voyage']);
    });

    it('orders shared lists for each member separately', async () => {
      const courses = await createList('Courses');
      const maison = await createList('Maison');
      await shareWithBob(courses.id);
      await shareWithBob(maison.id);

      await bed.preferences.reorder(bed.bob, [maison.id, courses.id]);

      expect(await names(bed.bob)).toEqual(['Maison', 'Courses']);
      expect(await names(bed.ada)).toEqual(['Courses', 'Maison']);
    });

    it('refuses lists the user cannot open, changing nothing', async () => {
      const courses = await createList('Courses');
      const maison = await createList('Maison');
      const secret = await createList('Secret', bed.cyd);
      await bed.preferences.reorder(bed.ada, [maison.id, courses.id]);

      await expect(
        bed.preferences.reorder(bed.ada, [courses.id, secret.id]),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(await names(bed.ada)).toEqual(['Maison', 'Courses']);
      await expect(
        bed.dataSource.manager.count(ListPreference, {
          where: { userId: bed.ada, listId: secret.id },
        }),
      ).resolves.toBe(0);
    });
  });

  describe('home page', () => {
    it('pins lists for the user only, and keeps the pin when reordering', async () => {
      const courses = await createList('Courses');
      await shareWithBob(courses.id);

      await bed.preferences.setOnHome(bed.bob, courses.id, true);

      const forBob = await bed.lists.findAll(bed.bob);
      const forAda = await bed.lists.findAll(bed.ada);
      expect(forBob.map(({ onHome }) => onHome)).toEqual([true]);
      expect(forAda.map(({ onHome }) => onHome)).toEqual([false]);
      await expect(bed.lists.findOne(courses.id, bed.bob)).resolves.toEqual(
        expect.objectContaining({ onHome: true }),
      );

      await bed.preferences.reorder(bed.bob, [courses.id]);
      await expect(bed.lists.findOne(courses.id, bed.bob)).resolves.toEqual(
        expect.objectContaining({ onHome: true }),
      );

      await bed.preferences.setOnHome(bed.bob, courses.id, false);
      await expect(bed.preferences.home(bed.bob)).resolves.toEqual([]);
    });

    it('refuses to pin a list the user cannot open', async () => {
      const secret = await createList('Secret', bed.cyd);

      await expect(
        bed.preferences.setOnHome(bed.ada, secret.id, true),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(bed.dataSource.manager.count(ListPreference)).resolves.toBe(
        0,
      );
    });

    it('serves pinned, unarchived lists in order with their first unchecked items', async () => {
      const courses = await createList('Courses');
      const maison = await createList('Maison');
      const archived = await createList('Archivée');
      await createList('Pas épinglée');
      const fresh = await bed.content.addSection(courses.id, bed.ada, {
        name: 'Frais',
        color: '#23c666',
      });
      const dry = await bed.content.addSection(courses.id, bed.ada, {
        name: 'Sec',
        color: '#3264ed',
      });
      // Added out of display order: Sec's item first, then Frais's.
      await bed.content.addEntry(courses.id, dry.id, bed.ada, { name: 'Riz' });
      const milk = await bed.content.addEntry(courses.id, fresh.id, bed.ada, {
        name: 'Lait',
      });
      await bed.content.addEntry(courses.id, fresh.id, bed.ada, {
        name: 'Œufs',
      });
      await bed.content.updateEntry(courses.id, milk.id, bed.ada, {
        done: true,
      });
      for (let index = 0; index < HOME_ENTRY_LIMIT + 2; index += 1) {
        await bed.content.addEntry(courses.id, dry.id, bed.ada, {
          name: `Pâtes ${index}`,
        });
      }
      for (const list of [courses, maison, archived]) {
        await bed.preferences.setOnHome(bed.ada, list.id, true);
      }
      await bed.lists.update(archived.id, bed.ada, { archived: true });
      await bed.preferences.reorder(bed.ada, [maison.id, courses.id]);

      const home = await bed.preferences.home(bed.ada);

      expect(home.map(({ name }) => name)).toEqual(['Maison', 'Courses']);
      expect(home[0]).toEqual({
        id: maison.id,
        name: 'Maison',
        icon: 'cart',
        color: '#2ecb70',
        role: 'owner',
        remaining: 0,
        entries: [],
      });
      // Frais before Sec, done items left out, capped at the limit.
      expect(home[1].remaining).toBe(1 + 1 + HOME_ENTRY_LIMIT + 2);
      expect(home[1].entries.map(({ name }) => name)).toEqual([
        'Œufs',
        'Riz',
        'Pâtes 0',
        'Pâtes 1',
        'Pâtes 2',
      ]);
      expect(home[1].entries).toHaveLength(HOME_ENTRY_LIMIT);
    });

    it('drops a pinned list once its owner is no longer a contact', async () => {
      const courses = await createList('Courses');
      await shareWithBob(courses.id);
      await bed.preferences.setOnHome(bed.bob, courses.id, true);
      expect(await bed.preferences.home(bed.bob)).toHaveLength(1);

      await bed.leaveGroup(bed.bob);

      await expect(bed.preferences.home(bed.bob)).resolves.toEqual([]);
    });

    it('answers an empty home without querying entries', async () => {
      await createList('Courses');

      await expect(bed.preferences.home(bed.ada)).resolves.toEqual([]);
    });
  });
});
