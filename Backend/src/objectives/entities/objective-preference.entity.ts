import type { DueReminder, ObjectiveReminder } from '@plano/common';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Objective } from './objective.entity';

/**
 * What one person chose for an objective they can open: its place in their
 * objectives, its home page pin and their reminders. Nobody's choice changes
 * anyone else's. No row: default place, not pinned, no reminder.
 */
@Entity({ name: 'objective_preferences' })
@Index('IDX_objective_preferences_objective', ['objectiveId'])
export class ObjectivePreference {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_objective_preferences_user',
  })
  user!: User;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  objectiveId!: string;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'objectiveId',
    foreignKeyConstraintName: 'FK_objective_preferences_objective',
  })
  objective!: Objective;

  /** Null until the person reorders their objectives. */
  @Column({ type: 'integer', nullable: true })
  position!: number | null;

  @Column({ type: 'boolean', default: false })
  onHome!: boolean;

  @Column({ type: 'varchar', length: 8, default: 'none' })
  reminderFrequency!: ObjectiveReminder['frequency'];

  @Column({ type: 'varchar', length: 5, default: '09:00' })
  reminderTime!: string;

  /** 0 = Monday … 6 = Sunday. */
  @Column({ type: 'integer', default: 0 })
  reminderWeekday!: number;

  @Column({ type: 'varchar', length: 16, default: 'none' })
  dueReminder!: DueReminder;
}
