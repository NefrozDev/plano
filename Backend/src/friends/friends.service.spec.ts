import type { MockInstance } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { MIGRATIONS } from '../database/migrations';
import {
  createTestDatabase,
  ENTITIES,
  type TestDatabase,
} from '../database/testing/test-database';
import { GroupMembership } from '../groups/group-membership.entity';
import { Group } from '../groups/group.entity';
import { GroupsService } from '../groups/groups.service';
import { LiveEventsService } from '../live/live-events.service';
import { User } from '../users/user.entity';
import { ContactsService } from './contacts.service';
import {
  FriendsService,
  MAX_PENDING_REQUESTS,
  SEARCH_LIMIT,
} from './friends.service';
import { Friendship } from './friendship.entity';

/** Real services on a fresh database: the pair index and cascades run for real. */
describe('FriendsService and ContactsService', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  let live: LiveEventsService;
  let publish: MockInstance<LiveEventsService['publish']>;
  /** What `user` looks like in a friend event. */
  const publicUser = (id: string, username: string, firstName: string) => ({
    id,
    username,
    firstName,
    lastName: 'Test',
    avatarVersion: null,
  });
  let friends: FriendsService;
  let contacts: ContactsService;
  let ada: string;
  let bob: string;
  let cyd: string;

  async function insertUser(
    username: string,
    firstName = username,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.manager.insert(User, {
      id,
      firstName,
      lastName: 'Test',
      username,
      normalizedUsername: username,
      email: `${username}@example.com`,
      normalizedEmail: `${username}@example.com`,
      passwordHash: 'hash',
      termsAcceptedAt: new Date(),
    });
    return id;
  }

  async function insertGroup(
    name: string,
    memberIds: string[],
  ): Promise<string> {
    const groupId = randomUUID();
    await dataSource.manager.insert(Group, {
      id: groupId,
      name,
      inviteCode: randomUUID().slice(0, 8).toUpperCase(),
      createdByUserId: memberIds[0],
    });
    await dataSource.manager.insert(
      GroupMembership,
      memberIds.map((userId, index) => ({
        id: randomUUID(),
        userId,
        groupId,
        role: index === 0 ? ('owner' as const) : ('member' as const),
      })),
    );
    return groupId;
  }

  const incomingIds = async (userId: string) =>
    (await friends.listRequests(userId)).incoming.map(({ id }) => id);

  beforeEach(async () => {
    database = await createTestDatabase();
    dataSource = new DataSource({
      type: 'postgres',
      url: database.url,
      entities: ENTITIES,
      migrations: MIGRATIONS,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    const writeLock = new DatabaseWriteLockService();
    live = new LiveEventsService();
    publish = vi.spyOn(live, 'publish');
    friends = new FriendsService(dataSource, writeLock, live);
    contacts = new ContactsService(
      new GroupsService(
        dataSource.getRepository(GroupMembership),
        dataSource,
        writeLock,
      ),
      friends,
    );
    [ada, bob, cyd] = [
      await insertUser('ada', 'Ada'),
      await insertUser('bob', 'Bob'),
      await insertUser('cyd', 'Cyd'),
    ];
  });

  afterEach(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  describe('search', () => {
    it('matches the start of usernames, case-insensitively, without the caller', async () => {
      await insertUser('bobby');
      await insertUser('robert');

      const results = await friends.search(ada, '  BO ');

      expect(results.map(({ username }) => username)).toEqual(['bob', 'bobby']);
      expect(results[0]).toEqual({
        id: bob,
        username: 'bob',
        firstName: 'Bob',
        lastName: 'Test',
        avatarVersion: null,
        relation: 'none',
      });
      // Never the e-mail address.
      expect(Object.keys(results[0])).not.toContain('email');
      expect(await friends.search(ada, 'ad')).toEqual([]);
    });

    it('treats LIKE wildcards literally', async () => {
      await insertUser('a_b');
      await insertUser('axb');

      expect(
        (await friends.search(cyd, 'a_')).map(({ username }) => username),
      ).toEqual(['a_b']);
      expect(await friends.search(cyd, '%')).toEqual([]);
    });

    it(`returns at most ${SEARCH_LIMIT} users, with the caller's relation to each`, async () => {
      for (let index = 0; index < SEARCH_LIMIT + 2; index += 1) {
        await insertUser(`user${String(index).padStart(2, '0')}`);
      }
      expect(await friends.search(ada, 'user')).toHaveLength(SEARCH_LIMIT);

      await friends.sendRequest(ada, bob);
      const dan = await insertUser('dan');
      await friends.sendRequest(dan, ada);
      const eve = await insertUser('eve');
      await friends.sendRequest(eve, ada);
      await friends.sendRequest(ada, eve);

      const relation = async (query: string) =>
        (await friends.search(ada, query))[0].relation;
      expect(await relation('bob')).toBe('outgoing');
      expect(await relation('dan')).toBe('incoming');
      expect(await relation('eve')).toBe('friend');
      expect(await relation('cyd')).toBe('none');
    });
  });

  describe('live events', () => {
    it('tells the recipient about a request, and the sender about its acceptance', async () => {
      await friends.sendRequest(ada, bob);

      expect(publish).toHaveBeenCalledExactlyOnceWith([bob], {
        type: 'friend.requested',
        user: publicUser(ada, 'ada', 'Ada'),
      });

      await friends.accept(bob, (await incomingIds(bob))[0]);

      expect(publish).toHaveBeenCalledTimes(2);
      expect(publish).toHaveBeenLastCalledWith([ada], {
        type: 'friend.accepted',
        user: publicUser(bob, 'bob', 'Bob'),
      });
    });

    it('tells the first asker when asking back makes them friends', async () => {
      await friends.sendRequest(bob, ada);
      publish.mockClear();

      await friends.sendRequest(ada, bob);

      expect(publish).toHaveBeenCalledExactlyOnceWith([bob], {
        type: 'friend.accepted',
        user: publicUser(ada, 'ada', 'Ada'),
      });
    });

    it('tells the other person when a request or a friendship goes', async () => {
      await friends.sendRequest(ada, bob);
      publish.mockClear();
      // Declined by the recipient: the sender hears.
      await friends.removeRequest(bob, (await incomingIds(bob))[0]);
      expect(publish).toHaveBeenCalledExactlyOnceWith([ada], {
        type: 'friends.changed',
      });

      // Cancelled by the sender: the recipient hears.
      await friends.sendRequest(ada, bob);
      publish.mockClear();
      await friends.removeRequest(ada, (await incomingIds(bob))[0]);
      expect(publish).toHaveBeenCalledExactlyOnceWith([bob], {
        type: 'friends.changed',
      });

      await friends.sendRequest(ada, bob);
      await friends.accept(bob, (await incomingIds(bob))[0]);
      publish.mockClear();
      await friends.removeFriend(bob, ada);
      expect(publish).toHaveBeenCalledExactlyOnceWith([ada], {
        type: 'friends.changed',
      });
    });

    it('publishes nothing when the change is refused', async () => {
      await expect(friends.sendRequest(ada, ada)).rejects.toThrow();
      await expect(friends.sendRequest(ada, randomUUID())).rejects.toThrow();
      await expect(friends.accept(ada, randomUUID())).rejects.toThrow();
      await expect(friends.removeRequest(ada, randomUUID())).rejects.toThrow();
      await expect(friends.removeFriend(ada, bob)).rejects.toThrow();

      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('requests', () => {
    it('sends a request the recipient accepts, making both friends', async () => {
      await expect(friends.sendRequest(ada, bob)).resolves.toEqual({
        status: 'pending',
      });
      const { incoming } = await friends.listRequests(bob);
      expect(incoming).toEqual([
        {
          id: expect.any(String) as string,
          user: {
            id: ada,
            username: 'ada',
            firstName: 'Ada',
            lastName: 'Test',
            avatarVersion: null,
          },
          createdAt: expect.any(String) as string,
        },
      ]);
      expect((await friends.listRequests(ada)).outgoing[0].user.id).toBe(bob);
      expect(await friends.listFriends(ada)).toEqual([]);

      // Only the recipient can accept.
      await expect(friends.accept(ada, incoming[0].id)).rejects.toThrow(
        NotFoundException,
      );
      await expect(friends.accept(bob, incoming[0].id)).resolves.toEqual(
        expect.objectContaining({ id: ada, username: 'ada' }),
      );

      expect((await friends.listFriends(ada)).map(({ id }) => id)).toEqual([
        bob,
      ]);
      expect((await friends.listFriends(bob)).map(({ id }) => id)).toEqual([
        ada,
      ]);
      expect(await friends.friendIds(bob)).toEqual([ada]);
      expect(await friends.listRequests(bob)).toEqual({
        incoming: [],
        outgoing: [],
      });
    });

    it('turns a request to someone who already asked into a friendship', async () => {
      await friends.sendRequest(bob, ada);

      await expect(friends.sendRequest(ada, bob)).resolves.toEqual({
        status: 'accepted',
      });
      expect(await dataSource.getRepository(Friendship).count()).toBe(1);
      expect((await friends.listFriends(ada)).map(({ id }) => id)).toEqual([
        bob,
      ]);
    });

    it('refuses yourself, unknown users, duplicates and existing friends', async () => {
      await expect(friends.sendRequest(ada, ada)).rejects.toThrow(
        BadRequestException,
      );
      await expect(friends.sendRequest(ada, randomUUID())).rejects.toThrow(
        NotFoundException,
      );
      await friends.sendRequest(ada, bob);
      await expect(friends.sendRequest(ada, bob)).rejects.toThrow(
        'Votre demande est déjà envoyée.',
      );
      await friends.accept(bob, (await incomingIds(bob))[0]);
      await expect(friends.sendRequest(bob, ada)).rejects.toThrow(
        'Vous êtes déjà amis.',
      );
      expect(await dataSource.getRepository(Friendship).count()).toBe(1);
    });

    it(`caps pending requests at ${MAX_PENDING_REQUESTS}`, async () => {
      await dataSource.manager.insert(
        Friendship,
        await Promise.all(
          Array.from({ length: MAX_PENDING_REQUESTS }, async (_, index) => ({
            id: randomUUID(),
            requesterId: ada,
            addresseeId: await insertUser(`target${index}`),
            status: 'pending' as const,
            acceptedAt: null,
          })),
        ),
      );

      await expect(friends.sendRequest(ada, bob)).rejects.toThrow(
        ConflictException,
      );
      expect(await incomingIds(bob)).toEqual([]);
    });

    it('lets the recipient decline and the sender cancel, nobody else', async () => {
      await friends.sendRequest(ada, bob);
      const [request] = await incomingIds(bob);

      await expect(friends.removeRequest(cyd, request)).rejects.toThrow(
        NotFoundException,
      );
      await friends.removeRequest(bob, request);
      expect(await incomingIds(bob)).toEqual([]);

      await friends.sendRequest(ada, bob);
      await friends.removeRequest(ada, (await incomingIds(bob))[0]);
      expect(await incomingIds(bob)).toEqual([]);
      expect(await friends.listFriends(bob)).toEqual([]);
    });

    it('keeps one row per pair, even for crossed inserts', async () => {
      await friends.sendRequest(ada, bob);

      await expect(
        dataSource.manager.insert(Friendship, {
          id: randomUUID(),
          requesterId: bob,
          addresseeId: ada,
          status: 'pending',
          acceptedAt: null,
        }),
      ).rejects.toThrow(/UQ_friendships_pair/);
    });
  });

  it('removes a friend for both, and only an existing friend', async () => {
    await friends.sendRequest(ada, bob);
    await friends.accept(bob, (await incomingIds(bob))[0]);

    await expect(friends.removeFriend(ada, cyd)).rejects.toThrow(
      NotFoundException,
    );
    await friends.removeFriend(bob, ada);

    expect(await friends.listFriends(ada)).toEqual([]);
    expect(await friends.listFriends(bob)).toEqual([]);
    // A pending request is not a friendship to remove.
    await friends.sendRequest(ada, cyd);
    await expect(friends.removeFriend(ada, cyd)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('contacts', () => {
    it('merges friends and group mates, listing the shared groups, without the user', async () => {
      const dan = await insertUser('dan', 'Dan');
      const family = await insertGroup('Famille', [ada, bob]);
      const work = await insertGroup('Travail', [cyd, ada, bob]);
      await friends.sendRequest(ada, bob);
      await friends.accept(bob, (await incomingIds(bob))[0]);
      await friends.sendRequest(dan, ada);
      await friends.sendRequest(ada, dan);

      expect(await contacts.findAll(ada)).toEqual([
        {
          id: bob,
          username: 'bob',
          firstName: 'Bob',
          lastName: 'Test',
          avatarVersion: null,
          friend: true,
          groups: [
            { id: family, name: 'Famille' },
            { id: work, name: 'Travail' },
          ],
        },
        expect.objectContaining({
          id: cyd,
          friend: false,
          groups: [{ id: work, name: 'Travail' }],
        }),
        expect.objectContaining({ id: dan, friend: true, groups: [] }),
      ]);
      expect([...(await contacts.contactIds(ada))].sort()).toEqual(
        [bob, cyd, dan].sort(),
      );
      expect(await contacts.areContacts(ada, dan)).toBe(true);
      expect(await contacts.areContacts(cyd, dan)).toBe(false);
    });

    it('does not count a pending request as a contact', async () => {
      await friends.sendRequest(ada, bob);

      expect(await contacts.findAll(ada)).toEqual([]);
      expect(await contacts.areContacts(ada, bob)).toBe(false);
    });
  });
});
