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

/**
 * A pending password recovery. Only the SHA-256 of the token is stored, like
 * sessions: a leaked database cannot be used to reset anyone's password.
 */
@Entity({ name: 'password_resets' })
@Index('UQ_password_resets_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_password_resets_user', ['userId'])
export class PasswordReset {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_password_resets_user',
  })
  user!: User;

  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
