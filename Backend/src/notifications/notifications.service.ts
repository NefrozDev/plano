import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  MarkNotificationsReadRequest,
  NotificationArea,
  NotificationEntry,
  NotificationKind,
  NotificationsResponse,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, In, IsNull, LessThan } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { displayName } from '../lists/list.mapper';
import { LiveEventsService } from '../live/live-events.service';
import { avatarVersion } from '../users/user.mapper';
import { Notification } from './notification.entity';
import { NOTIFICATION_AREAS } from './notifications.dto';

/** The bell shows this many; the unread counts cover them all. */
export const NOTIFICATION_PAGE = 50;
/** Read notifications are kept this long, as a short history in the bell. */
export const READ_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const TITLE_LENGTH = 120;

export interface NewNotification {
  area: NotificationArea;
  kind: NotificationKind;
  targetId: string;
  title?: string;
  /** Who did it: they are never notified of their own action. */
  actorId: string | null;
}

/**
 * Stores what happened to each user until they read it, and tells their open
 * apps. Called once the change is committed: a failure is logged and the
 * notification lost, the change itself never undone.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly live: LiveEventsService,
  ) {}

  /**
   * One notification per recipient. The same news on the same thing joins an
   * unread one instead (count + 1), so a busy list is one line, not fifty.
   */
  async notify(
    userIds: Iterable<string>,
    news: NewNotification,
  ): Promise<void> {
    const recipients = [...new Set(userIds)].filter(
      (userId) => userId !== news.actorId,
    );
    if (!recipients.length) return;
    const title = (news.title ?? '').slice(0, TITLE_LENGTH);
    try {
      await this.writeLock.runExclusive(() =>
        this.dataSource.transaction(async (manager) => {
          const now = new Date();
          const unread = await manager.find(Notification, {
            where: {
              userId: In(recipients),
              kind: news.kind,
              targetId: news.targetId,
              readAt: IsNull(),
            },
          });
          for (const notification of unread) {
            notification.count += 1;
            notification.actorId = news.actorId;
            notification.title = title;
            notification.updatedAt = now;
          }
          await manager.save(unread);
          const grouped = new Set(unread.map(({ userId }) => userId));
          const fresh = recipients
            .filter((userId) => !grouped.has(userId))
            .map((userId) => ({
              id: randomUUID(),
              userId,
              area: news.area,
              kind: news.kind,
              targetId: news.targetId,
              title,
              actorId: news.actorId,
              count: 1,
              updatedAt: now,
              readAt: null,
            }));
          if (fresh.length) await manager.insert(Notification, fresh);
        }),
      );
      this.live.publish(recipients, { type: 'notifications.changed' });
    } catch (error) {
      this.logger.warn(
        `No ${news.kind} notification for ${news.targetId}: ${String(error)}`,
      );
    }
  }

  /**
   * They lost access to these lists or objectives (deleted, or no longer shared):
   * nothing about them stays in the bell.
   */
  async forget(
    userIds: Iterable<string>,
    targetIds: Iterable<string>,
  ): Promise<void> {
    const users = [...new Set(userIds)];
    const targets = [...new Set(targetIds)];
    if (!users.length || !targets.length) return;
    try {
      const { affected } = await this.dataSource.manager.delete(Notification, {
        userId: In(users),
        targetId: In(targets),
      });
      if (affected) this.live.publish(users, { type: 'notifications.changed' });
    } catch (error) {
      this.logger.warn(
        `Notifications not cleared for ${targets.join(', ')}: ${String(error)}`,
      );
    }
  }

  /** A request was declined or cancelled, or a friendship ended: their friend news go. */
  async forgetFriendship(userId: string, otherId: string): Promise<void> {
    try {
      const { affected } = await this.dataSource.manager.delete(Notification, [
        { userId, targetId: otherId, area: 'friends' },
        { userId: otherId, targetId: userId, area: 'friends' },
      ]);
      if (affected)
        this.live.publish([userId, otherId], { type: 'notifications.changed' });
    } catch (error) {
      this.logger.warn(`Friend notifications not cleared: ${String(error)}`);
    }
  }

  async list(userId: string): Promise<NotificationsResponse> {
    const manager = this.dataSource.manager;
    await manager.delete(Notification, {
      userId,
      readAt: LessThan(new Date(Date.now() - READ_RETENTION_DAYS * DAY_MS)),
    });
    const [rows, counts] = await Promise.all([
      manager.find(Notification, {
        where: { userId },
        relations: { actor: true },
        order: { updatedAt: 'DESC', id: 'ASC' },
        take: NOTIFICATION_PAGE,
      }),
      manager
        .createQueryBuilder(Notification, 'notification')
        .select('notification.area', 'area')
        .addSelect('COUNT(*)', 'count')
        .where('notification.userId = :userId', { userId })
        .andWhere('notification.readAt IS NULL')
        .groupBy('notification.area')
        .getRawMany<{ area: NotificationArea; count: string }>(),
    ]);
    const unread = Object.fromEntries(
      NOTIFICATION_AREAS.map((area) => [area, 0]),
    ) as Record<NotificationArea, number>;
    for (const { area, count } of counts) unread[area] = Number(count);
    return { items: rows.map(toEntry), unread };
  }

  /** Opening a list, an objective or the friends marks what is about it as read. */
  async markRead(
    userId: string,
    { area, targetId }: MarkNotificationsReadRequest,
  ): Promise<void> {
    const { affected } = await this.dataSource.manager.update(
      Notification,
      { userId, area, readAt: IsNull(), ...(targetId && { targetId }) },
      { readAt: new Date() },
    );
    if (affected)
      this.live.publish([userId], { type: 'notifications.changed' });
  }

  /** Tapped in the bell. */
  async markOneRead(userId: string, id: string): Promise<void> {
    const notification = await this.dataSource.manager.findOne(Notification, {
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification introuvable.');
    if (notification.readAt) return;
    notification.readAt = new Date();
    await this.dataSource.manager.save(notification);
    this.live.publish([userId], { type: 'notifications.changed' });
  }
}

function toEntry(notification: Notification): NotificationEntry {
  return {
    id: notification.id,
    area: notification.area,
    kind: notification.kind,
    targetId: notification.targetId,
    title: notification.title,
    actor: notification.actor
      ? {
          id: notification.actor.id,
          name: displayName(notification.actor),
          avatarVersion: avatarVersion(notification.actor),
        }
      : null,
    count: notification.count,
    updatedAt: notification.updatedAt.toISOString(),
    read: notification.readAt !== null,
  };
}
