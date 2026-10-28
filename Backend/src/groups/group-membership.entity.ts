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
import { Group } from './group.entity';

export type GroupRole = 'owner' | 'member';

@Entity({ name: 'group_memberships' })
// A user joins each group at most once; the composite index also serves
// lookups by group, its leading column.
@Index('UQ_group_memberships_group_user', ['groupId', 'userId'], {
  unique: true,
})
@Index('IDX_group_memberships_user', ['userId'])
export class GroupMembership {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_group_memberships_user',
  })
  user!: User;

  @Column({ type: 'varchar', length: 36 })
  groupId!: string;

  @ManyToOne(() => Group, (group) => group.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'groupId',
    foreignKeyConstraintName: 'FK_group_memberships_group',
  })
  group!: Group;

  @Column({ type: 'varchar', length: 16 })
  role!: GroupRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
