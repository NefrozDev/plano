import type { ObjectiveActivityKind } from '@plano/common';
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

/** One line of an objective's history: who did what, and when. */
@Entity({ name: 'objective_activity' })
@Index('IDX_objective_activity_objective', ['objectiveId', 'createdAt'])
export class ObjectiveActivity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  objectiveId!: string;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'objectiveId',
    foreignKeyConstraintName: 'FK_objective_activity_objective',
  })
  objective!: Objective;

  /** Null once that user's account is deleted. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'actorId',
    foreignKeyConstraintName: 'FK_objective_activity_actor',
  })
  actor!: User | null;

  @Column({ type: 'varchar', length: 24 })
  kind!: ObjectiveActivityKind;

  /** What it was about: an amount, a day, a name. */
  @Column({ type: 'varchar', length: 200, default: '' })
  detail!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
