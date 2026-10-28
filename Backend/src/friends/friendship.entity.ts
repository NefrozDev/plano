import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type FriendshipStatus = 'pending' | 'accepted';

/**
 * A friend request, and once accepted the friendship itself. A pair of users
 * has at most one row whatever its direction: the migration adds a unique
 * index on (LEAST, GREATEST) of the two ids, which decorators cannot express.
 */
@Entity({ name: 'friendships' })
@Check('CHK_friendships_not_self', '"requesterId" <> "addresseeId"')
@Index('IDX_friendships_requester', ['requesterId'])
@Index('IDX_friendships_addressee', ['addresseeId'])
export class Friendship {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  requesterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'requesterId',
    foreignKeyConstraintName: 'FK_friendships_requester',
  })
  requester!: User;

  @Column({ type: 'varchar', length: 36 })
  addresseeId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'addresseeId',
    foreignKeyConstraintName: 'FK_friendships_addressee',
  })
  addressee!: User;

  @Column({ type: 'varchar', length: 16 })
  status!: FriendshipStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;
}
