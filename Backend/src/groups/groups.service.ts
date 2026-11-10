import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { CreateGroupDto } from './dto/create-group.dto';
import type { JoinGroupDto } from './dto/join-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';
import { GroupMembership } from './group-membership.entity';
import { Group } from './group.entity';
import { avatarVersion } from '../users/user.mapper';
import type { GroupDetails, GroupMemberSummary } from './group.types';
import { errorCode } from '../errors/error-code';

const GROUP_NOT_FOUND = 'Group not found.';

/** Keeps a single account from piling up groups (and invite codes). */
export const MAX_GROUPS_PER_USER = 20;

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(GroupMembership)
    private readonly memberships: Repository<GroupMembership>,
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  /** Every group the user belongs to, oldest membership first. */
  async findAllForUser(userId: string): Promise<GroupDetails[]> {
    const own = await this.memberships.find({
      where: { userId },
      relations: { group: true },
      order: { createdAt: 'ASC' },
    });
    if (!own.length) return [];

    // One query for the members of every group instead of one per group.
    const members = await this.memberships.find({
      where: { groupId: In(own.map((membership) => membership.groupId)) },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return own.map((membership) =>
      this.toDetails(
        membership,
        members.filter((member) => member.groupId === membership.groupId),
      ),
    );
  }

  /** The group, if the user belongs to it; a 404 otherwise, so ids of other groups do not leak. */
  async findOneForUser(userId: string, groupId: string): Promise<GroupDetails> {
    const membership = await this.memberships.findOne({
      where: { userId, groupId },
      relations: { group: true },
    });
    if (!membership)
      throw new NotFoundException(
        GROUP_NOT_FOUND,
        errorCode('groups.notFound'),
      );

    const members = await this.memberships.find({
      where: { groupId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return this.toDetails(membership, members);
  }

  /** Ids of everyone sharing at least one group with the user, the user included; empty without a group. */
  async findGroupMateIds(userId: string): Promise<string[]> {
    const own = await this.memberships.find({ where: { userId } });
    if (!own.length) return [];
    const members = await this.memberships.find({
      where: { groupId: In(own.map((membership) => membership.groupId)) },
    });
    return [...new Set(members.map((member) => member.userId))];
  }

  async areGroupMates(userId: string, otherUserId: string): Promise<boolean> {
    return (await this.findGroupMateIds(userId)).includes(otherUserId);
  }

  async create(userId: string, details: CreateGroupDto): Promise<GroupDetails> {
    const groupId = await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.requireRoomForAnotherGroup(manager, userId);

        const group = manager.create(Group, {
          id: randomUUID(),
          name: details.name,
          inviteCode: await this.createUniqueInviteCode(manager),
          createdByUserId: userId,
        });
        await manager.save(group);

        await manager.save(
          manager.create(GroupMembership, {
            id: randomUUID(),
            userId,
            groupId: group.id,
            group,
            role: 'owner',
          }),
        );
        return group.id;
      }),
    );

    return this.findOneForUser(userId, groupId);
  }

  async join(userId: string, details: JoinGroupDto): Promise<GroupDetails> {
    const groupId = await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const group = await manager.findOne(Group, {
          where: { inviteCode: details.inviteCode },
        });
        if (!group) {
          throw new NotFoundException(
            'This invite code is invalid.',
            errorCode('groups.invalidInviteCode'),
          );
        }
        const existing = await manager.findOne(GroupMembership, {
          where: { userId, groupId: group.id },
        });
        if (existing) {
          throw new ConflictException(
            'You are already in this group.',
            errorCode('groups.alreadyMember'),
          );
        }
        await this.requireRoomForAnotherGroup(manager, userId);

        await manager.save(
          manager.create(GroupMembership, {
            id: randomUUID(),
            userId,
            groupId: group.id,
            role: 'member',
          }),
        );
        return group.id;
      }),
    );

    return this.findOneForUser(userId, groupId);
  }

  async update(
    userId: string,
    groupId: string,
    details: UpdateGroupDto,
  ): Promise<GroupDetails> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const membership = await this.requireOwner(manager, userId, groupId);
        membership.group.name = details.name;
        await manager.save(membership.group);
      }),
    );

    return this.findOneForUser(userId, groupId);
  }

  async rotateInviteCode(
    userId: string,
    groupId: string,
  ): Promise<GroupDetails> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const membership = await this.requireOwner(manager, userId, groupId);
        membership.group.inviteCode =
          await this.createUniqueInviteCode(manager);
        await manager.save(membership.group);
      }),
    );

    return this.findOneForUser(userId, groupId);
  }

  async transferOwnership(
    userId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<GroupDetails> {
    if (userId === targetUserId) {
      throw new BadRequestException(
        'You already own this group.',
        errorCode('groups.alreadyOwner'),
      );
    }

    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const owner = await this.requireOwner(manager, userId, groupId);
        const target = await manager.findOne(GroupMembership, {
          where: { groupId, userId: targetUserId },
        });
        if (!target) {
          throw new NotFoundException(
            'This member is not in the group.',
            errorCode('groups.memberNotFound'),
          );
        }

        owner.role = 'member';
        target.role = 'owner';
        owner.group.createdByUserId = targetUserId;
        await manager.save([owner, target]);
        await manager.save(owner.group);
      }),
    );

    return this.findOneForUser(userId, groupId);
  }

  async removeMember(
    userId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<void> {
    if (userId === targetUserId) {
      throw new BadRequestException(
        'Use the dedicated action to leave or delete the group.',
        errorCode('groups.useLeaveAction'),
      );
    }

    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.requireOwner(manager, userId, groupId);
        const target = await manager.findOne(GroupMembership, {
          where: { groupId, userId: targetUserId },
        });
        if (!target) {
          throw new NotFoundException(
            'This member is not in the group.',
            errorCode('groups.memberNotFound'),
          );
        }
        if (target.role === 'owner') {
          throw new ForbiddenException(
            'The owner cannot be removed.',
            errorCode('groups.ownerCannotBeRemoved'),
          );
        }

        await manager.delete(GroupMembership, { id: target.id });
      }),
    );
  }

  async leave(userId: string, groupId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const membership = await this.requireMembership(
          manager,
          userId,
          groupId,
        );
        if (membership.role === 'owner') {
          throw new ConflictException(
            'Transfer ownership or delete the group before leaving it.',
            errorCode('groups.transferBeforeLeaving'),
          );
        }
        await manager.delete(GroupMembership, { id: membership.id });
      }),
    );
  }

  async delete(userId: string, groupId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.requireOwner(manager, userId, groupId);
        await manager.delete(GroupMembership, { groupId });
        await manager.delete(Group, { id: groupId });
      }),
    );
  }

  private async requireRoomForAnotherGroup(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const count = await manager.count(GroupMembership, { where: { userId } });
    if (count >= MAX_GROUPS_PER_USER) {
      throw new ConflictException(
        `You are already in ${MAX_GROUPS_PER_USER} groups, the maximum.`,
        errorCode('groups.tooManyGroups'),
      );
    }
  }

  private async requireMembership(
    manager: EntityManager,
    userId: string,
    groupId: string,
  ): Promise<GroupMembership> {
    const membership = await manager.findOne(GroupMembership, {
      where: { userId, groupId },
      relations: { group: true },
    });
    if (!membership)
      throw new NotFoundException(
        GROUP_NOT_FOUND,
        errorCode('groups.notFound'),
      );
    return membership;
  }

  private async requireOwner(
    manager: EntityManager,
    userId: string,
    groupId: string,
  ): Promise<GroupMembership> {
    const membership = await this.requireMembership(manager, userId, groupId);
    if (membership.role !== 'owner') {
      throw new ForbiddenException(
        'Only the owner can do this.',
        errorCode('groups.ownerOnly'),
      );
    }
    return membership;
  }

  private async createUniqueInviteCode(
    manager: EntityManager,
  ): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomBytes(6)
        .toString('base64url')
        .slice(0, 8)
        .toUpperCase();
      const existing = await manager.findOne(Group, {
        where: { inviteCode: code },
      });
      if (!existing) return code;
    }
    throw new ConflictException(
      'Could not generate a unique invite code.',
      errorCode('groups.inviteCodeUnavailable'),
    );
  }

  private toDetails(
    membership: GroupMembership,
    members: GroupMembership[],
  ): GroupDetails {
    return {
      id: membership.group.id,
      name: membership.group.name,
      inviteCode: membership.group.inviteCode,
      role: membership.role,
      createdAt: membership.group.createdAt,
      members: members.map((member) => this.toMemberSummary(member)),
    };
  }

  private toMemberSummary(membership: GroupMembership): GroupMemberSummary {
    return {
      id: membership.userId,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      username: membership.user.username,
      email: membership.user.email,
      avatarVersion: avatarVersion(membership.user),
      role: membership.role,
      joinedAt: membership.createdAt,
    };
  }
}
