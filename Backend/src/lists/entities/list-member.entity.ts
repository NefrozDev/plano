import type { ListMemberRole } from '@plano/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { List } from './list.entity';

/** A group member the owner shared the list with. The owner has no row. */
@Entity({ name: 'list_members' })
@Index('UQ_list_members_list_user', ['listId', 'userId'], { unique: true })
@Index('IDX_list_members_user', ['userId'])
export class ListMember {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  listId!: string;

  @ManyToOne(() => List, (list) => list.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listId' })
  list!: List;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 16 })
  role!: ListMemberRole;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
