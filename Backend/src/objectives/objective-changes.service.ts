import { Injectable, Logger } from '@nestjs/common';
import type { ObjectiveNewsKind } from '@plano/common';
import { DataSource } from 'typeorm';
import { displayName } from '../lists/list.mapper';
import { LiveEventsService } from '../live/live-events.service';
import { User } from '../users/user.entity';
import { Objective } from './entities/objective.entity';
import { ObjectiveAccessService } from './objective-access.service';
import type { ObjectiveTree } from './objective-tree';

export interface ObjectiveChange {
  /** The tree as it was before the change. */
  before: ObjectiveTree;
  objectiveId: string;
  actorId: string;
  /** What the others should hear about, beyond the screens reloading. */
  news?: ObjectiveNewsKind;
  /** Objectives this change completed. */
  completed?: readonly Objective[];
}

/** Everyone concerned by a node: who can open it, and who was invited below it. */
function peopleAround(tree: ObjectiveTree, id: string): Set<string> {
  const nodes = [...tree.pathTo(id), ...tree.descendantsOf(id)];
  return new Set([
    tree.root.ownerId,
    ...nodes.flatMap((node) =>
      tree.membershipsOn(node.id).map(({ userId }) => userId),
    ),
  ]);
}

/**
 * The id an event about `id` may carry for this person: an id above what was
 * shared with them is never sent, so they hear about their own part of the tree.
 */
function idsFor(tree: ObjectiveTree, id: string, userId: string): string[] {
  if (tree.roleOf(id, userId)) return [id];
  return tree
    .topsFor(userId)
    .filter((top) =>
      tree.ancestorsOf(top.id).some((ancestor) => ancestor.id === id),
    )
    .map((top) => top.id);
}

/**
 * Tells everyone who may have an objective open that it changed. Called once the
 * write is committed: a failure here never undoes it, the event is just lost.
 */
@Injectable()
export class ObjectiveChangesService {
  private readonly logger = new Logger(ObjectiveChangesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: ObjectiveAccessService,
    private readonly live: LiveEventsService,
  ) {}

  async published(change: ObjectiveChange): Promise<void> {
    try {
      const after = await this.access.loadTree(change.before.root.id);
      this.announce(change, after);
      if (after) await this.tellNews(change, after);
    } catch (error) {
      this.logger.warn(
        `No live event for objective ${change.objectiveId}: ${String(error)}`,
      );
    }
  }

  /** A person was given access: they hear it, and what it is. */
  async invited(
    objectiveId: string,
    actorId: string,
    userIds: readonly string[],
  ): Promise<void> {
    try {
      const tree = await this.treeOf(objectiveId);
      const node = tree?.node(objectiveId);
      if (!node || !userIds.length) return;
      this.live.publish(userIds, {
        type: 'objective.news',
        objectiveId,
        kind: 'invited',
        title: node.title,
        actor: await this.nameOf(actorId),
      });
    } catch (error) {
      this.logger.warn(
        `No invitation event for objective ${objectiveId}: ${String(error)}`,
      );
    }
  }

  private async treeOf(objectiveId: string): Promise<ObjectiveTree | null> {
    const row = await this.dataSource.manager.findOne(Objective, {
      where: { id: objectiveId },
      select: { id: true, rootId: true },
    });
    return row ? this.access.loadTree(row.rootId) : null;
  }

  private announce(
    { before, objectiveId }: ObjectiveChange,
    after: ObjectiveTree | null,
  ): void {
    // A deleted sub-objective changes its parent.
    const anchor = after?.node(objectiveId)
      ? objectiveId
      : before.node(objectiveId)?.parentId;

    if (after && anchor && after.node(anchor)) {
      const changed = new Map<string, string[]>();
      for (const userId of peopleAround(after, anchor)) {
        for (const id of idsFor(after, anchor, userId)) {
          changed.set(id, [...(changed.get(id) ?? []), userId]);
        }
      }
      for (const [id, userIds] of changed) {
        this.live.publish(userIds, {
          type: 'objective.changed',
          objectiveId: id,
        });
      }
    }

    // Those who could open it and no longer can: gone, or no longer invited.
    const lost = new Map<string, string[]>();
    for (const userId of peopleAround(before, objectiveId)) {
      for (const id of idsFor(before, objectiveId, userId)) {
        if (!after?.roleOf(id, userId)) {
          lost.set(id, [...(lost.get(id) ?? []), userId]);
        }
      }
    }
    for (const [id, userIds] of lost) {
      this.live.publish(userIds, {
        type: 'objective.removed',
        objectiveId: id,
      });
    }
  }

  private async tellNews(
    { objectiveId, actorId, news, completed = [] }: ObjectiveChange,
    after: ObjectiveTree,
  ): Promise<void> {
    const node = after.node(objectiveId);
    const completedHere = completed.some(({ id }) => id === objectiveId);
    if (!completed.length && !(news && node)) return;

    const actor = await this.nameOf(actorId);
    const tell = (target: Objective, kind: ObjectiveNewsKind) => {
      const people = [...peopleAround(after, target.id)].filter(
        (userId) => userId !== actorId && after.roleOf(target.id, userId),
      );
      if (!people.length) return;
      this.live.publish(people, {
        type: 'objective.news',
        objectiveId: target.id,
        kind,
        title: target.title,
        actor,
      });
    };
    // Completing it says more than contributing to it.
    if (news && node && !completedHere) tell(node, news);
    for (const target of completed) tell(target, 'completed');
  }

  private async nameOf(userId: string): Promise<string> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { id: userId },
    });
    return user ? displayName(user) : '';
  }
}
