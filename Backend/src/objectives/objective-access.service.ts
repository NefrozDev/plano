import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ObjectiveRole } from '@plano/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import { Objective } from './entities/objective.entity';
import { ObjectiveTree } from './objective-tree';

/** What a request needs to do with an objective. */
export type ObjectivePermission = 'read' | 'contribute' | 'own';

export interface ObjectiveAccess {
  tree: ObjectiveTree;
  node: Objective;
  role: ObjectiveRole;
}

/** Loads objective trees, and decides who may do what with them. */
@Injectable()
export class ObjectiveAccessService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Unknown objectives and objectives the user cannot see both answer 404, so
   * ids of other people's objectives cannot be probed.
   */
  async require(
    objectiveId: string,
    userId: string,
    permission: ObjectivePermission,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ObjectiveAccess> {
    const row = await manager.findOne(Objective, {
      where: { id: objectiveId },
      select: { id: true, rootId: true },
    });
    const tree = row ? await this.loadTree(row.rootId, manager) : null;
    const node = tree?.node(objectiveId);
    const role = node ? this.roleOn(node, userId) : null;
    if (!tree || !node || !role) {
      throw new NotFoundException('Objectif introuvable.');
    }
    if (permission === 'contribute' && role === 'viewer') {
      throw new ForbiddenException(
        'Vous pouvez seulement consulter cet objectif.',
      );
    }
    if (permission === 'own' && role !== 'owner') {
      throw new ForbiddenException(
        'Seul le propriétaire de l’objectif peut effectuer cette action.',
      );
    }
    return { tree, node, role };
  }

  /** The highest objectives the user can see in each tree, oldest first. */
  async findTops(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ObjectiveAccess[]> {
    const tops = await manager.find(Objective, {
      where: { ownerId: userId, parentId: IsNull() },
      order: { createdAt: 'ASC' },
    });
    const trees = await this.loadTrees(
      tops.map(({ id }) => id),
      manager,
    );
    return tops.map((root) => {
      const tree = trees.get(root.id)!;
      return { tree, node: tree.root, role: 'owner' as const };
    });
  }

  /** The role on any node of a tree; null when the user cannot see it. */
  roleOn(node: Objective, userId: string): ObjectiveRole | null {
    return node.ownerId === userId ? 'owner' : null;
  }

  /** Null when the tree is gone. */
  async loadTree(
    rootId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ObjectiveTree | null> {
    return (await this.loadTrees([rootId], manager)).get(rootId) ?? null;
  }

  async loadTrees(
    rootIds: readonly string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, ObjectiveTree>> {
    if (!rootIds.length) return new Map();
    const nodes = await manager.find(Objective, {
      where: { rootId: In([...rootIds]) },
    });
    const objectiveIds = nodes.map(({ id }) => id);
    const doneSessions = await manager.find(ObjectiveSession, {
      where: { objectiveId: In(objectiveIds), status: 'done' },
      select: { objectiveId: true, value: true },
    });
    const checkIns = await manager.find(ObjectiveCheckInRow, {
      where: { objectiveId: In(objectiveIds) },
      select: { objectiveId: true, userId: true },
    });

    const nodesOf = new Map<string, Objective[]>();
    for (const node of nodes) {
      nodesOf.set(node.rootId, [...(nodesOf.get(node.rootId) ?? []), node]);
    }
    const trees = new Map<string, ObjectiveTree>();
    for (const [rootId, treeNodes] of nodesOf) {
      const ids = new Set(treeNodes.map(({ id }) => id));
      trees.set(
        rootId,
        new ObjectiveTree(treeNodes, {
          doneSessions: doneSessions.filter(({ objectiveId }) =>
            ids.has(objectiveId),
          ),
          checkIns: checkIns.filter(({ objectiveId }) => ids.has(objectiveId)),
        }),
      );
    }
    return trees;
  }
}
