import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ListEntry as ListEntryResponse,
  ListSection as ListSectionResponse,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import type {
  CreateEntryDto,
  CreateSectionDto,
  ReorderEntriesDto,
  ReorderSectionsDto,
  UpdateEntryDto,
  UpdateSectionDto,
} from './dto/section-entry.dto';
import { sentFields } from './dto/validation';
import { ListEntry } from './entities/list-entry.entity';
import { ListMember } from './entities/list-member.entity';
import { ListSection } from './entities/list-section.entity';
import { List } from './entities/list.entity';
import { ListAccessService } from './list-access.service';
import { toEntryResponse, toSectionResponse } from './list.mapper';

/** True when `ids` names every row exactly once, in any order. */
function isPermutation(ids: string[], rows: { id: string }[]): boolean {
  const current = new Set(rows.map(({ id }) => id));
  return (
    ids.length === current.size &&
    new Set(ids).size === ids.length &&
    ids.every((id) => current.has(id))
  );
}

/** Sections and entries: anyone who can edit the list (owner and editors). */
@Injectable()
export class ListContentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly access: ListAccessService,
  ) {}

  async addSection(
    listId: string,
    userId: string,
    details: CreateSectionDto,
  ): Promise<ListSectionResponse> {
    return this.inTransaction(listId, userId, async (manager) => {
      const section = await manager.save(
        manager.create(ListSection, {
          id: randomUUID(),
          listId,
          name: details.name,
          color: details.color,
          position: await manager.count(ListSection, { where: { listId } }),
        }),
      );
      return toSectionResponse(section, []);
    });
  }

  async renameSection(
    listId: string,
    sectionId: string,
    userId: string,
    { name }: UpdateSectionDto,
  ): Promise<void> {
    await this.inTransaction(listId, userId, async (manager) => {
      const section = await this.requireSection(manager, listId, sectionId);
      section.name = name;
      await manager.save(section);
    });
  }

  /** Deletes the section and, through the foreign key cascade, its entries. */
  async removeSection(
    listId: string,
    sectionId: string,
    userId: string,
  ): Promise<void> {
    await this.inTransaction(listId, userId, async (manager) => {
      await this.requireSection(manager, listId, sectionId);
      await manager.delete(ListSection, { id: sectionId });
      // New sections take `count` as their position: close the gap so they
      // never share a position with an existing one.
      const remaining = await manager.find(ListSection, {
        where: { listId },
        order: { position: 'ASC' },
      });
      remaining.forEach((section, index) => {
        section.position = index;
      });
      await manager.save(remaining);
    });
  }

  /** Takes every section id of the list exactly once, in the new order. */
  async reorderSections(
    listId: string,
    userId: string,
    { sectionIds }: ReorderSectionsDto,
  ): Promise<void> {
    await this.inTransaction(listId, userId, async (manager) => {
      const sections = await manager.find(ListSection, { where: { listId } });
      if (!isPermutation(sectionIds, sections)) {
        throw new BadRequestException(
          'L’ordre doit contenir chaque section de la liste une seule fois.',
        );
      }
      for (const section of sections) {
        section.position = sectionIds.indexOf(section.id);
      }
      await manager.save(sections);
    });
  }

  async addEntry(
    listId: string,
    sectionId: string,
    userId: string,
    details: CreateEntryDto,
  ): Promise<ListEntryResponse> {
    return this.inTransaction(listId, userId, async (manager) => {
      await this.requireSection(manager, listId, sectionId);
      const entry = await manager.save(
        manager.create(ListEntry, {
          id: randomUUID(),
          listId,
          sectionId,
          name: details.name,
          addedByUserId: userId,
          position: await manager.count(ListEntry, { where: { sectionId } }),
        }),
      );
      return this.toResponse(manager, entry.id);
    });
  }

  async updateEntry(
    listId: string,
    entryId: string,
    userId: string,
    changes: UpdateEntryDto,
  ): Promise<ListEntryResponse> {
    return this.inTransaction(listId, userId, async (manager, list) => {
      const entry = await this.requireEntry(manager, listId, entryId);
      const { assignedTo, ...fields } = sentFields(changes);
      if (assignedTo !== undefined) {
        if (assignedTo !== null) {
          await this.requireListMember(manager, list, assignedTo);
        }
        entry.assignedToUserId = assignedTo;
      }
      Object.assign(entry, fields);
      await manager.save(entry);
      return this.toResponse(manager, entry.id);
    });
  }

  async removeEntry(
    listId: string,
    entryId: string,
    userId: string,
  ): Promise<void> {
    await this.inTransaction(listId, userId, async (manager) => {
      const entry = await this.requireEntry(manager, listId, entryId);
      await manager.delete(ListEntry, { id: entry.id });
    });
  }

  /** Rewrites the order of a section: the request must list each of its entries once. */
  async reorderEntries(
    listId: string,
    sectionId: string,
    userId: string,
    { entryIds }: ReorderEntriesDto,
  ): Promise<void> {
    await this.inTransaction(listId, userId, async (manager) => {
      await this.requireSection(manager, listId, sectionId);
      const entries = await manager.find(ListEntry, { where: { sectionId } });
      if (!isPermutation(entryIds, entries)) {
        throw new BadRequestException(
          'L’ordre doit contenir chaque élément de la section une seule fois.',
        );
      }
      for (const entry of entries) {
        entry.position = entryIds.indexOf(entry.id);
      }
      await manager.save(entries);
    });
  }

  private inTransaction<T>(
    listId: string,
    userId: string,
    operation: (manager: EntityManager, list: List) => Promise<T>,
  ): Promise<T> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const { list } = await this.access.require(
          listId,
          userId,
          'edit',
          manager,
        );
        return operation(manager, list);
      }),
    );
  }

  private async requireSection(
    manager: EntityManager,
    listId: string,
    sectionId: string,
  ): Promise<ListSection> {
    const section = await manager.findOne(ListSection, {
      where: { id: sectionId, listId },
    });
    if (!section) throw new NotFoundException('Section introuvable.');
    return section;
  }

  private async requireEntry(
    manager: EntityManager,
    listId: string,
    entryId: string,
  ): Promise<ListEntry> {
    const entry = await manager.findOne(ListEntry, {
      where: { id: entryId, listId },
    });
    if (!entry) throw new NotFoundException('Élément introuvable.');
    return entry;
  }

  /** Entries can only be assigned to people who can see the list. */
  private async requireListMember(
    manager: EntityManager,
    list: List,
    userId: string,
  ): Promise<void> {
    const isMember =
      list.ownerId === userId ||
      !!(await manager.findOne(ListMember, {
        where: { listId: list.id, userId },
      }));
    if (!isMember) {
      throw new BadRequestException(
        'Un élément ne peut être assigné qu’à un membre de la liste.',
      );
    }
  }

  private async toResponse(
    manager: EntityManager,
    entryId: string,
  ): Promise<ListEntryResponse> {
    return toEntryResponse(
      await manager.findOneOrFail(ListEntry, {
        where: { id: entryId },
        relations: { addedBy: true },
      }),
    );
  }
}
