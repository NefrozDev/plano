import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import type { AvatarType, Locale } from '@plano/common';
import { Session } from '../auth/session.entity';

@Entity({ name: 'users' })
@Index('UQ_users_normalized_username', ['normalizedUsername'], { unique: true })
@Index('UQ_users_normalized_email', ['normalizedEmail'], { unique: true })
export class User {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  firstName!: string;

  @Column({ type: 'varchar', length: 80 })
  lastName!: string;

  @Column({ type: 'varchar', length: 30 })
  username!: string;

  @Column({ type: 'varchar', length: 30, select: false })
  normalizedUsername!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 254, select: false })
  normalizedEmail!: string;

  @Column({ type: 'text', select: false })
  passwordHash!: string;

  @Column({ type: 'timestamptz' })
  termsAcceptedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'varchar', length: 8, default: 'fr' })
  locale!: Locale;

  /** Small square picture resized by the browser; only the avatar route reads it. */
  @Column({ type: 'bytea', nullable: true, select: false })
  avatar!: Buffer | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  avatarType!: AvatarType | null;

  /** Versions the avatar URL, so browsers can cache each picture for good. */
  @Column({ type: 'timestamptz', nullable: true })
  avatarUpdatedAt!: Date | null;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];
}
