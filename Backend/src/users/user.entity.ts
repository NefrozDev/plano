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
// Not unique here: the identity service owns usernames and e-mail addresses,
// and a copy can lag behind a rename until its owner signs in again.
@Index('IDX_users_normalized_username', ['normalizedUsername'])
@Index('IDX_users_normalized_email', ['normalizedEmail'])
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

  /** When Plano's own terms were accepted; null until the first screen asks. */
  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt!: Date | null;

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
