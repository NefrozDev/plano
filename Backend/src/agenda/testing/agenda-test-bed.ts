import { DataSource } from 'typeorm';
import {
  createListsTestBed,
  type ListsTestBed,
} from '../../lists/testing/lists-test-bed';
import { ContactsService } from '../../friends/contacts.service';
import { FriendsService } from '../../friends/friends.service';
import { GroupsService } from '../../groups/groups.service';
import { GroupMembership } from '../../groups/group-membership.entity';
import { DatabaseWriteLockService } from '../../database/database-write-lock.service';
import { AgendaEventsService } from '../agenda-events.service';

export type AgendaTestBed = Pick<
  ListsTestBed,
  | 'dataSource'
  | 'live'
  | 'notifications'
  | 'ada'
  | 'bob'
  | 'cyd'
  | 'leaveGroup'
  | 'befriend'
  | 'destroy'
> & { agenda: AgendaEventsService };

/**
 * The lists test bed's database and people (Ada and Bob share a group, Cyd
 * knows nobody), with the agenda service on top.
 */
export async function createAgendaTestBed(): Promise<AgendaTestBed> {
  const bed = await createListsTestBed();
  const dataSource: DataSource = bed.dataSource;
  const writeLock = new DatabaseWriteLockService();
  const contacts = new ContactsService(
    new GroupsService(
      dataSource.getRepository(GroupMembership),
      dataSource,
      writeLock,
    ),
    new FriendsService(dataSource, writeLock, bed.live, bed.notifications),
  );
  return {
    ...bed,
    agenda: new AgendaEventsService(
      dataSource,
      writeLock,
      contacts,
      bed.live,
      bed.notifications,
    ),
  };
}
