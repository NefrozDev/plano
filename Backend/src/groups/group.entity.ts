import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { GroupMembership } from './group-membership.entity';

@Entity({ name: 'groups' })
@Index('UQ_groups_invite_code', ['inviteCode'], { unique: true })
export class Group {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 8 })
  inviteCode!: string;

  @Column({ type: 'varchar', length: 36 })
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy!: User;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @OneToMany(() => GroupMembership, (membership) => membership.group)
  memberships!: GroupMembership[];
}
