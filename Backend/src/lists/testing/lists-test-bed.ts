import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../../database/database-write-lock.service';
import { MIGRATIONS } from '../../database/migrations';
import {
  createTestDatabase,
  ENTITIES,
} from '../../database/testing/test-database';
import { GroupMembership } from '../../groups/group-membership.entity';
import { Group } from '../../groups/group.entity';
import { ContactsService } from '../../friends/contacts.service';
import { FriendsService } from '../../friends/friends.service';
import { Friendship } from '../../friends/friendship.entity';
import { GroupsService } from '../../groups/groups.service';
import { User } from '../../users/user.entity';
import { LiveEventsService } from '../../live/live-events.service';
import { ListAccessService } from '../list-access.service';
import { ListChangesService } from '../list-changes.service';
import { ListContentService } from '../list-content.service';
import { ListSettingsService } from '../list-settings.service';
import { ListsService } from '../lists.service';

export interface ListsTestBed {
  dataSource: DataSource;
  lists: ListsService;
  content: ListContentService;
  settings: ListSettingsService;
  /** Receives the live events the services publish; spy on `publish`. */
  live: LiveEventsService;
  /** Owner of the group. */
  ada: string;
  /** In Ada's group. */
  bob: string;
  /** In no group. */
  cyd: string;
  joinGroup(userId: string): Promise<void>;
  leaveGroup(userId: string): Promise<void>;
  /** Puts the users together in a new, second group; the first one is the owner. */
  createOtherGroup(userIds: string[]): Promise<void>;
  /** Makes the two users friends, as an accepted request would. */
  befriend(userId: string, otherUserId: string): Promise<void>;
  /** Closes the connections and drops the database. */
  destroy(): Promise<void>;
}

/**
 * Real services on a fresh PostgreSQL database built by the app's migrations:
 * queries, constraints and access rules run for real, without starting the app.
 */
export async function createListsTestBed(): Promise<ListsTestBed> {
  const database = await createTestDatabase();
  const dataSource = new DataSource({
    type: 'postgres',
    url: database.url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
  });
  await dataSource.initialize();
  await dataSource.runMigrations();

  const writeLock = new DatabaseWriteLockService();
  const groups = new GroupsService(
    dataSource.getRepository(GroupMembership),
    dataSource,
    writeLock,
  );
  const contacts = new ContactsService(
    groups,
    new FriendsService(dataSource, writeLock),
  );
  const access = new ListAccessService(dataSource, contacts);
  const live = new LiveEventsService();
  const changes = new ListChangesService(dataSource, live);

  const [ada, bob, cyd] = await Promise.all(
    ['Ada', 'Bob', 'Cyd'].map((name) => insertUser(dataSource, name)),
  );
  const groupId = randomUUID();
  await dataSource.manager.insert(Group, {
    id: groupId,
    name: 'Famille',
    inviteCode: 'ABCD1234',
    createdByUserId: ada,
  });
  const joinGroup = async (userId: string) => {
    await dataSource.manager.insert(GroupMembership, {
      id: randomUUID(),
      userId,
      groupId,
      role: userId === ada ? 'owner' : 'member',
    });
  };
  await joinGroup(ada);
  await joinGroup(bob);

  return {
    dataSource,
    lists: new ListsService(dataSource, writeLock, access, contacts, changes),
    content: new ListContentService(dataSource, writeLock, access, changes),
    live,
    settings: new ListSettingsService(dataSource, writeLock),
    ada,
    bob,
    cyd,
    joinGroup,
    leaveGroup: async (userId) => {
      await dataSource.manager.delete(GroupMembership, { userId });
    },
    createOtherGroup: async (userIds) => {
      const otherGroupId = randomUUID();
      await dataSource.manager.insert(Group, {
        id: otherGroupId,
        name: 'Travail',
        inviteCode: 'WXYZ9876',
        createdByUserId: userIds[0],
      });
      await dataSource.manager.insert(
        GroupMembership,
        userIds.map((userId, index) => ({
          id: randomUUID(),
          userId,
          groupId: otherGroupId,
          role: index === 0 ? ('owner' as const) : ('member' as const),
        })),
      );
    },
    befriend: async (userId, otherUserId) => {
      await dataSource.manager.insert(Friendship, {
        id: randomUUID(),
        requesterId: userId,
        addresseeId: otherUserId,
        status: 'accepted',
        acceptedAt: new Date(),
      });
    },
    destroy: async () => {
      live.onApplicationShutdown();
      await dataSource.destroy();
      await database.drop();
    },
  };
}

async function insertUser(
  dataSource: DataSource,
  firstName: string,
): Promise<string> {
  const id = randomUUID();
  const username = firstName.toLowerCase();
  await dataSource.manager.insert(User, {
    id,
    firstName,
    lastName: 'Test',
    username,
    normalizedUsername: username,
    email: `${username}@example.com`,
    normalizedEmail: `${username}@example.com`,
    passwordHash: 'not-a-real-hash',
    termsAcceptedAt: new Date(),
  });
  return id;
}
