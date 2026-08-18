import { ConflictException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { GroupMembership } from './group-membership.entity';
import { Group } from './group.entity';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  let memberships: { findOne: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: GroupsService;

  beforeEach(() => {
    memberships = { findOne: jest.fn() };
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity, value: object) => value),
      save: jest.fn((value: object) => {
        if ('inviteCode' in value) {
          Object.assign(value, { createdAt: new Date('2030-01-01T00:00:00Z') });
        }
        return Promise.resolve(value);
      }),
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
    memberships.findOne.mockResolvedValue({
      role: 'member',
      group: {
        id: 'group-1',
        name: 'Les Explorateurs',
        inviteCode: 'ABC12345',
        createdAt: new Date('2030-01-01T00:00:00Z'),
      },
    });

    await expect(service.findForUser('user-1')).resolves.toMatchObject({
      id: 'group-1',
      role: 'member',
      inviteCode: 'ABC12345',
    });
  });

  it('creates a group and its owner membership atomically', async () => {
    manager.findOne.mockResolvedValue(null);

    const result = await service.create('user-1', {
      name: 'Les Explorateurs',
    });

    expect(result).toMatchObject({
      name: 'Les Explorateurs',
      role: 'owner',
    });
    expect(result.inviteCode).toHaveLength(8);
    expect(manager.create).toHaveBeenNthCalledWith(
      1,
      Group,
      expect.objectContaining({
        name: 'Les Explorateurs',
        createdByUserId: 'user-1',
      }),
    );
    expect(manager.create).toHaveBeenNthCalledWith(
      2,
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
});
