import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ShareRole } from '@plano/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ContactsService } from '../friends/contacts.service';
import { ListMember } from './entities/list-member.entity';
import { List } from './entities/list.entity';

/** What a request needs to do with a list. */
export type ListPermission = 'read' | 'edit' | 'own';

export interface ListAccess {
  list: List;
  role: ShareRole;
}

/**
 * A list is visible to its owner, and to members it was shared with while they
 * are still the owner's contacts (friend or group mate): losing both links
 * revokes access at once.
 */
@Injectable()
export class ListAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contacts: ContactsService,
  ) {}

  /**
   * Unknown lists and lists the user cannot see both answer 404, so ids of
   * other people's lists cannot be probed.
   */
  async require(
    listId: string,
    userId: string,
    permission: ListPermission,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ListAccess> {
    const access = await this.find(listId, userId, manager);
    if (!access) {
      throw new NotFoundException('Liste introuvable.');
    }
    if (permission === 'edit' && access.role === 'viewer') {
      throw new ForbiddenException(
        'Vous pouvez seulement consulter cette liste.',
      );
    }
    if (permission === 'own' && access.role !== 'owner') {
      throw new ForbiddenException(
        'Seul le propriétaire de la liste peut effectuer cette action.',
      );
    }
    return access;
  }

  /** Every list the user can see, with their role on it. */
  async findAll(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ListAccess[]> {
    const owned = await manager.find(List, {
      where: { ownerId: userId },
      order: { createdAt: 'ASC' },
    });
    const memberships = await manager.find(ListMember, {
      where: { userId },
      relations: { list: true },
      order: { createdAt: 'ASC' },
    });
    const contacts = await this.contacts.contactIds(userId);

    return [
      ...owned.map((list): ListAccess => ({ list, role: 'owner' })),
      ...memberships
        .filter((member) => contacts.has(member.list.ownerId))
        .map((member): ListAccess => ({
          list: member.list,
          role: member.role,
        })),
    ];
  }

  /** Of these lists, those the user can open: their own, or shared by a contact. */
  async visibleTo(
    lists: readonly List[],
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<List[]> {
    const shared = lists.filter(({ ownerId }) => ownerId !== userId);
    if (!shared.length) return [...lists];
    const memberOf = new Set(
      (
        await manager.find(ListMember, {
          where: { userId, listId: In(shared.map(({ id }) => id)) },
        })
      ).map(({ listId }) => listId),
    );
    const contacts = memberOf.size
      ? await this.contacts.contactIds(userId)
      : new Set<string>();
    return lists.filter(
      (list) =>
        list.ownerId === userId ||
        (memberOf.has(list.id) && contacts.has(list.ownerId)),
    );
  }

  private async find(
    listId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<ListAccess | null> {
    const list = await manager.findOne(List, { where: { id: listId } });
    if (!list) return null;
    if (list.ownerId === userId) return { list, role: 'owner' };

    const member = await manager.findOne(ListMember, {
      where: { listId, userId },
    });
    if (!member || !(await this.contacts.areContacts(userId, list.ownerId))) {
      return null;
    }
    return { list, role: member.role };
  }
}
