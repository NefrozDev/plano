import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ListDetail,
  ListMember as ListMemberResponse,
  ListReminder,
  ListSummary,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { GroupsService } from '../groups/groups.service';
import { User } from '../users/user.entity';
import type { CreateListDto, UpdateListDto } from './dto/list.dto';
import { sentFields } from './dto/validation';
import type {
  AddListMemberDto,
  UpdateListMemberDto,
} from './dto/member-settings.dto';
import { ListEntry } from './entities/list-entry.entity';
import { ListMember } from './entities/list-member.entity';
import { ListSection } from './entities/list-section.entity';
import { List } from './entities/list.entity';
import { ListAccess, ListAccessService } from './list-access.service';
import { displayName, toSectionResponse } from './list.mapper';

@Injectable()
export class ListsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly access: ListAccessService,
    private readonly groups: GroupsService,
  ) {}

  async findAll(userId: string): Promise<ListSummary[]> {
    const accesses = await this.access.findAll(userId);
    const manager = this.dataSource.manager;
    const listIds = accesses.map(({ list }) => list.id);
    const entries = listIds.length
      ? await manager.find(ListEntry, {
          where: { listId: In(listIds) },
          select: { listId: true, done: true },
        })
      : [];
    const members = listIds.length
      ? await manager.find(ListMember, {
          where: { listId: In(listIds) },
          select: { listId: true },
        })
      : [];

    return accesses.map(({ list, role }) => {
      const listEntries = entries.filter((entry) => entry.listId === list.id);
      return this.toSummary(list, role, userId, {
        memberCount:
          1 + members.filter((member) => member.listId === list.id).length,
        completed: listEntries.filter((entry) => entry.done).length,
        total: listEntries.length,
      });
    });
  }

  async findOne(listId: string, userId: string): Promise<ListDetail> {
    return this.toDetail(
      await this.access.require(listId, userId, 'read'),
      userId,
    );
  }

  async create(userId: string, details: CreateListDto): Promise<ListDetail> {
    const list = await this.writeLock.runExclusive(() =>
      this.dataSource.manager.save(
        this.dataSource.manager.create(List, {
          id: randomUUID(),
          ownerId: userId,
          name: details.name,
          icon: details.icon,
          color: details.color,
          description: details.description ?? '',
          archived: false,
        }),
      ),
    );
    return this.toDetail({ list, role: 'owner' }, userId);
  }

  async update(
    listId: string,
    userId: string,
    changes: UpdateListDto,
  ): Promise<ListDetail> {
    const access = await this.writeLock.runExclusive(async () => {
      const access = await this.access.require(listId, userId, 'own');
      Object.assign(access.list, sentFields(changes));
      await this.dataSource.manager.save(access.list);
      return access;
    });
    return this.toDetail(access, userId);
  }

  async remove(listId: string, userId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.access.require(listId, userId, 'own', manager);
        await manager.delete(ListEntry, { listId });
        await manager.delete(ListSection, { listId });
        await manager.delete(ListMember, { listId });
        await manager.delete(List, { id: listId });
      }),
    );
  }

  /** Shares the list with someone from the owner's group. */
  async addMember(
    listId: string,
    userId: string,
    details: AddListMemberDto,
  ): Promise<ListMemberResponse> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.access.require(listId, userId, 'own', manager);
        if (details.userId === userId) {
          throw new BadRequestException(
            'Vous êtes déjà propriétaire de la liste.',
          );
        }
        if (!(await this.groups.areGroupMates(userId, details.userId))) {
          throw new BadRequestException(
            'Vous ne pouvez partager une liste qu’avec les membres de vos groupes.',
          );
        }
        if (
          await manager.findOne(ListMember, {
            where: { listId, userId: details.userId },
          })
        ) {
          throw new ConflictException(
            'Cette personne a déjà accès à la liste.',
          );
        }

        const member = await manager.save(
          manager.create(ListMember, {
            id: randomUUID(),
            listId,
            userId: details.userId,
            role: details.role,
          }),
        );
        return this.toMemberResponse(manager, member);
      }),
    );
  }

  async updateMember(
    listId: string,
    memberUserId: string,
    userId: string,
    changes: UpdateListMemberDto,
  ): Promise<ListMemberResponse> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.access.require(listId, userId, 'own', manager);
        const member = await this.requireMember(manager, listId, memberUserId);
        member.role = changes.role;
        await manager.save(member);
        return this.toMemberResponse(manager, member);
      }),
    );
  }

  /** The owner removes anyone; a member can remove themself to leave the list. */
  async removeMember(
    listId: string,
    memberUserId: string,
    userId: string,
  ): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const { role } = await this.access.require(
          listId,
          userId,
          'read',
          manager,
        );
        if (role !== 'owner' && memberUserId !== userId) {
          throw new ForbiddenException(
            'Seul le propriétaire de la liste peut retirer un membre.',
          );
        }
        const member = await this.requireMember(manager, listId, memberUserId);
        await manager.delete(ListMember, { id: member.id });
      }),
    );
  }

  /** Stops sharing: everyone but the owner loses access. */
  async removeAllMembers(listId: string, userId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await this.access.require(listId, userId, 'own', manager);
        await manager.delete(ListMember, { listId });
      }),
    );
  }

  /** Entries with a reminder, across every list the user can see. */
  async findReminders(userId: string): Promise<ListReminder[]> {
    const lists = (await this.access.findAll(userId)).map(({ list }) => list);
    if (!lists.length) return [];
    const entries = await this.dataSource.manager.find(ListEntry, {
      where: { listId: In(lists.map(({ id }) => id)), reminder: Not(IsNull()) },
      order: { reminder: 'ASC' },
    });
    return entries.map((entry) => {
      const list = lists.find(({ id }) => id === entry.listId)!;
      return {
        listId: list.id,
        listName: list.name,
        listColor: list.color,
        entryId: entry.id,
        name: entry.name,
        done: entry.done,
        reminder: entry.reminder!,
      };
    });
  }

  private async toDetail(
    { list, role }: ListAccess,
    userId: string,
  ): Promise<ListDetail> {
    const manager = this.dataSource.manager;
    const owner = await manager.findOneByOrFail(User, { id: list.ownerId });
    const members = await manager.find(ListMember, {
      where: { listId: list.id },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    const sections = await manager.find(ListSection, {
      where: { listId: list.id },
      order: { position: 'ASC' },
    });
    const entries = await manager.find(ListEntry, {
      where: { listId: list.id },
      relations: { addedBy: true },
      order: { position: 'ASC' },
    });

    return {
      ...this.toSummary(list, role, userId, {
        memberCount: members.length + 1,
        completed: entries.filter((entry) => entry.done).length,
        total: entries.length,
      }),
      description: list.description,
      members: [
        { id: owner.id, name: displayName(owner), role: 'owner' },
        ...members.map((member) => ({
          id: member.userId,
          name: displayName(member.user),
          role: member.role,
        })),
      ],
      sections: sections.map((section) =>
        toSectionResponse(
          section,
          entries.filter((entry) => entry.sectionId === section.id),
        ),
      ),
    };
  }

  private toSummary(
    list: List,
    role: ListAccess['role'],
    userId: string,
    counts: Pick<ListSummary, 'memberCount' | 'completed' | 'total'>,
  ): ListSummary {
    return {
      id: list.id,
      name: list.name,
      icon: list.icon,
      color: list.color,
      archived: list.archived,
      ownership: list.ownerId === userId ? 'mine' : 'shared',
      role,
      ...counts,
    };
  }

  private async requireMember(
    manager: EntityManager,
    listId: string,
    userId: string,
  ): Promise<ListMember> {
    const member = await manager.findOne(ListMember, {
      where: { listId, userId },
    });
    if (!member) {
      throw new NotFoundException('Cette personne n’a pas accès à la liste.');
    }
    return member;
  }

  private async toMemberResponse(
    manager: EntityManager,
    member: ListMember,
  ): Promise<ListMemberResponse> {
    const user = await manager.findOneByOrFail(User, { id: member.userId });
    return { id: member.userId, name: displayName(user), role: member.role };
  }
}
