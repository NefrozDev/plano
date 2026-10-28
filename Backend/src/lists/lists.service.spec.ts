import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  createListsTestBed,
  type ListsTestBed,
} from './testing/lists-test-bed';

describe('ListsService', () => {
  let bed: ListsTestBed;

  beforeEach(async () => {
    bed = await createListsTestBed();
  });

  afterEach(() => bed.destroy());

  const createList = (userId = bed.ada) =>
    bed.lists.create(userId, {
      name: 'Courses',
      icon: 'cart',
      color: '#2ecb70',
    });

  it('creates a list owned by its creator', async () => {
    const list = await createList();

    expect(list).toEqual({
      id: expect.any(String) as string,
      name: 'Courses',
      icon: 'cart',
      color: '#2ecb70',
      archived: false,
      ownership: 'mine',
      role: 'owner',
      memberCount: 1,
      completed: 0,
      total: 0,
      description: '',
      members: [{ id: bed.ada, name: 'Ada Test', role: 'owner' }],
      sections: [],
    });
  });

  it('lists owned and shared lists with their counts', async () => {
    const list = await createList();
    const section = await bed.content.addSection(list.id, bed.ada, {
      name: 'Frais',
      color: '#23c666',
    });
    const milk = await bed.content.addEntry(list.id, section.id, bed.ada, {
      name: 'Lait',
    });
    await bed.content.addEntry(list.id, section.id, bed.ada, { name: 'Œufs' });
    await bed.content.updateEntry(list.id, milk.id, bed.ada, { done: true });
    await bed.lists.addMember(list.id, bed.ada, {
      userId: bed.bob,
      role: 'editor',
    });

    expect(await bed.lists.findAll(bed.ada)).toEqual([
      expect.objectContaining({
        ownership: 'mine',
        role: 'owner',
        memberCount: 2,
        completed: 1,
        total: 2,
      }),
    ]);
    expect(await bed.lists.findAll(bed.bob)).toEqual([
      expect.objectContaining({
        ownership: 'shared',
        role: 'editor',
        name: 'Courses',
      }),
    ]);
    expect(await bed.lists.findAll(bed.cyd)).toEqual([]);
  });

  it('hides lists from people they are not shared with', async () => {
    const list = await createList();

    await expect(bed.lists.findOne(list.id, bed.bob)).rejects.toThrow(
      NotFoundException,
    );
    await expect(bed.lists.findOne(list.id, bed.cyd)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets only the owner update or delete the list', async () => {
    const list = await createList();
    await bed.lists.addMember(list.id, bed.ada, {
      userId: bed.bob,
      role: 'editor',
    });

    await expect(
      bed.lists.update(list.id, bed.bob, { name: 'Piraté' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(bed.lists.remove(list.id, bed.bob)).rejects.toThrow(
      ForbiddenException,
    );

    const updated = await bed.lists.update(list.id, bed.ada, {
      name: 'Courses du samedi',
      archived: true,
    });
    expect(updated).toEqual(
      expect.objectContaining({
        name: 'Courses du samedi',
        archived: true,
        icon: 'cart',
      }),
    );

    await bed.lists.remove(list.id, bed.ada);
    await expect(bed.lists.findOne(list.id, bed.ada)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('members', () => {
    it('shares with mates from any of the owner’s groups', async () => {
      const list = await createList();
      await bed.createOtherGroup([bed.cyd, bed.ada]);

      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.cyd,
        role: 'viewer',
      });

      expect(
        (await bed.lists.findAll(bed.cyd)).map((summary) => summary.id),
      ).toEqual([list.id]);
    });

    it('shares only with group mates, once each', async () => {
      const list = await createList();

      await expect(
        bed.lists.addMember(list.id, bed.ada, {
          userId: bed.cyd,
          role: 'viewer',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        bed.lists.addMember(list.id, bed.ada, {
          userId: bed.ada,
          role: 'viewer',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        bed.lists.addMember(list.id, bed.ada, {
          userId: bed.bob,
          role: 'viewer',
        }),
      ).resolves.toEqual({
        id: bed.bob,
        name: 'Bob Test',
        role: 'viewer',
      });
      await expect(
        bed.lists.addMember(list.id, bed.ada, {
          userId: bed.bob,
          role: 'editor',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('changes roles and removes members, owner only', async () => {
      const list = await createList();
      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      await expect(
        bed.lists.updateMember(list.id, bed.bob, bed.bob, { role: 'editor' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        bed.lists.updateMember(list.id, bed.bob, bed.ada, { role: 'editor' }),
      ).resolves.toEqual(expect.objectContaining({ role: 'editor' }));
      await expect(
        bed.lists.updateMember(list.id, bed.cyd, bed.ada, { role: 'editor' }),
      ).rejects.toThrow(NotFoundException);

      await bed.lists.removeAllMembers(list.id, bed.ada);
      expect((await bed.lists.findOne(list.id, bed.ada)).members).toHaveLength(
        1,
      );
    });

    it('lets a member leave, but not remove others', async () => {
      const list = await createList();
      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.bob,
        role: 'editor',
      });
      await bed.joinGroup(bed.cyd);
      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.cyd,
        role: 'viewer',
      });

      await expect(
        bed.lists.removeMember(list.id, bed.cyd, bed.bob),
      ).rejects.toThrow(ForbiddenException);
      await bed.lists.removeMember(list.id, bed.bob, bed.bob);

      expect(
        (await bed.lists.findOne(list.id, bed.ada)).members.map(({ id }) => id),
      ).toEqual([bed.ada, bed.cyd]);
    });

    it('revokes access when the member leaves the owner’s group', async () => {
      const list = await createList();
      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.bob,
        role: 'editor',
      });

      await bed.leaveGroup(bed.bob);

      await expect(bed.lists.findOne(list.id, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
      expect(await bed.lists.findAll(bed.bob)).toEqual([]);
    });
  });

  it('collects reminders from every visible list', async () => {
    const list = await createList();
    const section = await bed.content.addSection(list.id, bed.ada, {
      name: 'Frais',
      color: '#23c666',
    });
    const milk = await bed.content.addEntry(list.id, section.id, bed.ada, {
      name: 'Lait',
    });
    await bed.content.addEntry(list.id, section.id, bed.ada, { name: 'Œufs' });
    await bed.content.updateEntry(list.id, milk.id, bed.ada, {
      reminder: '2026-10-15T18:00',
    });
    await bed.lists.addMember(list.id, bed.ada, {
      userId: bed.bob,
      role: 'viewer',
    });

    const expected = [
      {
        listId: list.id,
        listName: 'Courses',
        listColor: '#2ecb70',
        entryId: milk.id,
        name: 'Lait',
        done: false,
        reminder: '2026-10-15T18:00',
      },
    ];
    expect(await bed.lists.findReminders(bed.ada)).toEqual(expected);
    expect(await bed.lists.findReminders(bed.bob)).toEqual(expected);
    expect(await bed.lists.findReminders(bed.cyd)).toEqual([]);
  });
});
