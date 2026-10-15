import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { GroupMembership, type GroupRole } from './group-membership.entity';
import { Group } from './group.entity';
import { GroupsService } from './groups.service';

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
  return {
    id: `membership-${userId}`,
    userId,
    groupId: 'group-1',
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
  let memberships: { findOne: jest.Mock; find: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: GroupsService;

  beforeEach(() => {
    memberships = { findOne: jest.fn(), find: jest.fn() };
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity, value: object) => value),
      save: jest.fn((value: object) => {
        if ('inviteCode' in value) {
          Object.assign(value, { createdAt: new Date('2030-01-01T00:00:00Z') });
        }
        return Promise.resolve(value);
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn((operation: (value: typeof manager) => unknown) =>
        operation(manager),
      ),
    };
    service = new GroupsService(
      memberships as unknown as Repository<GroupMembership>,
      dataSource as unknown as DataSource,
      new DatabaseWriteLockService(),
    );
  });

  it('returns no group for a user without a membership', async () => {
    memberships.findOne.mockResolvedValue(null);

    await expect(service.findForUser('user-1')).resolves.toBeNull();
    expect(memberships.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      relations: { group: true },
    });
  });

  it('returns the public group summary for a member', async () => {
    const membership = {
      userId: 'user-1',
      groupId: 'group-1',
      role: 'member',
      createdAt: new Date('2030-01-02T00:00:00Z'),
      user: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        email: 'ada@example.com',
      },
      group: {
        id: 'group-1',
        name: 'Les Explorateurs',
        inviteCode: 'ABC12345',
        createdAt: new Date('2030-01-01T00:00:00Z'),
      },
    };
    memberships.findOne.mockResolvedValue(membership);
    memberships.find.mockResolvedValue([membership]);

    await expect(service.findForUser('user-1')).resolves.toMatchObject({
      id: 'group-1',
      role: 'member',
      inviteCode: 'ABC12345',
      members: [expect.objectContaining({ id: 'user-1', username: 'ada' })],
    });
  });

  it('creates a group and its owner membership atomically', async () => {
    manager.findOne.mockResolvedValue(null);
    const storedMembership = {
      userId: 'user-1',
      groupId: 'group-1',
      role: 'owner',
      createdAt: new Date('2030-01-01T00:00:00Z'),
      user: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        email: 'ada@example.com',
      },
      group: {
        id: 'group-1',
        name: 'Les Explorateurs',
        inviteCode: 'ABC12345',
        createdAt: new Date('2030-01-01T00:00:00Z'),
      },
    };
    memberships.findOne.mockResolvedValue(storedMembership);
    memberships.find.mockResolvedValue([storedMembership]);

    const result = await service.create('user-1', {
      name: 'Les Explorateurs',
    });

    expect(result).toMatchObject({
      name: 'Les Explorateurs',
      role: 'owner',
    });
    expect(result.inviteCode).toHaveLength(8);
    expect(manager.create).toHaveBeenCalledWith(
      Group,
      expect.objectContaining({
        name: 'Les Explorateurs',
        createdByUserId: 'user-1',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      GroupMembership,
      expect.objectContaining({ userId: 'user-1', role: 'owner' }),
    );
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  it('prevents a user from creating a second group', async () => {
    manager.findOne.mockResolvedValue({ id: 'membership-1' });

    await expect(
      service.create('user-1', { name: 'Second groupe' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.create).not.toHaveBeenCalled();
  });
  /** Every mutation re-reads the group afterwards: make that read succeed. */
  function storedGroupFor(userId: string, role: GroupRole): void {
    const row = membershipRow(userId, role);
    memberships.findOne.mockResolvedValue(row);
    memberships.find.mockResolvedValue([row]);
  }

  describe('join', () => {
    it('adds the user as a member of the group matching the invite code', async () => {
      // 1st lookup: the user has no membership yet; 2nd: the invite code exists.
      manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'group-1' });
      storedGroupFor('user-2', 'member');

      await expect(
        service.join('user-2', { inviteCode: 'ABC12345' }),
      ).resolves.toMatchObject({ id: 'group-1', role: 'member' });
      expect(manager.findOne).toHaveBeenLastCalledWith(Group, {
        where: { inviteCode: 'ABC12345' },
      });
      expect(manager.create).toHaveBeenCalledWith(
        GroupMembership,
        expect.objectContaining({
          userId: 'user-2',
          groupId: 'group-1',
          role: 'member',
        }),
      );
    });

    it('refuses users who already belong to a group', async () => {
      manager.findOne.mockResolvedValueOnce({ id: 'membership-2' });

      await expect(
        service.join('user-2', { inviteCode: 'ABC12345' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects unknown invite codes', async () => {
      manager.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(
        service.join('user-2', { inviteCode: 'NOPE0000' }),
      ).rejects.toThrow("Ce code d'invitation est invalide.");
    });

    it('reports a missing group if the membership cannot be read back', async () => {
      manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'group-1' });
      memberships.findOne.mockResolvedValue(null);

      await expect(
        service.join('user-2', { inviteCode: 'ABC12345' }),
      ).rejects.toThrow("Vous n'appartenez à aucun groupe.");
    });
  });

  describe('owner-only actions', () => {
    it('renames the group', async () => {
      const owner = membershipRow('user-1', 'owner');
      manager.findOne.mockResolvedValueOnce(owner);
      storedGroupFor('user-1', 'owner');

      await service.update('user-1', { name: 'Les Aventuriers' });

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'group-1', name: 'Les Aventuriers' }),
      );
    });

    it('rotates the invite code to a new 8-character code', async () => {
      const owner = membershipRow('user-1', 'owner');
      // Owner lookup, then "is this code already taken?" → no.
      manager.findOne.mockResolvedValueOnce(owner).mockResolvedValue(null);
      storedGroupFor('user-1', 'owner');

      await service.rotateInviteCode('user-1');

      expect(owner.group.inviteCode).toHaveLength(8);
      expect(owner.group.inviteCode).not.toBe('ABC12345');
      expect(manager.save).toHaveBeenCalledWith(owner.group);
    });

    it('gives up after 10 invite code collisions', async () => {
      manager.findOne
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValue({ id: 'another-group' });

      await expect(service.rotateInviteCode('user-1')).rejects.toThrow(
        "Impossible de générer un code d'invitation unique.",
      );
      // 1 owner lookup + 10 collision checks.
      expect(manager.findOne).toHaveBeenCalledTimes(11);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('forbids members from managing the group', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-2', 'member'));

      await expect(
        service.update('user-2', { name: 'Pris' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.delete('user-2')).rejects.toThrow(
        'Seul le propriétaire peut effectuer cette action.',
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('reports users without a group', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.rotateInviteCode('user-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes every membership, then the group itself', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-1', 'owner'));

      await service.delete('user-1');

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

      await service.transferOwnership('user-1', 'user-2');

      expect(owner.role).toBe('member');
      expect(target.role).toBe('owner');
      expect(owner.group.createdByUserId).toBe('user-2');
      expect(manager.save).toHaveBeenCalledWith([owner, target]);
      expect(manager.findOne).toHaveBeenLastCalledWith(GroupMembership, {
        where: { groupId: 'group-1', userId: 'user-2' },
      });
    });

    it('rejects a transfer to yourself before touching the database', async () => {
      await expect(
        service.transferOwnership('user-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a target outside the group', async () => {
      manager.findOne
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValueOnce(null);

      await expect(
        service.transferOwnership('user-1', 'user-9'),
      ).rejects.toThrow("Ce membre n'appartient pas au groupe.");
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('removes a member of the owner’s group', async () => {
      manager.findOne
        .mockResolvedValueOnce(membershipRow('user-1', 'owner'))
        .mockResolvedValueOnce(membershipRow('user-2', 'member'));

      await service.removeMember('user-1', 'user-2');

      expect(manager.delete).toHaveBeenCalledWith(GroupMembership, {
        id: 'membership-user-2',
      });
    });

    it('rejects removing yourself', async () => {
      await expect(
        service.removeMember('user-1', 'user-1'),
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
        service.removeMember('user-1', 'user-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.removeMember('user-1', 'user-3')).rejects.toThrow(
        'Le propriétaire ne peut pas être retiré.',
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('lets a member leave', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-2', 'member'));

      await service.leave('user-2');

      expect(manager.delete).toHaveBeenCalledWith(GroupMembership, {
        id: 'membership-user-2',
      });
    });

    it('asks the owner to transfer or delete the group first', async () => {
      manager.findOne.mockResolvedValue(membershipRow('user-1', 'owner'));

      await expect(service.leave('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  it('serializes writes: a failed action does not block the next one', async () => {
    manager.findOne.mockResolvedValueOnce(membershipRow('user-1', 'owner'));
    const failing = service.leave('user-1');
    manager.findOne.mockResolvedValueOnce(membershipRow('user-2', 'member'));
    const succeeding = service.leave('user-2');

    await expect(failing).rejects.toBeInstanceOf(ConflictException);
    await expect(succeeding).resolves.toBeUndefined();
  });
});
