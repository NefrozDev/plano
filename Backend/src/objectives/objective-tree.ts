import type {
  ObjectiveAmount,
  ObjectiveMemberRole,
  ObjectiveRole,
} from '@plano/common';
import type { Objective } from './entities/objective.entity';

/** The levels of a tree, top-level objective included. */
export const MAX_OBJECTIVE_LEVELS = 10;
/** Objectives in a tree: a whole tree is loaded for each request. */
export const MAX_TREE_NODES = 500;

/** The rows that drive progress, loaded with the tree's objectives. */
export interface TreeFacts {
  doneSessions: readonly {
    objectiveId: string;
    value: number;
  }[];
  checkIns: readonly { objectiveId: string; userId: string }[];
  /** Items of the lists linked to each objective; lists that delete checked items are left out. */
  listEntries?: readonly { objectiveId: string; done: boolean }[];
  /** Invitations still valid: people who are no longer contacts are left out. */
  memberships?: readonly TreeMembership[];
}

export interface TreeMembership {
  objectiveId: string;
  userId: string;
  role: ObjectiveMemberRole;
}

/** Below 100, the bar never shows full: only a complete objective reaches it. */
export function displayPercent(exact: number): number {
  return exact >= 100 ? 100 : Math.min(99, Math.round(exact));
}

/**
 * One objective tree in memory: its structure, and the progress of every node
 * computed from the rows it was loaded with. Nothing here touches the database.
 */
export class ObjectiveTree {
  private readonly byId = new Map<string, Objective>();
  private readonly byParent = new Map<string, Objective[]>();
  private readonly exact = new Map<string, number | null>();
  private readonly doneValues = new Map<string, number[]>();
  private readonly checkInCounts = new Map<string, Map<string, number>>();
  private readonly listCounts = new Map<
    string,
    { done: number; total: number }
  >();
  readonly root: Objective;

  private readonly memberships: readonly TreeMembership[];

  constructor(
    readonly nodes: readonly Objective[],
    facts: TreeFacts,
  ) {
    this.memberships = facts.memberships ?? [];
    for (const node of nodes) {
      this.byId.set(node.id, node);
      if (node.parentId) {
        const siblings = this.byParent.get(node.parentId) ?? [];
        siblings.push(node);
        this.byParent.set(node.parentId, siblings);
      }
    }
    for (const siblings of this.byParent.values()) {
      siblings.sort(
        (first, second) =>
          first.position - second.position ||
          first.createdAt.getTime() - second.createdAt.getTime(),
      );
    }
    const root = nodes.find((node) => node.parentId === null);
    if (!root)
      throw new Error('An objective tree needs a top-level objective.');
    this.root = root;

    for (const { objectiveId, value } of facts.doneSessions) {
      const values = this.doneValues.get(objectiveId) ?? [];
      values.push(value);
      this.doneValues.set(objectiveId, values);
    }
    for (const { objectiveId, userId } of facts.checkIns) {
      const counts =
        this.checkInCounts.get(objectiveId) ?? new Map<string, number>();
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
      this.checkInCounts.set(objectiveId, counts);
    }
    for (const { objectiveId, done } of facts.listEntries ?? []) {
      const counts = this.listCounts.get(objectiveId) ?? { done: 0, total: 0 };
      counts.total += 1;
      if (done) counts.done += 1;
      this.listCounts.set(objectiveId, counts);
    }
  }

  node(id: string): Objective | undefined {
    return this.byId.get(id);
  }

  /** Direct sub-objectives, in display order. */
  childrenOf(id: string): readonly Objective[] {
    return this.byParent.get(id) ?? [];
  }

  /** From the top of the tree down to the parent; the node itself is left out. */
  ancestorsOf(id: string): Objective[] {
    const ancestors: Objective[] = [];
    let parentId = this.byId.get(id)?.parentId ?? null;
    while (parentId) {
      const parent = this.byId.get(parentId);
      if (!parent) break;
      ancestors.unshift(parent);
      parentId = parent.parentId;
    }
    return ancestors;
  }

  /** Everything below the node, at any depth. */
  descendantsOf(id: string): Objective[] {
    return this.childrenOf(id).flatMap((child) => [
      child,
      ...this.descendantsOf(child.id),
    ]);
  }

  /** The top-level objective is on level 1. */
  levelOf(id: string): number {
    return this.ancestorsOf(id).length + 1;
  }

  /** The node and the way up to the top, top first. */
  pathTo(id: string): Objective[] {
    const node = this.byId.get(id);
    return node ? [...this.ancestorsOf(id), node] : [];
  }

  membershipsOn(id: string): readonly TreeMembership[] {
    return this.memberships.filter(({ objectiveId }) => objectiveId === id);
  }

  /**
   * An invitation reaches everything below it, and the strongest one on the way
   * up decides. Nothing above an invitation is reachable: null means no access.
   */
  roleOf(id: string, userId: string): ObjectiveRole | null {
    if (!this.byId.has(id)) return null;
    if (this.root.ownerId === userId) return 'owner';
    const roles = this.pathTo(id)
      .flatMap((node) => this.membershipsOn(node.id))
      .filter((membership) => membership.userId === userId)
      .map(({ role }) => role);
    if (roles.includes('contributor')) return 'contributor';
    return roles.length ? 'viewer' : null;
  }

  /** The highest objectives the person was invited to: nothing above them is theirs. */
  topsFor(userId: string): Objective[] {
    if (this.root.ownerId === userId) return [this.root];
    return this.memberships
      .filter((membership) => membership.userId === userId)
      .map(({ objectiveId }) => this.byId.get(objectiveId))
      .filter((node): node is Objective => !!node)
      .filter(
        (node) =>
          !this.ancestorsOf(node.id).some(
            (ancestor) => this.roleOf(ancestor.id, userId) !== null,
          ),
      );
  }

  /** People whose days count on a habit: the owner, and whoever can contribute to it. */
  participantsOf(node: Objective): string[] {
    const contributors = this.pathTo(node.id)
      .flatMap((step) => this.membershipsOn(step.id))
      .filter(({ role }) => role === 'contributor')
      .map(({ userId }) => userId);
    return [...new Set([node.ownerId, ...contributors])];
  }

  /** The node's progress, 0 to 100 and unrounded; null without a completion bar. */
  exactProgress(id: string): number | null {
    if (!this.exact.has(id)) {
      const node = this.byId.get(id);
      this.exact.set(id, node ? this.computeProgress(node) : null);
    }
    return this.exact.get(id) ?? null;
  }

  percent(id: string): number | null {
    const exact = this.exactProgress(id);
    return exact === null ? null : displayPercent(exact);
  }

  /**
   * Progress in the objective's own unit; only metrics and habits have one. On a
   * habit each person has their own days: `viewerId`'s, or the most advanced ones
   * for someone who does not take part.
   */
  amount(id: string, viewerId?: string): ObjectiveAmount | null {
    const node = this.byId.get(id);
    if (node?.completion === 'metric') {
      return {
        current: this.metricCurrent(node),
        target: node.metricTarget ?? 0,
        unit: node.metricUnit ?? '',
      };
    }
    if (node?.completion === 'habit') {
      const counts = this.checkInCounts.get(id);
      const people = this.participantsOf(node);
      return {
        current:
          viewerId && people.includes(viewerId)
            ? (counts?.get(viewerId) ?? 0)
            : Math.max(0, ...people.map((user) => counts?.get(user) ?? 0)),
        target: node.habitTargetDays ?? 0,
        unit: 'jours',
      };
    }
    if (node?.completion === 'list') {
      const { done, total } = this.listCounts.get(id) ?? { done: 0, total: 0 };
      return { current: done, target: total, unit: 'éléments' };
    }
    return null;
  }

  private computeProgress(node: Objective): number | null {
    switch (node.completion) {
      case 'none':
        return null;
      case 'manual':
        return node.manualProgress;
      case 'metric': {
        const target = node.metricTarget ?? 0;
        return target > 0
          ? Math.min(100, (this.metricCurrent(node) / target) * 100)
          : 0;
      }
      case 'habit':
        return this.habitProgress(node);
      case 'children':
        return this.childrenProgress(node);
      case 'list': {
        // No item yet is nothing done, not everything.
        const { done, total } = this.listCounts.get(node.id) ?? {
          done: 0,
          total: 0,
        };
        return total ? (done / total) * 100 : 0;
      }
    }
  }

  private metricCurrent(node: Objective): number {
    const values = this.doneValues.get(node.id) ?? [];
    if (!values.length) return 0;
    return node.metricAggregation === 'max'
      ? Math.max(...values)
      : values.reduce((total, value) => total + value, 0);
  }

  /** Everyone checks in their own days: full once each person reached the target. */
  private habitProgress(node: Objective): number {
    const target = node.habitTargetDays ?? 0;
    const people = this.participantsOf(node);
    if (target <= 0 || !people.length) return 0;
    const counts = this.checkInCounts.get(node.id);
    const total = people.reduce(
      (sum, user) => sum + Math.min(1, (counts?.get(user) ?? 0) / target),
      0,
    );
    return (total / people.length) * 100;
  }

  /** Weighted average; a child without a bar counts as 0 or 100 once marked complete. */
  private childrenProgress(node: Objective): number {
    const children = this.childrenOf(node.id).filter(
      (child) => !child.archived,
    );
    const totalWeight = children.reduce((sum, { weight }) => sum + weight, 0);
    if (!totalWeight) return 0;
    const earned = children.reduce((sum, child) => {
      const credit =
        this.exactProgress(child.id) ??
        (child.status === 'completed' ? 100 : 0);
      return sum + credit * child.weight;
    }, 0);
    return earned / totalWeight;
  }
}
