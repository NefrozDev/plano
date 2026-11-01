import type { ObjectiveSessionStatus } from '@plano/common';
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

/** A dated contribution to a numeric objective; only `done` ones count. */
@Entity({ name: 'objective_sessions' })
@Index('IDX_objective_sessions_objective', ['objectiveId'])
export class ObjectiveSession {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  objectiveId!: string;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'objectiveId',
    foreignKeyConstraintName: 'FK_objective_sessions_objective',
  })
  objective!: Objective;

  /** Null once that user's account is deleted. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  authorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'authorId',
    foreignKeyConstraintName: 'FK_objective_sessions_author',
  })
  author!: User | null;

  /** Local `YYYY-MM-DD`. */
  @Column({ type: 'varchar', length: 10 })
  date!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: ObjectiveSessionStatus;

  @Column({ type: 'varchar', length: 60, default: '' })
  label!: string;

  @Column({ type: 'double precision', default: 0 })
  value!: number;

  @Column({ type: 'integer', nullable: true })
  durationMinutes!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
