import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ListDetail } from '@plano/common';
import {
  createListsTestBed,
  type ListsTestBed,
} from './testing/lists-test-bed';

describe('ListContentService', () => {
  let bed: ListsTestBed;
  let list: ListDetail;
  let sectionId: string;

  beforeEach(async () => {
    bed = await createListsTestBed();
    list = await bed.lists.create(bed.ada, {
      name: 'Courses',
      icon: 'cart',
      color: '#2ecb70',
    });
    sectionId = (
      await bed.content.addSection(list.id, bed.ada, {
        name: 'Frais',
        color: '#23c666',
      })
    ).id;
  });

  afterEach(() => bed.destroy());

  const names = async () =>
    (await bed.lists.findOne(list.id, bed.ada)).sections[0].entries.map(
      ({ name }) => name,
    );
  const add = (name: string, userId = bed.ada) =>
    bed.content.addEntry(list.id, sectionId, userId, { name });

  it('adds sections and entries in order, stamped with their author', async () => {
    await bed.content.addSection(list.id, bed.ada, {
      name: 'Épicerie',
      color: '#d85a9a',
    });
    const milk = await add('Lait');
    await add('Œufs');

    expect(milk).toEqual({
      id: expect.any(String) as string,
      name: 'Lait',
      done: false,
      highlighted: false,
      addedBy: 'Ada Test',
      addedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
      assignedTo: null,
      reminder: null,
      notes: '',
    });
    const detail = await bed.lists.findOne(list.id, bed.ada);
    expect(detail.sections.map(({ name }) => name)).toEqual([
      'Frais',
      'Épicerie',
    ]);
    expect(await names()).toEqual(['Lait', 'Œufs']);
  });

  it('updates only the fields sent, and clears nullable ones with null', async () => {
    const milk = await add('Lait');

    await bed.content.updateEntry(list.id, milk.id, bed.ada, {
      notes: 'Demi-écrémé',
      reminder: '2026-10-15T18:00',
    });
    const updated = await bed.content.updateEntry(list.id, milk.id, bed.ada, {
      done: true,
      reminder: null,
    });

    expect(updated).toEqual(
      expect.objectContaining({
        name: 'Lait',
        notes: 'Demi-écrémé',
        done: true,
        reminder: null,
      }),
    );
  });

  it('assigns entries to list members only', async () => {
    const milk = await add('Lait');
    await expect(
      bed.content.updateEntry(list.id, milk.id, bed.ada, {
        assignedTo: bed.bob,
      }),
    ).rejects.toThrow(BadRequestException);

    await bed.lists.addMember(list.id, bed.ada, {
      userId: bed.bob,
      role: 'editor',
    });
    await expect(
      bed.content.updateEntry(list.id, milk.id, bed.ada, {
        assignedTo: bed.bob,
      }),
    ).resolves.toEqual(expect.objectContaining({ assignedTo: bed.bob }));
    await expect(
      bed.content.updateEntry(list.id, milk.id, bed.ada, { assignedTo: null }),
    ).resolves.toEqual(expect.objectContaining({ assignedTo: null }));
  });

  it('reorders a section from the complete list of its entry ids', async () => {
    const [milk, eggs, salad] = [
      await add('Lait'),
      await add('Œufs'),
      await add('Salade'),
    ];

    await bed.content.reorderEntries(list.id, sectionId, bed.ada, {
      entryIds: [salad.id, milk.id, eggs.id],
    });
    expect(await names()).toEqual(['Salade', 'Lait', 'Œufs']);

    for (const entryIds of [
      [salad.id, milk.id],
      [salad.id, milk.id, milk.id],
      [salad.id, milk.id, list.id],
    ]) {
      await expect(
        bed.content.reorderEntries(list.id, sectionId, bed.ada, { entryIds }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('removes entries, and rejects ids from another list', async () => {
    const milk = await add('Lait');
    const other = await bed.lists.create(bed.ada, {
      name: 'Maison',
      icon: 'home',
      color: '#7868ef',
    });

    await expect(
      bed.content.removeEntry(other.id, milk.id, bed.ada),
    ).rejects.toThrow(NotFoundException);
    await expect(
      bed.content.addEntry(other.id, sectionId, bed.ada, { name: 'X' }),
    ).rejects.toThrow(NotFoundException);

    await bed.content.removeEntry(list.id, milk.id, bed.ada);
    expect(await names()).toEqual([]);
  });

  it('lets editors change content but viewers only read it', async () => {
    await bed.lists.addMember(list.id, bed.ada, {
      userId: bed.bob,
      role: 'viewer',
    });
    await expect(add('Lait', bed.bob)).rejects.toThrow(ForbiddenException);

    await bed.lists.updateMember(list.id, bed.bob, bed.ada, { role: 'editor' });
    await expect(add('Lait', bed.bob)).resolves.toEqual(
      expect.objectContaining({ addedBy: 'Bob Test' }),
    );
    await expect(add('Lait', bed.cyd)).rejects.toThrow(NotFoundException);
  });
});
