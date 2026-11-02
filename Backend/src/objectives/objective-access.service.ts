import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ObjectiveRole } from '@plano/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { ContactsService } from '../friends/contacts.service';
import { ListEntry } from '../lists/entities/list-entry.entity';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectiveMember } from './entities/objective-member.entity';
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
  constructor(
    private readonly dataSource: DataSource,
    private readonly contacts: ContactsService,
  ) {}

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
    const role = node && tree ? tree.roleOf(node.id, userId) : null;
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
    const owned = await manager.find(Objective, {
      where: { ownerId: userId, parentId: IsNull() },
      order: { createdAt: 'ASC' },
      select: { id: true },
    });
    const memberships = await manager.find(ObjectiveMember, {
      where: { userId },
      relations: { objective: true },
      order: { createdAt: 'ASC' },
    });
    const rootIds = [
      ...new Set([
        ...owned.map(({ id }) => id),
        ...memberships.map(({ objective }) => objective.rootId),
      ]),
    ];
    const trees = await this.loadTrees(rootIds, manager);

    return rootIds.flatMap((rootId) => {
      const tree = trees.get(rootId)!;
      return tree.topsFor(userId).map((node): ObjectiveAccess => ({
        tree,
        node,
        role: tree.roleOf(node.id, userId)!,
      }));
    });
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
      select: { objectiveId: true, value: true, date: true },
    });
    const checkIns = await manager.find(ObjectiveCheckInRow, {
      where: { objectiveId: In(objectiveIds) },
      select: { objectiveId: true, userId: true, date: true },
    });
    const members = await manager.find(ObjectiveMember, {
      where: { objectiveId: In(objectiveIds) },
    });
    const listEntries = objectiveIds.length
      ? await manager
          .createQueryBuilder(ListEntry, 'entry')
          .innerJoin('entry.list', 'list')
          .select('list.objectiveId', 'objectiveId')
          .addSelect('entry.done', 'done')
          .where('list.objectiveId IN (:...objectiveIds)', { objectiveIds })
          .andWhere('list.removeChecked = false')
          .getRawMany<{ objectiveId: string; done: boolean }>()
      : [];

    const nodesOf = new Map<string, Objective[]>();
    for (const node of nodes) {
      nodesOf.set(node.rootId, [...(nodesOf.get(node.rootId) ?? []), node]);
    }
    const contactsOf = new Map<string, Set<string>>();
    const trees = new Map<string, ObjectiveTree>();
    for (const [rootId, treeNodes] of nodesOf) {
      const ids = new Set(treeNodes.map(({ id }) => id));
      const treeMembers = members.filter(({ objectiveId }) =>
        ids.has(objectiveId),
      );
      const ownerId = treeNodes[0].ownerId;
      const periodStart =
        treeNodes.find(({ parentId }) => parentId === null)?.periodStart ?? '';
      // Looked up once per owner, and only when something is shared.
      if (treeMembers.length && !contactsOf.has(ownerId)) {
        contactsOf.set(ownerId, await this.contacts.contactIds(ownerId));
      }
      trees.set(
        rootId,
        new ObjectiveTree(treeNodes, {
          doneSessions: doneSessions.filter(
            ({ objectiveId, date }) =>
              ids.has(objectiveId) && date >= periodStart,
          ),
          checkIns: checkIns.filter(
            ({ objectiveId, date }) =>
              ids.has(objectiveId) && date >= periodStart,
          ),
          listEntries: listEntries.filter(({ objectiveId }) =>
            ids.has(objectiveId),
          ),
          // Losing both links (friend, group mate) revokes access at once.
          memberships: treeMembers.filter(({ userId }) =>
            contactsOf.get(ownerId)?.has(userId),
          ),
        }),
      );
    }
    return trees;
  }
}
