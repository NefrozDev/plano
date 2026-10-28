import { Injectable } from '@nestjs/common';
import type { Contact } from '@plano/common';
import { GroupsService } from '../groups/groups.service';
import { FriendsService } from './friends.service';

/**
 * The people a user may invite to events and share lists with: their friends
 * and the members of their groups. Losing both links revokes what was shared.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly groups: GroupsService,
    private readonly friends: FriendsService,
  ) {}

  async findAll(userId: string): Promise<Contact[]> {
    const [groups, friends] = await Promise.all([
      this.groups.findAllForUser(userId),
      this.friends.listFriends(userId),
    ]);
    const contacts = new Map<string, Contact>();
    for (const group of groups) {
      for (const member of group.members) {
        if (member.id === userId) continue;
        const contact = contacts.get(member.id) ?? {
          id: member.id,
          username: member.username,
          firstName: member.firstName,
          lastName: member.lastName,
          friend: false,
          groups: [],
        };
        contact.groups.push({ id: group.id, name: group.name });
        contacts.set(member.id, contact);
      }
    }
    for (const { id, username, firstName, lastName } of friends) {
      contacts.set(id, {
        ...(contacts.get(id) ?? {
          id,
          username,
          firstName,
          lastName,
          groups: [],
        }),
        friend: true,
      });
    }
    return [...contacts.values()].sort((a, b) =>
      `${a.firstName} ${a.lastName} ${a.username}`.localeCompare(
        `${b.firstName} ${b.lastName} ${b.username}`,
        'fr',
      ),
    );
  }

  /** Ids of every contact of the user, never the user themselves. */
  async contactIds(userId: string): Promise<Set<string>> {
    const [groupMates, friends] = await Promise.all([
      this.groups.findGroupMateIds(userId),
      this.friends.friendIds(userId),
    ]);
    const ids = new Set([...groupMates, ...friends]);
    ids.delete(userId);
    return ids;
  }

  async areContacts(userId: string, otherUserId: string): Promise<boolean> {
    return (await this.contactIds(userId)).has(otherUserId);
  }
}
