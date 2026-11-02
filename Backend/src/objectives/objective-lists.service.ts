import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ObjectiveDetail } from '@plano/common';
import type { Subscription } from 'rxjs';
import { DataSource } from 'typeorm';
import { CreateListDto } from '../lists/dto/list.dto';
import { List } from '../lists/entities/list.entity';
import { ListChangesService } from '../lists/list-changes.service';
import { ListsService } from '../lists/lists.service';
import { Objective } from './entities/objective.entity';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveChangesService } from './objective-changes.service';
import { ObjectiveViewService } from './objective-view.service';
import { ObjectiveWriterService } from './objective-writer.service';
import { ObjectivesService } from './objectives.service';

/**
 * Lists linked to an objective: their checked items can make its bar. Only the
 * objective's owner links, and only lists of their own, so linking never
 * shares a list nor reaches someone else's. A list counts for one objective.
 */
@Injectable()
export class ObjectiveListsService implements OnModuleDestroy {
  private readonly logger = new Logger(ObjectiveListsService.name);
  private readonly listening: Subscription;

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: ObjectiveAccessService,
    private readonly writer: ObjectiveWriterService,
    private readonly view: ObjectiveViewService,
    private readonly changes: ObjectiveChangesService,
    private readonly lists: ListsService,
    listChanges: ListChangesService,
    private readonly objectives: ObjectivesService,
  ) {
    this.listening = listChanges.objectiveListsChanged.subscribe(
      (objectiveId) => void this.recount(objectiveId),
    );
  }

  onModuleDestroy(): void {
    this.listening.unsubscribe();
  }

  async link(
    objectiveId: string,
    userId: string,
    listId: string,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      objectiveId,
      userId,
      'own',
      async ({ node }, manager) => {
        const list = await manager.findOne(List, { where: { id: listId } });
        // Someone else's list is not named: it might as well not exist.
        if (!list || list.ownerId !== userId) {
          throw new NotFoundException('Liste introuvable.');
        }
        if (list.objectiveId && list.objectiveId !== node.id) {
          throw new ConflictException(
            'Cette liste compte déjà pour un autre objectif.',
          );
        }
        list.objectiveId = node.id;
        await manager.save(list);
      },
    );
    return this.detail(objectiveId, userId);
  }

  /** A new list of the owner's, linked at once. */
  async createList(
    objectiveId: string,
    userId: string,
    details: CreateListDto,
  ): Promise<ObjectiveDetail> {
    await this.access.require(objectiveId, userId, 'own');
    const list = await this.lists.create(userId, details);
    return this.link(objectiveId, userId, list.id);
  }

  /** The list stays, it just no longer counts for the objective. */
  async unlink(
    objectiveId: string,
    userId: string,
    listId: string,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      objectiveId,
      userId,
      'own',
      async ({ node }, manager) => {
        const list = await manager.findOne(List, {
          where: { id: listId, objectiveId: node.id },
        });
        if (!list) throw new NotFoundException('Liste introuvable.');
        list.objectiveId = null;
        await manager.save(list);
      },
    );
    return this.detail(objectiveId, userId);
  }

  /**
   * A linked list changed or was deleted: the bar may have moved, and the
   * objective may complete or reopen. Its people hear it like any change.
   */
  private async recount(objectiveId: string): Promise<void> {
    try {
      const row = await this.dataSource.manager.findOne(Objective, {
        where: { id: objectiveId },
        select: { id: true, rootId: true },
      });
      const before = row && (await this.access.loadTree(row.rootId));
      if (!row || !before) return;
      const changed = await this.writer.inTransaction((manager) =>
        this.writer.settle(row.rootId, null, manager),
      );
      await this.changes.published({
        before,
        objectiveId,
        actorId: '',
        completed: changed.filter(({ status }) => status === 'completed'),
      });
    } catch (error) {
      this.logger.warn(
        `Objective ${objectiveId} not recounted: ${String(error)}`,
      );
    }
  }

  /**
   * Deletes the objective, everything below it and, when asked, the lists
   * linked to them; otherwise they stay, unlinked. Only the owner's own lists
   * can be linked, so they are theirs to delete.
   */
  async removeObjective(
    objectiveId: string,
    userId: string,
    deleteLists: boolean,
  ): Promise<void> {
    const { tree, node } = await this.access.require(
      objectiveId,
      userId,
      'own',
    );
    const listIds = deleteLists ? tree.linkedListsUnder(node.id) : [];
    await this.objectives.remove(objectiveId, userId);
    for (const listId of listIds) {
      try {
        await this.lists.remove(listId, userId);
      } catch (error) {
        // Already gone: nothing left to delete.
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
  }

  private async detail(id: string, userId: string): Promise<ObjectiveDetail> {
    return this.view.detail(
      await this.access.require(id, userId, 'read'),
      userId,
    );
  }
}
