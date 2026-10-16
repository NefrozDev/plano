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
import { GroupsService } from '../../groups/groups.service';
import { User } from '../../users/user.entity';
import { ListAccessService } from '../list-access.service';
import { ListContentService } from '../list-content.service';
import { ListSettingsService } from '../list-settings.service';
import { ListsService } from '../lists.service';

export interface ListsTestBed {
  dataSource: DataSource;
  lists: ListsService;
  content: ListContentService;
  settings: ListSettingsService;
  /** Owner of the group. */
  ada: string;
  /** In Ada's group. */
  bob: string;
  /** In no group. */
  cyd: string;
  joinGroup(userId: string): Promise<void>;
  leaveGroup(userId: string): Promise<void>;
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
  const access = new ListAccessService(dataSource, groups);

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
    lists: new ListsService(dataSource, writeLock, access, groups),
    content: new ListContentService(dataSource, writeLock, access),
    settings: new ListSettingsService(dataSource, writeLock),
    ada,
    bob,
    cyd,
    joinGroup,
    leaveGroup: async (userId) => {
      await dataSource.manager.delete(GroupMembership, { userId });
    },
    destroy: async () => {
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
