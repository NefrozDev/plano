import { Injectable, NotFoundException } from '@nestjs/common';
import type { HomeList } from '@plano/common';
import { DataSource, In } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { ListEntry } from './entities/list-entry.entity';
import { ListPreference } from './entities/list-preference.entity';
import { ListAccess, ListAccessService } from './list-access.service';

/** Unchecked items shown per list on the home page. */
export const HOME_ENTRY_LIMIT = 5;

export interface ArrangedList extends ListAccess {
  onHome: boolean;
}

/** Each person's own arrangement of the lists they can open: order and home page. */
@Injectable()
export class ListPreferencesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly access: ListAccessService,
  ) {}

  /**
   * Lists the person placed come first, in their order; the others follow in
   * the order they were found (owned, then shared, oldest first).
   */
  async arrange(
    userId: string,
    accesses: ListAccess[],
  ): Promise<ArrangedList[]> {
    const preferences = accesses.length
      ? await this.dataSource.manager.find(ListPreference, {
          where: { userId, listId: In(accesses.map(({ list }) => list.id)) },
        })
      : [];
    const byList = new Map(preferences.map((row) => [row.listId, row]));
    const place = (listId: string) =>
      byList.get(listId)?.position ?? Number.MAX_SAFE_INTEGER;

    return accesses
      .map((access, index) => ({ access, index }))
      .sort(
        (first, second) =>
          place(first.access.list.id) - place(second.access.list.id) ||
          first.index - second.index,
      )
      .map(({ access }) => ({
        ...access,
        onHome: byList.get(access.list.id)?.onHome ?? false,
      }));
  }

  async isOnHome(userId: string, listId: string): Promise<boolean> {
    const row = await this.dataSource.manager.findOne(ListPreference, {
      where: { userId, listId },
    });
    return row?.onHome ?? false;
  }

  /**
   * Places `listIds` in this order. Lists left out lose their place and go
   * after them, so a partial order never collides with an older one.
   */
  async reorder(userId: string, listIds: string[]): Promise<void> {
    const reachable = new Set(
      (await this.access.findAll(userId)).map(({ list }) => list.id),
    );
    if (listIds.some((listId) => !reachable.has(listId))) {
      throw new NotFoundException('Liste introuvable.');
    }
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await manager.update(ListPreference, { userId }, { position: null });
        if (!listIds.length) return;
        await manager.upsert(
          ListPreference,
          listIds.map((listId, position) => ({ userId, listId, position })),
          ['userId', 'listId'],
        );
      }),
    );
  }

  async setOnHome(
    userId: string,
    listId: string,
    onHome: boolean,
  ): Promise<void> {
    await this.access.require(listId, userId, 'read');
    await this.writeLock.runExclusive(() =>
      this.dataSource.manager.upsert(
        ListPreference,
        { userId, listId, onHome },
        ['userId', 'listId'],
      ),
    );
  }

  /** Pinned, unarchived lists in the person's order, each with its first unchecked items. */
  async home(userId: string): Promise<HomeList[]> {
    const pinned = (
      await this.arrange(userId, await this.access.findAll(userId))
    ).filter(({ onHome, list }) => onHome && !list.archived);
    if (!pinned.length) return [];

    const unchecked = await this.dataSource.manager
      .createQueryBuilder(ListEntry, 'entry')
      .innerJoin('entry.section', 'section')
      .select(['entry.id', 'entry.listId', 'entry.name'])
      .where('entry.listId IN (:...listIds)', {
        listIds: pinned.map(({ list }) => list.id),
      })
      .andWhere('entry.done = false')
      .orderBy('section.position', 'ASC')
      .addOrderBy('entry.position', 'ASC')
      .getMany();

    return pinned.map(({ list, role }) => {
      const entries = unchecked.filter((entry) => entry.listId === list.id);
      return {
        id: list.id,
        name: list.name,
        icon: list.icon,
        color: list.color,
        role,
        remaining: entries.length,
        entries: entries
          .slice(0, HOME_ENTRY_LIMIT)
          .map(({ id, name }) => ({ id, name })),
      };
    });
  }
}
