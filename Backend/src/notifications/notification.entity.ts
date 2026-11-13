import type { NotificationArea, NotificationKind } from '@plano/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/** Something that happened to a user, kept until they open where it happened. */
@Entity({ name: 'notifications' })
@Index('IDX_notifications_user_updated', ['userId', 'updatedAt'])
@Index('IDX_notifications_user_target', ['userId', 'targetId'])
export class Notification {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  /** Who it is for. */
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_notifications_user',
  })
  user!: User;

  @Column({ type: 'varchar', length: 16 })
  area!: NotificationArea;

  @Column({ type: 'varchar', length: 32 })
  kind!: NotificationKind;

  /** The list or objective, or the other person for friend news. */
  @Column({ type: 'varchar', length: 36 })
  targetId!: string;

  /** The entries or comments inside the target that are new, oldest first. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  itemIds!: string[];

  @Column({ type: 'varchar', length: 120, default: '' })
  title!: string;

  /** Null once that user's account is deleted. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'actorId',
    foreignKeyConstraintName: 'FK_notifications_actor',
  })
  actor!: User | null;

  /** Times the same news happened while unread. */
  @Column({ type: 'integer', default: 1 })
  count!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  /** The last time it happened. */
  @Column({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
