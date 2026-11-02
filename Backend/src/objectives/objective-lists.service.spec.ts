import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ObjectiveDetail } from '@plano/common';
import { List } from '../lists/entities/list.entity';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

/** Real services on a fresh database: lists linked to objectives, and the bars they make. */
describe('ObjectiveListsService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const create = (changes = {}) =>
    bed.objectives.create(
      bed.ada,
      objectiveDetails({ title: 'Voyage', ...changes }),
    );
  const newList = (userId = bed.ada, name = 'Valise') =>
    bed.lists.create(userId, { name, icon: 'suitcase', color: '#3264ed' });
  async function addItems(listId: string, userId: string, names: string[]) {
    const section = await bed.content.addSection(listId, userId, {
      name: 'Tout',
      color: '#3264ed',
    });
    const ids: string[] = [];
    for (const name of names) {
      ids.push(
        (await bed.content.addEntry(listId, section.id, userId, { name })).id,
      );
    }
    return ids;
  }
  const check = (listId: string, entryId: string, done = true) =>
    bed.content.updateEntry(listId, entryId, bed.ada, { done });
  const read = (id: string, userId = bed.ada) =>
    bed.objectives.findOne(id, userId);
  /** The bar moves after the list change is saved: wait for it. */
  const eventually = (id: string, expected: Partial<ObjectiveDetail>) =>
    vi.waitFor(async () => expect(await read(id)).toMatchObject(expected), {
      timeout: 3000,
      interval: 20,
    });

  describe('linking', () => {
    it('creates a list of the owner’s, linked at once, and shows it on the objective', async () => {
      const objective = await create();

      const detail = await bed.objectiveLists.createList(
        objective.id,
        bed.ada,
        {
          name: 'Valise',
          icon: 'suitcase',
          color: '#3264ed',
        },
      );

      expect(detail.lists).toEqual([
        {
          id: expect.any(String) as string,
          name: 'Valise',
          icon: 'suitcase',
          color: '#3264ed',
          done: 0,
          total: 0,
          removeChecked: false,
        },
      ]);
      const [summary] = await bed.lists.findAll(bed.ada);
      expect(summary).toMatchObject({
        name: 'Valise',
        ownership: 'mine',
        objectiveId: objective.id,
      });
    });

    it('links an existing list, and tells nobody else which objective it counts for', async () => {
      const objective = await create();
      const list = await newList();
      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.bob,
        role: 'editor',
      });

      const detail = await bed.objectiveLists.link(
        objective.id,
        bed.ada,
        list.id,
      );

      expect(detail.lists.map(({ id }) => id)).toEqual([list.id]);
      expect((await bed.lists.findAll(bed.bob))[0].objectiveId).toBeNull();
    });

    it('refuses someone else’s list, even shared, and a list counting for another objective', async () => {
      const objective = await create();
      const other = await create({ title: 'Lire' });
      const bobs = await newList(bed.bob, 'De Bob');
      await bed.lists.addMember(bobs.id, bed.bob, {
        userId: bed.ada,
        role: 'editor',
      });
      const mine = await newList();
      await bed.objectiveLists.link(other.id, bed.ada, mine.id);

      await expect(
        bed.objectiveLists.link(objective.id, bed.ada, bobs.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        bed.objectiveLists.link(objective.id, bed.ada, mine.id),
      ).rejects.toBeInstanceOf(ConflictException);

      expect((await read(objective.id)).lists).toEqual([]);
      expect(
        (await bed.dataSource.manager.findOneByOrFail(List, { id: bobs.id }))
          .objectiveId,
      ).toBeNull();
      expect(
        (await bed.dataSource.manager.findOneByOrFail(List, { id: mine.id }))
          .objectiveId,
      ).toBe(other.id);
    });

    it('lets only the owner link, unlink or create', async () => {
      const objective = await create();
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });
      const bobs = await newList(bed.bob, 'De Bob');

      await expect(
        bed.objectiveLists.link(objective.id, bed.bob, bobs.id),
      ).rejects.toThrow();
      await expect(
        bed.objectiveLists.createList(objective.id, bed.bob, {
          name: 'X',
          icon: 'cart',
          color: '#3264ed',
        }),
      ).rejects.toThrow();

      // Nothing was created for Bob on the way.
      expect(
        (await bed.lists.findAll(bed.bob)).map(({ name }) => name),
      ).toEqual(['De Bob']);
      expect((await read(objective.id)).lists).toEqual([]);
    });

    it('unlinks a list, which stays, and no longer counts', async () => {
      const objective = await create({ completion: 'list' });
      const list = await newList();
      await bed.objectiveLists.link(objective.id, bed.ada, list.id);
      const [milk] = await addItems(list.id, bed.ada, ['Lait', 'Pain']);
      await check(list.id, milk);
      await eventually(objective.id, { percent: 50 });

      const detail = await bed.objectiveLists.unlink(
        objective.id,
        bed.ada,
        list.id,
      );

      expect(detail.lists).toEqual([]);
      expect(detail.percent).toBe(0);
      expect((await bed.lists.findOne(list.id, bed.ada)).name).toBe('Valise');
      await expect(
        bed.objectiveLists.unlink(objective.id, bed.ada, list.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('as the bar', () => {
    it('counts the checked items of every linked list, not the lists that delete them', async () => {
      const objective = await create({ completion: 'list' });
      const clothes = await newList(bed.ada, 'Vêtements');
      const papers = await newList(bed.ada, 'Papiers');
      const shopping = await newList(bed.ada, 'Courses');
      await bed.lists.update(shopping.id, bed.ada, { removeChecked: true });
      for (const list of [clothes, papers, shopping])
        await bed.objectiveLists.link(objective.id, bed.ada, list.id);

      expect((await read(objective.id)).percent).toBe(0);

      const [shirt] = await addItems(clothes.id, bed.ada, [
        'Chemise',
        'Pull',
        'Short',
      ]);
      await addItems(papers.id, bed.ada, ['Passeport']);
      await addItems(shopping.id, bed.ada, ['Crème solaire']);
      await check(clothes.id, shirt);

      await eventually(objective.id, {
        percent: 25,
        amount: { current: 1, target: 4, unit: 'éléments' },
        status: 'active',
      });
      expect(
        (await read(objective.id)).lists.map(
          ({ name, done, total, removeChecked }) => [
            name,
            done,
            total,
            removeChecked,
          ],
        ),
      ).toEqual([
        ['Vêtements', 1, 3, false],
        ['Papiers', 0, 1, false],
        ['Courses', 0, 1, true],
      ]);
    });

    it('completes once every item is checked, tells the others, and reopens when one is unchecked', async () => {
      const objective = await create({ completion: 'list' });
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });
      const list = await newList();
      await bed.objectiveLists.link(objective.id, bed.ada, list.id);
      const [first, second] = await addItems(list.id, bed.ada, [
        'Lait',
        'Pain',
      ]);

      await check(list.id, first);
      await check(list.id, second);
      await eventually(objective.id, { status: 'completed', percent: 100 });
      await vi.waitFor(async () =>
        expect(
          (await bed.notifications.list(bed.bob)).items.map(({ kind }) => kind),
        ).toContain('objective.completed'),
      );

      await check(list.id, second, false);
      await eventually(objective.id, { status: 'active', percent: 50 });
    });

    it('moves when a linked list is deleted', async () => {
      const objective = await create({ completion: 'list' });
      const done = await newList(bed.ada, 'Faite');
      const pending = await newList(bed.ada, 'À faire');
      await bed.objectiveLists.link(objective.id, bed.ada, done.id);
      await bed.objectiveLists.link(objective.id, bed.ada, pending.id);
      const [item] = await addItems(done.id, bed.ada, ['Billets']);
      await addItems(pending.id, bed.ada, ['Valise']);
      await check(done.id, item);
      await eventually(objective.id, { percent: 50 });

      await bed.lists.remove(pending.id, bed.ada);

      await eventually(objective.id, { percent: 100, status: 'completed' });
      expect((await read(objective.id)).lists.map(({ name }) => name)).toEqual([
        'Faite',
      ]);
    });

    it('keeps the lists, unlinked, when the objective is deleted', async () => {
      const objective = await create({ completion: 'list' });
      const list = await newList();
      await bed.objectiveLists.link(objective.id, bed.ada, list.id);

      await bed.objectives.remove(objective.id, bed.ada);

      expect(
        await bed.dataSource.manager.findOneByOrFail(List, { id: list.id }),
      ).toMatchObject({
        name: 'Valise',
        objectiveId: null,
      });
    });
  });

  describe('leaks nothing', () => {
    it('shows people on the objective only the linked lists they could open anyway', async () => {
      const objective = await create({ completion: 'list' });
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });
      const secret = await newList(bed.ada, 'Secret');
      const shared = await newList(bed.ada, 'Partagée');
      await bed.lists.addMember(shared.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });
      await bed.objectiveLists.link(objective.id, bed.ada, secret.id);
      await bed.objectiveLists.link(objective.id, bed.ada, shared.id);

      const forBob = await read(objective.id, bed.bob);

      expect(forBob.lists.map(({ name }) => name)).toEqual(['Partagée']);
      expect(JSON.stringify(forBob)).not.toContain(secret.id);
      expect(JSON.stringify(forBob)).not.toContain('Secret');
      expect((await read(objective.id)).lists.map(({ name }) => name)).toEqual([
        'Secret',
        'Partagée',
      ]);
    });
  });
});
