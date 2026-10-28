import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Friend,
  FriendRelation,
  FriendRequest,
  FriendRequests,
  PublicUser,
  SendFriendRequestResult,
  UserSearchResult,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { User } from '../users/user.entity';
import { Friendship } from './friendship.entity';

/** Pending requests a user may have sent at once: keeps request spam bounded. */
export const MAX_PENDING_REQUESTS = 50;
export const SEARCH_LIMIT = 10;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

function byName(a: PublicUser, b: PublicUser): number {
  return `${a.firstName} ${a.lastName} ${a.username}`.localeCompare(
    `${b.firstName} ${b.lastName} ${b.username}`,
    'fr',
  );
}

/** Rows between `userId` and `otherId`, whichever of them asked. */
function pairWhere(userId: string, otherId: string) {
  return [
    { requesterId: userId, addresseeId: otherId },
    { requesterId: otherId, addresseeId: userId },
  ];
}

/** Friendships are mutual: a request becomes a friendship for both once accepted. */
@Injectable()
export class FriendsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  /**
   * Users whose username starts with `query`, with where the caller stands with
   * each. A prefix match on the unique username, capped, so the endpoint cannot
   * be used to page through every account.
   */
  async search(userId: string, query: string): Promise<UserSearchResult[]> {
    // `_` is allowed in usernames and `%` must never act as a wildcard: escape
    // both (and the escape character itself) before adding ours.
    const prefix = query
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[\\%_]/g, (character) => `\\${character}`);
    const users = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.normalizedUsername LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('user.id <> :userId', { userId })
      .orderBy('user.normalizedUsername', 'ASC')
      .limit(SEARCH_LIMIT)
      .getMany();
    const relations = await this.relationsWith(
      userId,
      users.map(({ id }) => id),
    );
    return users.map((user) => ({
      ...toPublicUser(user),
      relation: relations.get(user.id) ?? 'none',
    }));
  }

  async listFriends(userId: string): Promise<Friend[]> {
    const rows = await this.dataSource.getRepository(Friendship).find({
      where: [
        { requesterId: userId, status: 'accepted' },
        { addresseeId: userId, status: 'accepted' },
      ],
      relations: { requester: true, addressee: true },
    });
    return rows
      .map((row) => ({
        ...toPublicUser(
          row.requesterId === userId ? row.addressee : row.requester,
        ),
        since: (row.acceptedAt ?? row.createdAt).toISOString(),
      }))
      .sort(byName);
  }

  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.dataSource.getRepository(Friendship).find({
      where: [
        { requesterId: userId, status: 'accepted' },
        { addresseeId: userId, status: 'accepted' },
      ],
    });
    return rows.map((row) =>
      row.requesterId === userId ? row.addresseeId : row.requesterId,
    );
  }

  async listRequests(userId: string): Promise<FriendRequests> {
    const repository = this.dataSource.getRepository(Friendship);
    const [incoming, outgoing] = await Promise.all([
      repository.find({
        where: { addresseeId: userId, status: 'pending' },
        relations: { requester: true },
        order: { createdAt: 'DESC' },
      }),
      repository.find({
        where: { requesterId: userId, status: 'pending' },
        relations: { addressee: true },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const toRequest = (row: Friendship, user: User): FriendRequest => ({
      id: row.id,
      user: toPublicUser(user),
      createdAt: row.createdAt.toISOString(),
    });
    return {
      incoming: incoming.map((row) => toRequest(row, row.requester)),
      outgoing: outgoing.map((row) => toRequest(row, row.addressee)),
    };
  }

  async sendRequest(
    userId: string,
    targetUserId: string,
  ): Promise<SendFriendRequestResult> {
    if (userId === targetUserId) {
      throw new BadRequestException(
        'Vous ne pouvez pas vous ajouter vous-même.',
      );
    }
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const target = await manager.findOne(User, {
          where: { id: targetUserId },
        });
        if (!target) throw new NotFoundException('Utilisateur introuvable.');

        const existing = await manager.findOne(Friendship, {
          where: pairWhere(userId, targetUserId),
        });
        if (existing?.status === 'accepted') {
          throw new ConflictException('Vous êtes déjà amis.');
        }
        if (existing?.requesterId === userId) {
          throw new ConflictException('Votre demande est déjà envoyée.');
        }
        if (existing) {
          // They asked first: asking back is accepting.
          existing.status = 'accepted';
          existing.acceptedAt = new Date();
          await manager.save(existing);
          return { status: 'accepted' as const };
        }

        const pending = await manager.count(Friendship, {
          where: { requesterId: userId, status: 'pending' },
        });
        if (pending >= MAX_PENDING_REQUESTS) {
          throw new ConflictException(
            'Trop de demandes en attente : attendez des réponses avant d’en envoyer d’autres.',
          );
        }
        await manager.save(
          manager.create(Friendship, {
            id: randomUUID(),
            requesterId: userId,
            addresseeId: targetUserId,
            status: 'pending',
            acceptedAt: null,
          }),
        );
        return { status: 'pending' as const };
      }),
    );
  }

  /** Only the recipient accepts. */
  async accept(userId: string, requestId: string): Promise<Friend> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const request = await manager.findOne(Friendship, {
          where: { id: requestId, addresseeId: userId, status: 'pending' },
          relations: { requester: true },
        });
        if (!request) throw new NotFoundException('Demande introuvable.');
        request.status = 'accepted';
        request.acceptedAt = new Date();
        await manager.save(request);
        return {
          ...toPublicUser(request.requester),
          since: request.acceptedAt.toISOString(),
        };
      }),
    );
  }

  /** The recipient declines, or the sender cancels: either way the request goes. */
  async removeRequest(userId: string, requestId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const request = await manager.findOne(Friendship, {
          where: [
            { id: requestId, requesterId: userId, status: 'pending' },
            { id: requestId, addresseeId: userId, status: 'pending' },
          ],
        });
        if (!request) throw new NotFoundException('Demande introuvable.');
        await manager.delete(Friendship, { id: request.id });
      }),
    );
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    await this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const friendship = await manager.findOne(Friendship, {
          where: pairWhere(userId, friendId).map((pair) => ({
            ...pair,
            status: 'accepted' as const,
          })),
        });
        if (!friendship) {
          throw new NotFoundException(
            'Cette personne ne fait pas partie de vos amis.',
          );
        }
        await manager.delete(Friendship, { id: friendship.id });
      }),
    );
  }

  private async relationsWith(
    userId: string,
    otherIds: string[],
  ): Promise<Map<string, FriendRelation>> {
    if (!otherIds.length) return new Map();
    const rows = await this.dataSource.getRepository(Friendship).find({
      where: [
        { requesterId: userId, addresseeId: In(otherIds) },
        { addresseeId: userId, requesterId: In(otherIds) },
      ],
    });
    return new Map(
      rows.map((row): [string, FriendRelation] => {
        const otherId =
          row.requesterId === userId ? row.addresseeId : row.requesterId;
        if (row.status === 'accepted') return [otherId, 'friend'];
        return [otherId, row.requesterId === userId ? 'outgoing' : 'incoming'];
      }),
    );
  }
}
