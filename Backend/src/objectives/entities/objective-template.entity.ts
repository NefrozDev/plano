import type { ObjectiveTemplateNode } from '@plano/common';
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

/** A structure to reuse, private to its creator: settings only, no progress or people. */
@Entity({ name: 'objective_templates' })
@Index('IDX_objective_templates_owner', ['ownerId'])
export class ObjectiveTemplate {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'ownerId',
    foreignKeyConstraintName: 'FK_objective_templates_owner',
  })
  owner!: User;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'jsonb' })
  structure!: ObjectiveTemplateNode;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
