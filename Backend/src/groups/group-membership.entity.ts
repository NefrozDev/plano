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
@Index('UQ_group_memberships_user', ['userId'], { unique: true })
@Index('IDX_group_memberships_group', ['groupId'])
export class GroupMembership {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 36 })
  groupId!: string;

  @ManyToOne(() => Group, (group) => group.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'groupId' })
  group!: Group;

  @Column({ type: 'varchar', length: 16 })
  role!: GroupRole;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
