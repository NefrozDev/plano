import type { ObjectiveMemberRole } from '@plano/common';
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
import { Objective } from './objective.entity';

/**
 * Someone the owner invited to one objective of a tree, at any level. It gives
 * access to that objective and everything below it, nothing above. The owner has
 * no row.
 */
@Entity({ name: 'objective_members' })
@Index('UQ_objective_members_objective_user', ['objectiveId', 'userId'], {
  unique: true,
})
@Index('IDX_objective_members_user', ['userId'])
export class ObjectiveMember {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  objectiveId!: string;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'objectiveId',
    foreignKeyConstraintName: 'FK_objective_members_objective',
  })
  objective!: Objective;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_objective_members_user',
  })
  user!: User;

  @Column({ type: 'varchar', length: 16 })
  role!: ObjectiveMemberRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
