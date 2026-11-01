import type {
  CompletionMode,
  MetricAggregation,
  ObjectiveRecurrence,
  ObjectiveCategory,
  ObjectiveStatus,
  TimelapseMode,
} from '@plano/common';
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

/**
 * One node of an objective tree: a top-level objective or a sub-objective, at
 * any depth. `rootId` loads a whole tree in one query, without recursion.
 */
@Entity({ name: 'objectives' })
@Index('IDX_objectives_root', ['rootId'])
@Index('IDX_objectives_parent', ['parentId'])
@Index('IDX_objectives_owner', ['ownerId'])
export class Objective {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  /** The top of the tree; its own id on a top-level objective. */
  @Column({ type: 'varchar', length: 36 })
  rootId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  parentId!: string | null;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({
    name: 'parentId',
    foreignKeyConstraintName: 'FK_objectives_parent',
  })
  parent!: Objective | null;

  /** Denormalised from the root: one person owns a whole tree. */
  @Column({ type: 'varchar', length: 36 })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'ownerId',
    foreignKeyConstraintName: 'FK_objectives_owner',
  })
  owner!: User;

  @Column({ type: 'varchar', length: 80 })
  title!: string;

  @Column({ type: 'varchar', length: 16 })
  category!: ObjectiveCategory;

  @Column({ type: 'varchar', length: 500, default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  plan!: string;

  @Column({ type: 'varchar', length: 16 })
  completion!: CompletionMode;

  @Column({ type: 'varchar', length: 12, nullable: true })
  metricUnit!: string | null;

  @Column({ type: 'double precision', nullable: true })
  metricTarget!: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  metricAggregation!: MetricAggregation | null;

  @Column({ type: 'integer', nullable: true })
  habitTargetDays!: number | null;

  /** The bar of a `manual` objective, 0 to 100. */
  @Column({ type: 'integer', default: 0 })
  manualProgress!: number;

  @Column({ type: 'varchar', length: 16, default: 'off' })
  timelapse!: TimelapseMode;

  /** Local `YYYY-MM-DD`. */
  @Column({ type: 'varchar', length: 10 })
  startDate!: string;

  /** Local `YYYY-MM-DD`. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  dueDate!: string | null;

  /** Share of the parent's bar, relative to its siblings. */
  @Column({ type: 'integer', default: 1 })
  weight!: number;

  /** Display order among siblings, from 0. Top-level order belongs to each person. */
  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: ObjectiveStatus;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** Only on a top-level objective. */
  @Column({ type: 'varchar', length: 8, default: 'none' })
  recurrence!: ObjectiveRecurrence;

  /** Start of the current period: only what falls in it counts. Null without recurrence. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  periodStart!: string | null;

  /** Null while open, or once that user's account is deleted. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  completedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'completedByUserId',
    foreignKeyConstraintName: 'FK_objectives_completed_by',
  })
  completedBy!: User | null;

  /** Null when nobody is assigned, or once that user's account is deleted. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedToUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'assignedToUserId',
    foreignKeyConstraintName: 'FK_objectives_assigned_to',
  })
  assignedTo!: User | null;

  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
