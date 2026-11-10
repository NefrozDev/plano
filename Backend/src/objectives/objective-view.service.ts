import { Injectable } from '@nestjs/common';
import type {
  ObjectiveLinkedList,
  ObjectiveContribution,
  ObjectiveCrumb,
  ObjectiveDetail,
  ObjectiveMemberView,
  ObjectivePerson,
  ObjectiveSharing,
  ObjectiveSummary,
} from '@plano/common';
import { DataSource, In } from 'typeorm';
import { ListEntry } from '../lists/entities/list-entry.entity';
import { List } from '../lists/entities/list.entity';
import { ListAccessService } from '../lists/list-access.service';
import { displayName } from '../lists/list.mapper';
import { User } from '../users/user.entity';
import { avatarVersion } from '../users/user.mapper';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectivePeriod } from './entities/objective-period.entity';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import type { Objective } from './entities/objective.entity';
import type { ObjectiveAccess } from './objective-access.service';
import type { ObjectiveTree, TreeMembership } from './objective-tree';

type People = ReadonlyMap<string, ObjectivePerson>;

function toPerson(user: User): ObjectivePerson {
  return {
    id: user.id,
    name: displayName(user),
    avatarVersion: avatarVersion(user),
  };
}

/** A deleted account has no name: the app names it in its own language. */
const DELETED_ACCOUNT = '';

/**
 * Invitations someone can see on a node. The owner sees them all; anyone else
 * only from the point they were invited: who was invited higher up, or elsewhere
 * in the tree, is none of their business.
 */
function visibleMemberships(
  tree: ObjectiveTree,
  node: Objective,
  viewerId: string,
): TreeMembership[] {
  const path = tree.pathTo(node.id);
  const start =
    viewerId === node.ownerId
      ? 0
      : path.findIndex((step) => tree.roleOf(step.id, viewerId) !== null);
  return path
    .slice(Math.max(0, start))
    .flatMap((step) => [...tree.membershipsOn(step.id)]);
}

/** Builds what the API answers about objectives: it is where privacy is enforced. */
@Injectable()
export class ObjectiveViewService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly listAccess: ListAccessService,
  ) {}

  async summaries(
    accesses: readonly ObjectiveAccess[],
    userId: string,
  ): Promise<ObjectiveSummary[]> {
    const [people, preferences] = await Promise.all([
      this.people(
        accesses.flatMap(({ tree, node }) => this.peopleOf(tree, node, userId)),
      ),
      this.preferences(
        userId,
        accesses.map(({ node }) => node.id),
      ),
    ]);
    return accesses.map(({ tree, node }) =>
      this.toSummary(
        tree,
        node,
        userId,
        people,
        preferences.get(node.id)?.onHome ?? false,
      ),
    );
  }

  async detail(
    { tree, node }: ObjectiveAccess,
    userId: string,
  ): Promise<ObjectiveDetail> {
    const manager = this.dataSource.manager;
    const children = tree.childrenOf(node.id);
    const [sessions, checkIns, preferences, periods] = await Promise.all([
      manager.find(ObjectiveSession, {
        where: { objectiveId: node.id },
        relations: { author: true },
        order: { date: 'ASC', createdAt: 'ASC' },
      }),
      manager.find(ObjectiveCheckInRow, {
        where: { objectiveId: node.id },
        order: { date: 'ASC' },
      }),
      this.preferences(userId, [node.id, ...children.map(({ id }) => id)]),
      manager.find(ObjectivePeriod, {
        where: { objectiveId: node.id },
        order: { startDate: 'DESC' },
      }),
    ]);
    const preference = preferences.get(node.id);
    const people = await this.people([
      ...this.peopleOf(tree, node, userId),
      ...children.flatMap((child) => this.peopleOf(tree, child, userId)),
      ...checkIns.map(({ userId: checkedBy }) => checkedBy),
    ]);

    return {
      ...this.toSummary(
        tree,
        node,
        userId,
        people,
        preference?.onHome ?? false,
      ),
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
        .map((ancestor) => this.toCrumb(tree, ancestor, userId)),
      children: children.map((child) =>
        this.toSummary(
          tree,
          child,
          userId,
          people,
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
      members: this.toMembers(tree, node, userId, people),
      contributions: this.toContributions(
        tree,
        node,
        userId,
        sessions,
        checkIns,
        people,
      ),
      periods: periods.map(({ startDate, endDate, percent, completed }) => ({
        startDate,
        endDate,
        percent,
        completed,
      })),
      lists: await this.linkedLists(node.id, userId),
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
    userId: string,
    people: People,
    onHome: boolean,
  ): ObjectiveSummary {
    const children = tree
      .childrenOf(node.id)
      .filter(({ archived }) => !archived);
    const memberships = visibleMemberships(tree, node, userId);
    return {
      id: node.id,
      // Above what was shared with them, people only get a name, never an id.
      parentId:
        node.parentId && tree.roleOf(node.parentId, userId)
          ? node.parentId
          : null,
      title: node.title,
      category: node.category,
      status: node.status,
      archived: node.archived,
      completion: node.completion,
      percent: tree.percent(node.id),
      amount: tree.amount(node.id, userId),
      timelapse: node.timelapse,
      startDate: node.startDate,
      dueDate: node.dueDate,
      completedAt: node.completedAt?.toISOString() ?? null,
      weight: node.weight,
      recurrence: node.recurrence,
      role: tree.roleOf(node.id, userId) ?? 'viewer',
      owner: this.person(people, node.ownerId),
      sharing: this.sharing(memberships),
      people: [
        node.ownerId,
        ...new Set(memberships.map((membership) => membership.userId)),
      ]
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .map((id) => this.person(people, id)),
      assignee: node.assignedToUserId
        ? this.person(people, node.assignedToUserId)
        : null,
      completedBy: node.completedByUserId
        ? this.person(people, node.completedByUserId)
        : null,
      childCount: children.length,
      completedChildCount: children.filter(
        ({ status }) => status === 'completed',
      ).length,
      onHome,
      linkedListCount:
        node.ownerId === userId ? tree.linkedListsUnder(node.id).length : 0,
    };
  }

  private sharing(memberships: readonly TreeMembership[]): ObjectiveSharing {
    if (memberships.some(({ role }) => role === 'contributor')) return 'common';
    return memberships.length ? 'shared' : 'private';
  }

  private toCrumb(
    tree: ObjectiveTree,
    node: Objective,
    userId: string,
  ): ObjectiveCrumb {
    return {
      id: tree.roleOf(node.id, userId) ? node.id : null,
      title: node.title,
    };
  }

  /** The owner, then one line per person: their strongest invitation, nearest first. */
  private toMembers(
    tree: ObjectiveTree,
    node: Objective,
    userId: string,
    people: People,
  ): ObjectiveMemberView[] {
    const members = new Map<string, TreeMembership>();
    for (const membership of visibleMemberships(tree, node, userId)) {
      const known = members.get(membership.userId);
      // Rows go from the top down: a lower one wins unless only followed.
      if (
        !known ||
        known.role === 'viewer' ||
        membership.role === 'contributor'
      ) {
        members.set(membership.userId, membership);
      }
    }
    return [
      {
        ...this.person(people, node.ownerId),
        role: 'owner',
        inheritedFrom: null,
      },
      ...[...members.values()].map((membership): ObjectiveMemberView => ({
        ...this.person(people, membership.userId),
        role: membership.role,
        inheritedFrom:
          membership.objectiveId === node.id
            ? null
            : this.toCrumb(tree, tree.node(membership.objectiveId)!, userId),
      })),
    ];
  }

  /** Who did what on a shared objective; a percentage set by hand belongs to nobody. */
  private toContributions(
    tree: ObjectiveTree,
    node: Objective,
    viewerId: string,
    sessions: readonly ObjectiveSession[],
    checkIns: readonly ObjectiveCheckInRow[],
    people: People,
  ): ObjectiveContribution[] {
    const periodStart = tree.root.periodStart ?? '';
    const values = new Map<string, number>();
    const add = (userId: string, value: number, best = false) => {
      const known = values.get(userId) ?? 0;
      values.set(userId, best ? Math.max(known, value) : known + value);
    };

    if (node.completion === 'metric') {
      for (const session of sessions) {
        if (
          session.status === 'done' &&
          session.authorId &&
          session.date >= periodStart
        ) {
          add(
            session.authorId,
            session.value,
            node.metricAggregation === 'max',
          );
        }
      }
    } else if (node.completion === 'habit') {
      // Those who have not started show at zero, if the viewer may know of them.
      const known = new Set([
        node.ownerId,
        ...visibleMemberships(tree, node, viewerId).map(({ userId }) => userId),
      ]);
      for (const person of tree.participantsOf(node)) {
        if (known.has(person)) add(person, 0);
      }
      for (const checkIn of checkIns) {
        if (checkIn.date >= periodStart) add(checkIn.userId, 1);
      }
    } else if (node.completion === 'children') {
      for (const child of tree.childrenOf(node.id)) {
        if (child.status === 'completed' && child.completedByUserId) {
          add(child.completedByUserId, 1);
        }
      }
    }
    return [...values.entries()]
      .map(([userId, value]) => ({
        person: this.person(people, userId),
        value,
      }))
      .sort((first, second) => second.value - first.value);
  }

  /** Everyone a node's answer may name. */
  private peopleOf(
    tree: ObjectiveTree,
    node: Objective,
    viewerId: string,
  ): string[] {
    return [
      node.ownerId,
      ...visibleMemberships(tree, node, viewerId).map(({ userId }) => userId),
      ...(node.assignedToUserId ? [node.assignedToUserId] : []),
      ...(node.completedByUserId ? [node.completedByUserId] : []),
      ...tree
        .childrenOf(node.id)
        .flatMap(({ completedByUserId }) =>
          completedByUserId ? [completedByUserId] : [],
        ),
    ];
  }

  private person(people: People, id: string): ObjectivePerson {
    return people.get(id) ?? { id, name: DELETED_ACCOUNT, avatarVersion: null };
  }

  /** Linking a list never shares it: only the lists the user could open anyway. */
  private async linkedLists(
    objectiveId: string,
    userId: string,
  ): Promise<ObjectiveLinkedList[]> {
    const manager = this.dataSource.manager;
    const lists = await this.listAccess.visibleTo(
      await manager.find(List, {
        where: { objectiveId },
        order: { createdAt: 'ASC' },
      }),
      userId,
    );
    if (!lists.length) return [];
    const counts = await manager
      .createQueryBuilder(ListEntry, 'entry')
      .select('entry.listId', 'listId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE entry.done)', 'done')
      .where('entry.listId IN (:...listIds)', {
        listIds: lists.map(({ id }) => id),
      })
      .groupBy('entry.listId')
      .getRawMany<{ listId: string; total: string; done: string }>();
    const countOf = new Map(counts.map((row) => [row.listId, row]));
    return lists.map(({ id, name, icon, color, removeChecked }) => ({
      id,
      name,
      icon,
      color,
      done: Number(countOf.get(id)?.done ?? 0),
      total: Number(countOf.get(id)?.total ?? 0),
      removeChecked,
    }));
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
