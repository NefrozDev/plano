import { Injectable } from '@nestjs/common';
import type { ObjectiveNewsKind } from '@plano/common';
import { DataSource, EntityManager } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import type { Objective } from './entities/objective.entity';
import {
  ObjectiveAccess,
  ObjectiveAccessService,
  ObjectivePermission,
} from './objective-access.service';
import { ObjectiveChangesService } from './objective-changes.service';
import type { ObjectiveTree } from './objective-tree';

/**
 * Reaching 100 % completes an objective and undoing progress reopens it, so the
 * status never contradicts the data. Objectives without a bar are completed by
 * hand, and paused ones keep their status until resumed.
 */
export function settleStatuses(
  tree: ObjectiveTree,
  actorId: string,
  now = new Date(),
): Objective[] {
  const changed: Objective[] = [];
  for (const node of tree.nodes) {
    const progress = tree.exactProgress(node.id);
    if (progress === null || node.status === 'paused') continue;
    if (progress >= 100 && node.status !== 'completed') {
      node.status = 'completed';
      node.completedAt = now;
      node.completedByUserId = actorId;
      changed.push(node);
    } else if (progress < 100 && node.status === 'completed') {
      node.status = 'active';
      node.completedAt = null;
      node.completedByUserId = null;
      changed.push(node);
    }
  }
  return changed;
}

/** Every change to an objective tree goes through here, one at a time. */
@Injectable()
export class ObjectiveWriterService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly access: ObjectiveAccessService,
    private readonly changes: ObjectiveChangesService,
  ) {}

  /**
   * Runs the change on an existing objective, once the user is allowed to, then
   * tells those concerned. `news` is what the others should hear about it.
   */
  async change<T>(
    objectiveId: string,
    userId: string,
    permission: ObjectivePermission,
    operation: (access: ObjectiveAccess, manager: EntityManager) => Promise<T>,
    news?: ObjectiveNewsKind,
  ): Promise<T> {
    const { result, before, completed } = await this.inTransaction(
      async (manager) => {
        const access = await this.access.require(
          objectiveId,
          userId,
          permission,
          manager,
        );
        const result = await operation(access, manager);
        const changed = await this.settle(access.node.rootId, userId, manager);
        return {
          result,
          before: access.tree,
          completed: changed.filter(({ status }) => status === 'completed'),
        };
      },
    );
    await this.changes.published({
      before,
      objectiveId,
      actorId: userId,
      news,
      completed,
    });
    return result;
  }

  /** For what has no objective to check first: a new tree, an import. */
  inTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(operation),
    );
  }

  /**
   * Brings the statuses of a tree in line with its progress, and answers what
   * changed; a deleted tree is skipped.
   */
  async settle(
    rootId: string,
    actorId: string,
    manager: EntityManager,
  ): Promise<Objective[]> {
    const tree = await this.access.loadTree(rootId, manager);
    if (!tree) return [];
    const changed = settleStatuses(tree, actorId);
    if (changed.length) await manager.save(changed);
    return changed;
  }
}
