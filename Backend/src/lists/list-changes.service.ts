import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { LiveEventsService } from '../live/live-events.service';
import { ListMember } from './entities/list-member.entity';
import { List } from './entities/list.entity';

/**
 * Tells everyone who may have a list open that it changed. Called once the
 * write is committed: a failure here never undoes it, the event is just lost.
 */
@Injectable()
export class ListChangesService {
  private readonly logger = new Logger(ListChangesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly live: LiveEventsService,
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

  async changed(listId: string): Promise<void> {
    try {
      this.live.publish(await this.audience(listId), {
        type: 'list.changed',
        listId,
      });
    } catch (error) {
      this.logger.warn(`No live event for list ${listId}: ${String(error)}`);
    }
  }

  /** For users who just lost the list: it was deleted, or they were removed. */
  removed(listId: string, userIds: Iterable<string>): void {
    this.live.publish(userIds, { type: 'list.removed', listId });
  }
}
