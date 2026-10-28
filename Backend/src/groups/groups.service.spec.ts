import type { Mock } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { In, type DataSource, type Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { GroupMembership, type GroupRole } from './group-membership.entity';
import { Group } from './group.entity';
import { GroupsService, MAX_GROUPS_PER_USER } from './groups.service';

/**
 * Builds a membership row as TypeORM would return it with its `group` and
 * `user` relations loaded. Each call returns fresh objects, so a test can
 * mutate one (the service changes roles in place) without leaking into others.
 */
function membershipRow(
  userId: string,
  role: GroupRole,
  groupOverrides: Partial<Group> = {},
): GroupMembership {
  const groupId = groupOverrides.id ?? 'group-1';
  return {
    id: `membership-${userId}-${groupId}`,
    userId,
    groupId,
    role,
    createdAt: new Date('2030-01-02T00:00:00Z'),
    user: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: userId,
      email: `${userId}@example.com`,
    },
    group: {
      id: 'group-1',
      name: 'Les Explorateurs',
      inviteCode: 'ABC12345',
      createdByUserId: 'user-1',
      createdAt: new Date('2030-01-01T00:00:00Z'),
      ...groupOverrides,
    },
  } as GroupMembership;
}

describe('GroupsService', () => {
  let memberships: { findOne: Mock; find: Mock };
  let manager: {
    findOne: Mock;
    count: Mock;
    create: Mock;
    save: Mock;
    delete: Mock;
  };
  let dataSource: { transaction: Mock };
  let service: GroupsService;

  beforeEach(() => {
    memberships = { findOne: vi.fn(), find: vi.fn() };
    manager = {
      findOne: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((_entity, value: object) => value),
      save: vi.fn((value: object) => {
        if ('inviteCode' in value) {
          Object.assign(value, { createdAt: new Date('2030-01-01T00:00:00Z') });
        }
        return Promise.resolve(value);
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: vi.fn((operation: (value: typeof manager) => unknown) =>
        operation(manager),
      ),
    };
    service = new GroupsService(
      memberships as unknown as Repository<GroupMembership>,
      dataSource as unknown as DataSource,
      new DatabaseWriteLockService(),
    );
  });

  /** Every mutation re-reads the group afterwards: make that read succeed. */
  function storedGroupFor(userId: string, role: GroupRole): void {
    const row = membershipRow(userId, role);
    memberships.findOne.mockResolvedValue(row);
    memberships.find.mockResolvedValue([row]);
  }

  describe('reading', () => {
    it('lists no group for a user without memberships, with a single query', async () => {
      memberships.find.mockResolvedValue([]);

      await expect(service.findAllForUser('user-1')).resolves.toEqual([]);
      expect(memberships.find).toHaveBeenCalledTimes(1);
      expect(memberships.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        relations: { group: true },
        order: { createdAt: 'ASC' },
      });
    });

    it('lists every group of the user with its own members, reading members once', async () => {
      const family = membershipRow('user-1', 'owner');
      const work = membershipRow('user-1', 'member', {
        id: 'group-2',
        name: 'Travail',
      });
      const colleague = membershipRow('user-2', 'owner', { id: 'group-2' });
      memberships.find
        .mockResolvedValueOnce([family, work])
        .mockResolvedValueOnce([family, work, colleague]);

      const groups = await service.findAllForUser('user-1');

      expect(groups).toEqual([
        expect.objectContaining({
          id: 'group-1',
          role: 'owner',
          members: [expect.objectContaining({ id: 'user-1' })],
        }),
        expect.objectContaining({
          id: 'group-2',
          name: 'Travail',
          role: 'member',
          members: [
            expect.objectContaining({ id: 'user-1' }),
            expect.objectContaining({ id: 'user-2', role: 'owner' }),
          ],
        }),
      ]);
      expect(memberships.find).toHaveBeenCalledTimes(2);
      expect(memberships.find).toHaveBeenLastCalledWith({
        where: { groupId: In(['group-1', 'group-2']) },
        relations: { user: true },
        order: { createdAt: 'ASC' },
      });
    });

    it('returns one group of the user with its members, oldest first', async () => {
      storedGroupFor('user-1', 'member');

      await expect(
        service.findOneForUser('user-1', 'group-1'),
      ).resolves.toMatchObject({
        id: 'group-1',
        role: 'member',
        inviteCode: 'ABC12345',
        members: [
          expect.objectContaining({ id: 'user-1', username: 'user-1' }),
        ],
      });
      expect(memberships.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', groupId: 'group-1' },
        relations: { group: true },
      });
      expect(memberships.find).toHaveBeenCalledTimes(1);
      expect(memberships.find).toHaveBeenCalledWith({
        where: { groupId: 'group-1' },
        relations: { user: true },
        order: { createdAt: 'ASC' },
      });
    });

    it('hides groups the user does not belong to behind a 404', async () => {
      memberships.findOne.mockResolvedValue(null);

      await expect(service.findOneForUser('user-9', 'group-1')).rejects.toThrow(
        'Ce groupe est introuvable.',
      );
      expect(memberships.find).not.toHaveBeenCalled();
    });

    it('collects the distinct mates of every group of the user', async () => {
      memberships.find
        .mockResolvedValueOnce([
          membershipRow('user-1', 'owner'),
          membershipRow('user-1', 'member', { id: 'group-2' }),
        ])
        .mockResolvedValueOnce([
          membershipRow('user-1', 'owner'),
          membershipRow('user-2', 'member'),
          membershipRow('user-1', 'member', { id: 'group-2' }),
          membershipRow('user-2', 'owner', { id: 'group-2' }),
          membershipRow('user-3', 'member', { id: 'group-2' }),
        ]);

      await expect(service.findGroupMateIds('user-1')).resolves.toEqual([
        'user-1',
        'user-2',
        'user-3',
      ]);
      expect(memberships.find).toHaveBeenLastCalledWith({
        where: { groupId: In(['group-1', 'group-2']) },
      });
    });

    it('has no mates without a group and tells whether two users share one', async () => {
      memberships.find.mockResolvedValueOnce([]);
      await expect(service.findGroupMateIds('user-9')).resolves.toEqual([]);
      expect(memberships.find).toHaveBeenCalledTimes(1);

      memberships.find
        .mockResolvedValueOnce([membershipRow('user-1', 'owner')])
        .mockResolvedValueOnce([
          membershipRow('user-1', 'owner'),
          membershipRow('user-2', 'member'),
        ]);
      await expect(service.areGroupMates('user-1', 'user-2')).resolves.toBe(
        true,
      );
      memberships.find.mockResolvedValueOnce([]);
      await expect(service.areGroupMates('user-1', 'user-3')).resolves.toBe(
        false,
      );
    });
  });

  describe('create', () => {
    it('creates a group and its owner membership atomically, even with other groups', async () => {
      manager.count.mockResolvedValue(3);
      storedGroupFor('user-1', 'owner');

      const result = await service.create('user-1', {
        name: 'Les Explorateurs',
      });

      expect(result).toMatchObject({ name: 'Les Explorateurs', role: 'owner' });
      expect(manager.count).toHaveBeenCalledWith(GroupMembership, {
        where: { userId: 'user-1' },
      });
      expect(manager.create).toHaveBeenCalledWith(
        Group,
        expect.objectContaining({
          name: 'Les Explorateurs',
          createdByUserId: 'user-1',
        }),
      );
      const group = manager.create.mock.results[0].value as Group;
      expect(group.inviteCode).toHaveLength(8);
      expect(manager.create).toHaveBeenCalledWith(
        GroupMembership,
        expect.objectContaining({
          userId: 'user-1',
          groupId: group.id,
          role: 'owner',
        }),
      );
      expect(manager.save).toHaveBeenCalledTimes(2);
      // The response is the new group, read back by its id.
      expect(memberships.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', groupId: group.id },
        relations: { group: true },
      });
    });

    it(`stops at ${MAX_GROUPS_PER_USER} groups`, async () => {
      manager.count.mockResolvedValue(MAX_GROUPS_PER_USER);

      await expect(
        service.create('user-1', { name: 'Un de trop' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('adds the user as a member of the group matching the invite code', async () => {
      // 1st lookup: the invite code exists; 2nd: the user is not in that group yet.
      manager.findOne
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce(null);
      storedGroupFor('user-2', 'member');

      await expect(
        service.join('user-2', { inviteCode: 'ABC12345' }),
      ).resolves.toMatchObject({ id: 'group-1', role: 'member' });
      expect(manager.findOne).toHaveBeenNthCalledWith(1, Group, {
        where: { inviteCode: 'ABC12345' },
      });
      expect(manager.findOne).toHaveBeenNthCalledWith(2, GroupMembership, {
        where: { userId: 'user-2', groupId: 'group-1' },
      });
      expect(manager.create).toHaveBeenCalledTimes(1);
      expect(manager.create).toHaveBeenCalledWith(
        GroupMembership,
        expect.objectContaining({
          userId: 'user-2',
          groupId: 'group-1',
          role: 'member',
        }),
      );
      expect(manager.save).toHaveBeenCalledTimes(1);
    });

    it('refuses users who already belong to that group', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce({ id: 'membership-2' });

      await expect(
        service.join('user-2', { inviteCode: 'ABC12345' }),
      ).rejects.toThrow('Vous faites déjà partie de ce groupe.');
      expect(manager.count).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it(`refuses a ${MAX_GROUPS_PER_USER + 1}th group`, async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce(null);
      manager.count.mockResolvedValue(MAX_GROUPS_PER_USER);

      await expect(
        service.join('user-2', { inviteCode: 'ABC12345' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects unknown invite codes', async () => {
      manager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.join('user-2', { inviteCode: 'NOPE0000' }),
      ).rejects.toThrow("Ce code d'invitation est invalide.");
      expect(manager.findOne).toHaveBeenCalledTimes(1);
      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('owner-only actions', () => {
    it('renames the group', async () => {
      const owner = membershipRow('user-1', 'owner');
      manager.findOne.mockResolvedValueOnce(owner);
      storedGroupFor('user-1', 'owner');

      await service.update('user-1', 'group-1', { name: 'Les Aventuriers' });

      expect(manager.findOne).toHaveBeenCalledWith(GroupMembership, {
        where: { userId: 'user-1', groupId: 'group-1' },
        relations: { group: true },
      });
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'group-1', name: 'Les Aventuriers' }),
      );
    });

    it('rotates the invite code to a new 8-character code', async () => {
      const owner = membershipRow('user-1', 'owner');
      // Owner lookup, then "is this code already taken?" → no.
      manager.findOne.mockResolvedValueOnce(owner).mockResolvedValue(null);
      storedGroupFor('user-1', 'owner');

      await service.rotateInviteCode('user-1', 'group-1');

      expect(owner.group.inviteCode).toHaveLength(8);
      expect(owner.group.inviteCode).not.toBe('ABC12345');
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(owner.group);
    });

    it('gives up after 10 invite code collisions', async () => {
      manager.findOne
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValue({ id: 'another-group' });

      await expect(
        service.rotateInviteCode('user-1', 'group-1'),
      ).rejects.toThrow("Impossible de générer un code d'invitation unique.");
      // 1 owner lookup + 10 collision checks.
      expect(manager.findOne).toHaveBeenCalledTimes(11);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('forbids members from managing the group', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-2', 'member'));

      await expect(
        service.update('user-2', 'group-1', { name: 'Pris' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.delete('user-2', 'group-1')).rejects.toThrow(
        'Seul le propriétaire peut effectuer cette action.',
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('reports groups the user does not belong to', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.rotateInviteCode('user-9', 'group-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Stops at the owner lookup: no collision checks, no write.
      expect(manager.findOne).toHaveBeenCalledTimes(1);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('deletes every membership of that group, then the group itself', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-1', 'owner'));

      await service.delete('user-1', 'group-1');

      expect(manager.delete).toHaveBeenCalledTimes(2);
      expect(manager.delete).toHaveBeenNthCalledWith(1, GroupMembership, {
        groupId: 'group-1',
      });
      expect(manager.delete).toHaveBeenNthCalledWith(2, Group, {
        id: 'group-1',
      });
    });
  });

  describe('transferOwnership', () => {
    it('swaps roles between the owner and the target member', async () => {
      const owner = membershipRow('user-1', 'owner');
      const target = membershipRow('user-2', 'member');
      manager.findOne
        .mockResolvedValueOnce(owner)
        .mockResolvedValueOnce(target);
      storedGroupFor('user-1', 'member');

      await service.transferOwnership('user-1', 'group-1', 'user-2');

      expect(owner.role).toBe('member');
      expect(target.role).toBe('owner');
      expect(owner.group.createdByUserId).toBe('user-2');
      expect(manager.save).toHaveBeenCalledWith([owner, target]);
      expect(manager.save).toHaveBeenCalledWith(owner.group);
      expect(manager.findOne).toHaveBeenLastCalledWith(GroupMembership, {
        where: { groupId: 'group-1', userId: 'user-2' },
      });
    });

    it('rejects a transfer to yourself before touching the database', async () => {
      await expect(
        service.transferOwnership('user-1', 'group-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a target outside the group', async () => {
      manager.findOne
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValueOnce(null);

      await expect(
        service.transferOwnership('user-1', 'group-1', 'user-9'),
      ).rejects.toThrow("Ce membre n'appartient pas au groupe.");
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('removes a member of that group only', async () => {
      manager.findOne
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValueOnce(membershipRow('user-2', 'member'));

      await service.removeMember('user-1', 'group-1', 'user-2');

      expect(manager.findOne).toHaveBeenLastCalledWith(GroupMembership, {
        where: { groupId: 'group-1', userId: 'user-2' },
      });
      expect(manager.delete).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(GroupMembership, {
        id: 'membership-user-2-group-1',
      });
    });

    it('rejects removing yourself', async () => {
      await expect(
        service.removeMember('user-1', 'group-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects unknown members and protects the owner', async () => {
      manager.findOne
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValueOnce(membershipRow('user-3', 'owner'));

      await expect(
        service.removeMember('user-1', 'group-1', 'user-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.removeMember('user-1', 'group-1', 'user-3'),
      ).rejects.toThrow('Le propriétaire ne peut pas être retiré.');
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('lets a member leave that group', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-2', 'member'));

      await service.leave('user-2', 'group-1');

      expect(manager.findOne).toHaveBeenCalledWith(GroupMembership, {
        where: { userId: 'user-2', groupId: 'group-1' },
        relations: { group: true },
      });
      expect(manager.delete).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(GroupMembership, {
        id: 'membership-user-2-group-1',
      });
    });

    it('asks the owner to transfer or delete the group first', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-1', 'owner'));

      await expect(service.leave('user-1', 'group-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  it('serializes writes: a failed action does not block the next one', async () => {
    manager.findOne.mockResolvedValueOnce(membershipRow('user-1', 'owner'));
    const failing = service.leave('user-1', 'group-1');
    manager.findOne.mockResolvedValueOnce(membershipRow('user-2', 'member'));
    const succeeding = service.leave('user-2', 'group-1');

    await expect(failing).rejects.toBeInstanceOf(ConflictException);
    await expect(succeeding).resolves.toBeUndefined();
    // Only the member's leave reached the database.
    expect(manager.delete).toHaveBeenCalledTimes(1);
    expect(manager.delete).toHaveBeenCalledWith(GroupMembership, {
      id: 'membership-user-2-group-1',
    });
  });
});
