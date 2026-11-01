import { Injectable } from '@nestjs/common';
import type {
  ObjectiveDetail,
  ObjectivePerson,
  ObjectiveRole,
  ObjectiveSummary,
} from '@plano/common';
import { DataSource, In } from 'typeorm';
import { displayName } from '../lists/list.mapper';
import { User } from '../users/user.entity';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import type { Objective } from './entities/objective.entity';
import type { ObjectiveAccess } from './objective-access.service';
import type { ObjectiveTree } from './objective-tree';

function toPerson(user: User): ObjectivePerson {
  return { id: user.id, name: displayName(user) };
}

/** Builds what the API answers about objectives. */
@Injectable()
export class ObjectiveViewService {
  constructor(private readonly dataSource: DataSource) {}

  async summaries(
    accesses: readonly ObjectiveAccess[],
    userId: string,
  ): Promise<ObjectiveSummary[]> {
    const [owners, preferences] = await Promise.all([
      this.people(accesses.map(({ node }) => node.ownerId)),
      this.preferences(
        userId,
        accesses.map(({ node }) => node.id),
      ),
    ]);
    return accesses.map(({ tree, node, role }) =>
      this.toSummary(
        tree,
        node,
        role,
        owners,
        preferences.get(node.id)?.onHome ?? false,
      ),
    );
  }

  async detail(
    { tree, node, role }: ObjectiveAccess,
    userId: string,
  ): Promise<ObjectiveDetail> {
    const manager = this.dataSource.manager;
    const children = tree.childrenOf(node.id);
    const [sessions, checkIns, owners, preferences] = await Promise.all([
      manager.find(ObjectiveSession, {
        where: { objectiveId: node.id },
        relations: { author: true },
        order: { date: 'ASC', createdAt: 'ASC' },
      }),
      manager.find(ObjectiveCheckInRow, {
        where: { objectiveId: node.id },
        order: { date: 'ASC' },
      }),
      this.people([node.ownerId]),
      this.preferences(userId, [node.id, ...children.map(({ id }) => id)]),
    ]);
    const preference = preferences.get(node.id);

    return {
      ...this.toSummary(tree, node, role, owners, preference?.onHome ?? false),
      description: node.description,
      plan: node.plan,
      metric:
        node.completion === 'metric' &&
        node.metricUnit !== null &&
        node.metricTarget !== null &&
        node.metricAggregation !== null
          ? {
              unit: node.metricUnit,
              target: node.metricTarget,
              aggregation: node.metricAggregation,
            }
          : null,
      habitTargetDays: node.habitTargetDays,
      manualProgress: node.manualProgress,
      breadcrumb: tree
        .ancestorsOf(node.id)
        .map(({ id, title }) => ({ id, title })),
      children: children.map((child) =>
        this.toSummary(
          tree,
          child,
          role,
          owners,
          preferences.get(child.id)?.onHome ?? false,
        ),
      ),
      descendantCount: tree.descendantsOf(node.id).length,
      sessions: sessions.map((session) => ({
        id: session.id,
        date: session.date,
        status: session.status,
        label: session.label,
        value: session.value,
        durationMinutes: session.durationMinutes,
        author: session.author ? toPerson(session.author) : null,
      })),
      checkIns: checkIns.map(({ date, userId: checkedBy }) => ({
        date,
        userId: checkedBy,
      })),
      reminder: {
        frequency: preference?.reminderFrequency ?? 'none',
        time: preference?.reminderTime ?? '09:00',
        weekday: preference?.reminderWeekday ?? 0,
      },
      dueReminder: preference?.dueReminder ?? 'none',
    };
  }

  private toSummary(
    tree: ObjectiveTree,
    node: Objective,
    role: ObjectiveRole,
    owners: ReadonlyMap<string, ObjectivePerson>,
    onHome: boolean,
  ): ObjectiveSummary {
    const children = tree
      .childrenOf(node.id)
      .filter(({ archived }) => !archived);
    return {
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      category: node.category,
      status: node.status,
      archived: node.archived,
      completion: node.completion,
      percent: tree.percent(node.id),
      amount: tree.amount(node.id),
      timelapse: node.timelapse,
      startDate: node.startDate,
      dueDate: node.dueDate,
      completedAt: node.completedAt?.toISOString() ?? null,
      weight: node.weight,
      role,
      owner: owners.get(node.ownerId) ?? {
        id: node.ownerId,
        name: 'Compte supprimé',
      },
      childCount: children.length,
      completedChildCount: children.filter(
        ({ status }) => status === 'completed',
      ).length,
      onHome,
    };
  }

  private async people(
    userIds: readonly string[],
  ): Promise<Map<string, ObjectivePerson>> {
    const users = userIds.length
      ? await this.dataSource.manager.find(User, {
          where: { id: In([...new Set(userIds)]) },
        })
      : [];
    return new Map(users.map((user) => [user.id, toPerson(user)]));
  }

  private async preferences(
    userId: string,
    objectiveIds: readonly string[],
  ): Promise<Map<string, ObjectivePreference>> {
    const rows = objectiveIds.length
      ? await this.dataSource.manager.find(ObjectivePreference, {
          where: { userId, objectiveId: In([...objectiveIds]) },
        })
      : [];
    return new Map(rows.map((row) => [row.objectiveId, row]));
  }
}
