import { Injectable, NotFoundException } from '@nestjs/common';
import type { ObjectiveDetail } from '@plano/common';
import { DataSource, In } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import type { UpdateObjectivePreferencesDto } from './dto/objective.dto';
import { ObjectivePreference } from './entities/objective-preference.entity';
import {
  ObjectiveAccess,
  ObjectiveAccessService,
} from './objective-access.service';
import { ObjectiveViewService } from './objective-view.service';

/** Each person's own arrangement of the objectives they can open. */
@Injectable()
export class ObjectivePreferencesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly access: ObjectiveAccessService,
    private readonly view: ObjectiveViewService,
  ) {}

  /**
   * Objectives the person placed come first, in their order; the others follow
   * in the order they were found.
   */
  async arrange<T extends ObjectiveAccess>(
    userId: string,
    accesses: readonly T[],
  ): Promise<T[]> {
    const rows = accesses.length
      ? await this.dataSource.manager.find(ObjectivePreference, {
          where: {
            userId,
            objectiveId: In(accesses.map(({ node }) => node.id)),
          },
        })
      : [];
    const positions = new Map(
      rows.map((row) => [row.objectiveId, row.position]),
    );
    const place = (id: string) => positions.get(id) ?? Number.MAX_SAFE_INTEGER;

    return accesses
      .map((access, index) => ({ access, index }))
      .sort(
        (first, second) =>
          place(first.access.node.id) - place(second.access.node.id) ||
          first.index - second.index,
      )
      .map(({ access }) => access);
  }

  /**
   * Places `objectiveIds` in this order. Objectives left out lose their place
   * and go after them, so a partial order never collides with an older one.
   */
  async reorder(userId: string, objectiveIds: string[]): Promise<void> {
    const reachable = new Set(
      (await this.access.findTops(userId)).map(({ node }) => node.id),
    );
    if (objectiveIds.some((id) => !reachable.has(id))) {
      throw new NotFoundException('Objectif introuvable.');
    }
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        await manager.update(
          ObjectivePreference,
          { userId },
          { position: null },
        );
        if (!objectiveIds.length) return;
        await manager.upsert(
          ObjectivePreference,
          objectiveIds.map((objectiveId, position) => ({
            userId,
            objectiveId,
            position,
          })),
          ['userId', 'objectiveId'],
        );
      }),
    );
  }

  async update(
    id: string,
    userId: string,
    { onHome, reminder, dueReminder }: UpdateObjectivePreferencesDto,
  ): Promise<ObjectiveDetail> {
    const access = await this.access.require(id, userId, 'read');
    await this.writeLock.runExclusive(() =>
      this.dataSource.manager.upsert(
        ObjectivePreference,
        {
          userId,
          objectiveId: id,
          ...(onHome !== undefined && { onHome }),
          ...(reminder && {
            reminderFrequency: reminder.frequency,
            reminderTime: reminder.time,
            reminderWeekday: reminder.weekday,
          }),
          ...(dueReminder && { dueReminder }),
        },
        ['userId', 'objectiveId'],
      ),
    );
    return this.view.detail(access, userId);
  }
}
