import { Injectable } from '@nestjs/common';
import type { ImportObjectivesResponse } from '@plano/common';
import { createHash } from 'node:crypto';
import { EntityManager, In } from 'typeorm';
import type {
  ImportObjectivesDto,
  ImportedObjectiveDto,
} from './dto/import-objectives.dto';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import { Objective } from './entities/objective.entity';
import { ObjectiveWriterService } from './objective-writer.service';

/**
 * The same parts always give the same id. An answer lost on the way makes the
 * browser send its objectives again: they are recognised, not created twice.
 */
export function stableId(...parts: readonly string[]): string {
  const hash = createHash('sha256').update(parts.join('\0')).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

/** A local day as a timestamp, at noon so that no time zone moves it to another day. */
function atNoon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

/**
 * Once, what a browser stored before objectives moved to the API. Shared people
 * were made up in that browser, so imported objectives start private.
 */
@Injectable()
export class ObjectiveImportService {
  constructor(private readonly writer: ObjectiveWriterService) {}

  async import(
    userId: string,
    { objectives, offset = 0 }: ImportObjectivesDto,
  ): Promise<ImportObjectivesResponse> {
    return this.writer.inTransaction(async (manager) => {
      const ids = objectives.map(({ localId }) => stableId(userId, localId));
      const existing = new Set(
        (
          await manager.find(Objective, {
            where: { id: In(ids) },
            select: { id: true },
          })
        ).map(({ id }) => id),
      );

      let imported = 0;
      for (const [position, objective] of objectives.entries()) {
        if (existing.has(ids[position])) continue;
        await this.importOne(
          userId,
          objective,
          ids[position],
          offset + position,
          manager,
        );
        await this.writer.settle(ids[position], userId, manager);
        imported += 1;
      }
      return { imported };
    });
  }

  private async importOne(
    userId: string,
    local: ImportedObjectiveDto,
    id: string,
    position: number,
    manager: EntityManager,
  ): Promise<void> {
    const completion = {
      metric: 'metric',
      steps: 'children',
      habit: 'habit',
    } as const;
    await manager.save(
      manager.create(Objective, {
        id,
        rootId: id,
        parentId: null,
        ownerId: userId,
        title: local.title,
        category: local.category,
        description: local.description,
        plan: local.plan,
        completion: completion[local.tracking],
        metricUnit: local.metric?.unit ?? null,
        metricTarget: local.metric?.target ?? null,
        metricAggregation: local.metric?.aggregation ?? null,
        habitTargetDays: local.habit?.targetDays ?? null,
        startDate: local.createdOn,
        dueDate: local.dueDate,
        status: local.status,
        completedAt:
          local.status === 'completed'
            ? atNoon(local.completedOn ?? local.createdOn)
            : null,
        completedByUserId: local.status === 'completed' ? userId : null,
        archived: local.archived,
      }),
    );

    await manager.save(
      local.steps.map((step, index) =>
        manager.create(Objective, {
          id: stableId(id, 'step', String(index)),
          rootId: id,
          parentId: id,
          ownerId: userId,
          title: step.label,
          category: local.category,
          completion: 'none',
          startDate: local.createdOn,
          position: index,
          status: step.done ? 'completed' : 'active',
          completedAt: step.done
            ? atNoon(step.completedOn ?? local.createdOn)
            : null,
          completedByUserId: step.done ? userId : null,
        }),
      ),
    );
    await manager.save(
      local.sessions.map((session, index) =>
        manager.create(ObjectiveSession, {
          id: stableId(id, 'session', String(index)),
          objectiveId: id,
          authorId: userId,
          date: session.date,
          status: session.status,
          label: session.label,
          value: session.value,
          durationMinutes: session.durationMinutes,
        }),
      ),
    );
    const days = [...new Set(local.habit?.checkIns ?? [])];
    await manager.save(
      days.map((date) =>
        manager.create(ObjectiveCheckInRow, {
          objectiveId: id,
          userId,
          date,
        }),
      ),
    );
    await manager.save(
      manager.create(ObjectivePreference, {
        userId,
        objectiveId: id,
        position,
        onHome: false,
        reminderFrequency: local.reminder.frequency,
        reminderTime: local.reminder.time,
        reminderWeekday: local.reminder.weekday,
        dueReminder: local.dueReminder,
      }),
    );
  }
}
