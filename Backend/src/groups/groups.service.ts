import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupMembership } from './group-membership.entity';
import { Group } from './group.entity';
import type { GroupSummary } from './group.types';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(GroupMembership)
    private readonly memberships: Repository<GroupMembership>,
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  async findForUser(userId: string): Promise<GroupSummary | null> {
    const membership = await this.memberships.findOne({
      where: { userId },
      relations: { group: true },
    });

    return membership ? this.toSummary(membership) : null;
  }

  create(userId: string, details: CreateGroupDto): Promise<GroupSummary> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(GroupMembership, {
          where: { userId },
        });
        if (existing) {
          throw new ConflictException('Vous appartenez déjà à un groupe.');
        }

        const group = manager.create(Group, {
          id: randomUUID(),
          name: details.name,
          inviteCode: randomBytes(6)
            .toString('base64url')
            .slice(0, 8)
            .toUpperCase(),
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

        return this.toSummary(membership);
      }),
    );
  }

  private toSummary(membership: GroupMembership): GroupSummary {
    return {
      id: membership.group.id,
      name: membership.group.name,
      inviteCode: membership.group.inviteCode,
      role: membership.role,
      createdAt: membership.group.createdAt,
    };
  }
}
