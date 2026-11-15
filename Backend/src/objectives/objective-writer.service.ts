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
import { recordActivity } from './objective-activity.record';
import { ObjectiveChangesService } from './objective-changes.service';
import type { ObjectiveTree } from './objective-tree';

/**
 * Reaching 100 % completes an objective and undoing progress reopens it, so the
 * status never contradicts the data. An objective without a bar is done once
 * all its sub-objectives are, and only a leaf one is completed by hand. Paused
 * ones keep their status until resumed.
 */
export function settleStatuses(
  tree: ObjectiveTree,
  actorId: string | null,
  now = new Date(),
): Objective[] {
  const changed: Objective[] = [];
  // Deepest first: a parent is judged on its children's settled statuses, and
  // the tree caches progress, so no parent may be computed before its children.
  const deepestFirst = [...tree.nodes].sort(
    (first, second) => tree.levelOf(second.id) - tree.levelOf(first.id),
  );
  for (const node of deepestFirst) {
    if (node.status === 'paused') continue;
    const progress = childrenDone(tree, node) ?? tree.exactProgress(node.id);
    if (progress === null) continue;
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

/** 100 or 0 for an objective without a bar that has sub-objectives; null otherwise. */
function childrenDone(tree: ObjectiveTree, node: Objective): number | null {
  if (node.completion !== 'none') return null;
  const children = tree.childrenOf(node.id).filter(({ archived }) => !archived);
  if (!children.length) return null;
  return children.every(({ status }) => status === 'completed') ? 100 : 0;
}

/** True when the objective's status follows its sub-objectives, not a click. */
export function completedThroughChildren(
  tree: ObjectiveTree,
  node: Objective,
): boolean {
  return childrenDone(tree, node) !== null;
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
   * tells those concerned. `options.news` is what the others should hear about it.
   */
  async change<T>(
    objectiveId: string,
    userId: string,
    permission: ObjectivePermission,
    operation: (access: ObjectiveAccess, manager: EntityManager) => Promise<T>,
    options: { news?: ObjectiveNewsKind; itemId?: string } = {},
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
      news: options.news,
      itemId: options.itemId,
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
    actorId: string | null,
    manager: EntityManager,
  ): Promise<Objective[]> {
    const tree = await this.access.loadTree(rootId, manager);
    if (!tree) return [];
    const changed = settleStatuses(tree, actorId);
    if (changed.length) await manager.save(changed);
    for (const node of changed) {
      await recordActivity(
        manager,
        node.id,
        actorId,
        node.status === 'completed' ? 'completed' : 'reopened',
      );
    }
    return changed;
  }
}
