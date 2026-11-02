import { BadRequestException, Injectable } from '@nestjs/common';
import type { ObjectiveRecurrence } from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { ListEntry } from '../lists/entities/list-entry.entity';
import { List } from '../lists/entities/list.entity';
import { ListChangesService } from '../lists/list-changes.service';
import { ObjectivePeriod } from './entities/objective-period.entity';
import { Objective } from './entities/objective.entity';
import { recordActivity } from './objective-activity.record';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveChangesService } from './objective-changes.service';
import { ObjectiveWriterService } from './objective-writer.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The same day of a later month, or the last one when that month is shorter. */
function addMonths(date: string, months: number): string {
  const start = toDate(date);
  const target = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return toIso(target);
}

/** The day the `count`-th next period starts, counted from `start`. */
export function periodStartAfter(
  start: string,
  recurrence: Exclude<ObjectiveRecurrence, 'none'>,
  count = 1,
): string {
  if (recurrence === 'weekly') {
    return toIso(new Date(toDate(start).getTime() + 7 * count * DAY_MS));
  }
  return addMonths(start, (recurrence === 'monthly' ? 1 : 12) * count);
}

/** Moves a date by as long as `from` to `to`. */
function shift(date: string, from: string, to: string): string {
  return toIso(
    new Date(
      toDate(date).getTime() + toDate(to).getTime() - toDate(from).getTime(),
    ),
  );
}

/**
 * Restarts recurring objectives whose period is over, the first time someone
 * looks at them: nothing runs in the background, and nobody can see the difference.
 * The whole tree resets and the result of the period is kept; what was logged
 * stays too, but only what falls in the current period counts.
 */
@Injectable()
export class ObjectiveRecurrenceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writer: ObjectiveWriterService,
    private readonly access: ObjectiveAccessService,
    private readonly changes: ObjectiveChangesService,
    private readonly listChanges: ListChangesService,
  ) {}

  /** `rootIds`: the trees about to be read. */
  async restartDue(
    rootIds: readonly string[],
    today = toIso(new Date()),
  ): Promise<void> {
    if (!rootIds.length) return;
    const recurring = (
      await this.dataSource.manager.find(Objective, {
        where: { id: In([...rootIds]) },
        select: { id: true, recurrence: true, periodStart: true },
      })
    ).filter((root) => this.isDue(root, today));
    for (const { id } of recurring) await this.restart(id, today);
  }

  /**
   * Starts a top-level objective again today, by hand, as a new period would:
   * how far it got is kept in its history, and its bar starts from zero. The
   * items of the lists that make a bar ("Liste" mode) are unchecked, or it
   * would be complete again at once; lists linked as shortcuts stay as they are.
   */
  async restartNow(
    objectiveId: string,
    userId: string,
    today = toIso(new Date()),
  ): Promise<void> {
    let unchecked: string[] = [];
    await this.writer.change(
      objectiveId,
      userId,
      'own',
      async ({ tree, node }, manager) => {
        if (node.parentId) {
          throw new BadRequestException(
            'Seul un objectif principal peut recommencer.',
          );
        }
        const { root } = tree;
        const start = root.periodStart ?? root.startDate;
        await manager.insert(ObjectivePeriod, {
          id: randomUUID(),
          objectiveId: root.id,
          startDate: start,
          endDate: today < start ? start : today,
          percent: tree.percent(root.id),
          completed: root.status === 'completed',
        });
        for (const objective of tree.nodes) {
          if (objective.status === 'completed') objective.status = 'active';
          objective.completedAt = null;
          objective.completedByUserId = null;
          objective.manualProgress = 0;
          if (objective.dueDate) {
            objective.dueDate = shift(objective.dueDate, start, today);
          }
          objective.startDate = shift(objective.startDate, start, today);
        }
        root.periodStart = today;
        await manager.save([...tree.nodes]);

        const listNodes = tree.nodes
          .filter(({ completion }) => completion === 'list')
          .map(({ id }) => id);
        unchecked = listNodes.length
          ? (
              await manager.find(List, {
                where: { objectiveId: In(listNodes) },
                select: { id: true },
              })
            ).map(({ id }) => id)
          : [];
        if (unchecked.length) {
          await manager.update(
            ListEntry,
            { listId: In(unchecked) },
            { done: false },
          );
        }
        await recordActivity(manager, root.id, userId, 'restarted');
      },
    );
    for (const listId of unchecked) await this.listChanges.changed(listId);
  }

  private isDue(
    { recurrence, periodStart }: Objective,
    today: string,
  ): boolean {
    return (
      recurrence !== 'none' &&
      !!periodStart &&
      periodStartAfter(periodStart, recurrence) <= today
    );
  }

  private async restart(rootId: string, today: string): Promise<void> {
    const before = await this.writer.inTransaction(async (manager) => {
      const tree = await this.access.loadTree(rootId, manager);
      // Someone else may have restarted it while this one waited for the lock.
      if (!tree || !this.isDue(tree.root, today)) return null;
      const { root } = tree;
      const recurrence = root.recurrence as Exclude<
        ObjectiveRecurrence,
        'none'
      >;
      const periodStart = root.periodStart!;

      let count = 1;
      while (periodStartAfter(periodStart, recurrence, count + 1) <= today) {
        count += 1;
      }
      const next = periodStartAfter(periodStart, recurrence, count);
      const ended = periodStartAfter(periodStart, recurrence);

      await manager.insert(ObjectivePeriod, {
        id: randomUUID(),
        objectiveId: root.id,
        startDate: periodStart,
        endDate: toIso(new Date(toDate(ended).getTime() - DAY_MS)),
        percent: tree.percent(root.id),
        completed: root.status === 'completed',
      });

      for (const node of tree.nodes) {
        // A pause outlives the period; anything else starts again.
        if (node.status === 'completed') node.status = 'active';
        node.completedAt = null;
        node.completedByUserId = null;
        node.manualProgress = 0;
        if (node.dueDate) node.dueDate = shift(node.dueDate, periodStart, next);
        node.startDate = shift(node.startDate, periodStart, next);
      }
      root.periodStart = next;
      await manager.save([...tree.nodes]);
      await recordActivity(manager, root.id, null, 'restarted');
      await this.writer.settle(root.id, null, manager);
      return tree;
    });
    if (before) {
      await this.changes.published({
        before,
        objectiveId: rootId,
        actorId: '',
      });
    }
  }
}
