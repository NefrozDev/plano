import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
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

  @Column({ type: 'datetime' })
  termsAcceptedAt!: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];
}
