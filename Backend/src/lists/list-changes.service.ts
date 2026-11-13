import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { DataSource, EntityManager } from 'typeorm';
import { LiveEventsService } from '../live/live-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListMember } from './entities/list-member.entity';
import { List } from './entities/list.entity';

/**
 * Tells everyone who may have a list open that it changed. Called once the
 * write is committed: a failure here never undoes it, the event is just lost.
 */
/** A linked list changed: the objective it counts for, and who did it. */
export interface LinkedListChange {
  objectiveId: string;
  actorId: string | null;
}

@Injectable()
export class ListChangesService {
  private readonly logger = new Logger(ListChangesService.name);
  private readonly countedFor = new Subject<LinkedListChange>();
  /**
   * Objectives whose linked list changed or was deleted: their bar may move.
   * Objectives listen here, so lists never depend on them.
   */
  readonly objectiveListsChanged = this.countedFor.asObservable();

  constructor(
    private readonly dataSource: DataSource,
    private readonly live: LiveEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The owner and every member, the actor included: their other devices need it too. */
  async audience(
    listId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string[]> {
    const list = await manager.findOne(List, { where: { id: listId } });
    if (!list) return [];
    const members = await manager.find(ListMember, { where: { listId } });
    return [list.ownerId, ...members.map(({ userId }) => userId)];
  }

  /** `actorId`: who changed it, so an objective it completes is theirs and they are not told. */
  async changed(listId: string, actorId: string | null = null): Promise<void> {
    try {
      this.live.publish(await this.audience(listId), {
        type: 'list.changed',
        listId,
      });
      const list = await this.dataSource.manager.findOne(List, {
        where: { id: listId },
        select: { id: true, objectiveId: true },
      });
      if (list?.objectiveId) {
        this.countedFor.next({ objectiveId: list.objectiveId, actorId });
      }
    } catch (error) {
      this.logger.warn(`No live event for list ${listId}: ${String(error)}`);
    }
  }

  /** A list linked to this objective was deleted. */
  linkedListDeleted(objectiveId: string | null, actorId: string): void {
    if (objectiveId) this.countedFor.next({ objectiveId, actorId });
  }

  /** For users who just lost the list: it was deleted, or they were removed. Its news go too. */
  async removed(listId: string, userIds: Iterable<string>): Promise<void> {
    const lost = [...userIds];
    this.live.publish(lost, { type: 'list.removed', listId });
    await this.notifications.forget(lost, [listId]);
  }

  /** Someone was given access to the list. */
  async invited(list: List, userId: string, actorId: string): Promise<void> {
    await this.notifications.notify([userId], {
      area: 'lists',
      kind: 'list.invited',
      targetId: list.id,
      title: list.name,
      actorId,
    });
  }

  /** Everyone else on the list hears that items were added, once while unread. */
  async entriesAdded(
    list: List,
    actorId: string,
    entryId: string,
  ): Promise<void> {
    try {
      await this.notifications.notify(await this.audience(list.id), {
        area: 'lists',
        kind: 'list.entries',
        targetId: list.id,
        title: list.name,
        itemId: entryId,
        actorId,
      });
    } catch (error) {
      this.logger.warn(`No notification for list ${list.id}: ${String(error)}`);
    }
  }
}
