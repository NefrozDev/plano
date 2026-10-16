import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { CreateGroupDto } from './dto/create-group.dto';
import type { JoinGroupDto } from './dto/join-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';
import { GroupMembership } from './group-membership.entity';
import { Group } from './group.entity';
import type { GroupDetails, GroupMemberSummary } from './group.types';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(GroupMembership)
    private readonly memberships: Repository<GroupMembership>,
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  async findForUser(userId: string): Promise<GroupDetails | null> {
    const membership = await this.memberships.findOne({
      where: { userId },
      relations: { group: true },
    });

    if (!membership) return null;

    const members = await this.memberships.find({
      where: { groupId: membership.groupId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });

    return this.toDetails(membership, members);
  }

  /** Ids of everyone in the user's group, the user included; empty without a group. */
  async findGroupMateIds(userId: string): Promise<string[]> {
    const membership = await this.memberships.findOne({ where: { userId } });
    if (!membership) return [];
    const members = await this.memberships.find({
      where: { groupId: membership.groupId },
    });
    return members.map((member) => member.userId);
  }

  async areGroupMates(userId: string, otherUserId: string): Promise<boolean> {
    return (await this.findGroupMateIds(userId)).includes(otherUserId);
  }

  async create(userId: string, details: CreateGroupDto): Promise<GroupDetails> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.requireNoMembership(manager, userId);

        const group = manager.create(Group, {
          id: randomUUID(),
          name: details.name,
          inviteCode: await this.createUniqueInviteCode(manager),
          createdByUserId: userId,
        });
        await manager.save(group);

        const membership = manager.create(GroupMembership, {
          id: randomUUID(),
          userId,
          groupId: group.id,
          group,
          role: 'owner',
        });
        await manager.save(membership);
      }),
    );

    return this.requireDetails(userId);
  }

  async join(userId: string, details: JoinGroupDto): Promise<GroupDetails> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.requireNoMembership(manager, userId);

        const group = await manager.findOne(Group, {
          where: { inviteCode: details.inviteCode },
        });
        if (!group) {
          throw new NotFoundException("Ce code d'invitation est invalide.");
        }

        await manager.save(
          manager.create(GroupMembership, {
            id: randomUUID(),
            userId,
            groupId: group.id,
            role: 'member',
          }),
        );
      }),
    );

    return this.requireDetails(userId);
  }

  async update(userId: string, details: UpdateGroupDto): Promise<GroupDetails> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const membership = await this.requireOwner(manager, userId);
        membership.group.name = details.name;
        await manager.save(membership.group);
      }),
    );

    return this.requireDetails(userId);
  }

  async rotateInviteCode(userId: string): Promise<GroupDetails> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const membership = await this.requireOwner(manager, userId);
        membership.group.inviteCode =
          await this.createUniqueInviteCode(manager);
        await manager.save(membership.group);
      }),
    );

    return this.requireDetails(userId);
  }

  async transferOwnership(
    userId: string,
    targetUserId: string,
  ): Promise<GroupDetails> {
    if (userId === targetUserId) {
      throw new BadRequestException('Vous êtes déjà propriétaire du groupe.');
    }

    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const owner = await this.requireOwner(manager, userId);
        const target = await manager.findOne(GroupMembership, {
          where: { groupId: owner.groupId, userId: targetUserId },
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

    return this.requireDetails(userId);
  }

  async removeMember(userId: string, targetUserId: string): Promise<void> {
    if (userId === targetUserId) {
      throw new BadRequestException(
        'Utilisez l’action prévue pour quitter ou supprimer le groupe.',
      );
    }

    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const owner = await this.requireOwner(manager, userId);
        const target = await manager.findOne(GroupMembership, {
          where: { groupId: owner.groupId, userId: targetUserId },
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

  async leave(userId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const membership = await this.requireMembership(manager, userId);
        if (membership.role === 'owner') {
          throw new ConflictException(
            'Transférez la propriété ou supprimez le groupe avant de le quitter.',
          );
        }
        await manager.delete(GroupMembership, { id: membership.id });
      }),
    );
  }

  async delete(userId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const membership = await this.requireOwner(manager, userId);
        await manager.delete(GroupMembership, { groupId: membership.groupId });
        await manager.delete(Group, { id: membership.groupId });
      }),
    );
  }

  private async requireDetails(userId: string): Promise<GroupDetails> {
    const details = await this.findForUser(userId);
    if (!details) {
      throw new NotFoundException("Vous n'appartenez à aucun groupe.");
    }
    return details;
  }

  /** A user belongs to at most one group. */
  private async requireNoMembership(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const existing = await manager.findOne(GroupMembership, {
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Vous appartenez déjà à un groupe.');
    }
  }

  private async requireMembership(
    manager: EntityManager,
    userId: string,
  ): Promise<GroupMembership> {
    const membership = await manager.findOne(GroupMembership, {
      where: { userId },
      relations: { group: true },
    });
    if (!membership) {
      throw new NotFoundException("Vous n'appartenez à aucun groupe.");
    }
    return membership;
  }

  private async requireOwner(
    manager: EntityManager,
    userId: string,
  ): Promise<GroupMembership> {
    const membership = await this.requireMembership(manager, userId);
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
