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
import type { GroupDetails, GroupMemberSummary } from './group.types';

const GROUP_NOT_FOUND = 'Ce groupe est introuvable.';

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
    if (!membership) throw new NotFoundException(GROUP_NOT_FOUND);

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
          throw new NotFoundException("Ce code d'invitation est invalide.");
        }
        const existing = await manager.findOne(GroupMembership, {
          where: { userId, groupId: group.id },
        });
        if (existing) {
          throw new ConflictException('Vous faites déjà partie de ce groupe.');
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
      throw new BadRequestException('Vous êtes déjà propriétaire du groupe.');
    }

    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const owner = await this.requireOwner(manager, userId, groupId);
        const target = await manager.findOne(GroupMembership, {
          where: { groupId, userId: targetUserId },
        });
        if (!target) {
          throw new NotFoundException("Ce membre n'appartient pas au groupe.");
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
        'Utilisez l’action prévue pour quitter ou supprimer le groupe.',
      );
    }

    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.requireOwner(manager, userId, groupId);
        const target = await manager.findOne(GroupMembership, {
          where: { groupId, userId: targetUserId },
        });
        if (!target) {
          throw new NotFoundException("Ce membre n'appartient pas au groupe.");
        }
        if (target.role === 'owner') {
          throw new ForbiddenException(
            'Le propriétaire ne peut pas être retiré.',
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
            'Transférez la propriété ou supprimez le groupe avant de le quitter.',
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
        `Vous faites déjà partie de ${MAX_GROUPS_PER_USER} groupes, le maximum.`,
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
    if (!membership) throw new NotFoundException(GROUP_NOT_FOUND);
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
        'Seul le propriétaire peut effectuer cette action.',
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
      "Impossible de générer un code d'invitation unique.",
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
      role: membership.role,
      joinedAt: membership.createdAt,
    };
  }
}
