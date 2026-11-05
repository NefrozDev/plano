import type { ObjectiveUserSettings } from '@plano/common';
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/user.entity';

/** One row per user, created on their first visit; defaults come from the columns. */
@Entity({ name: 'objective_settings' })
export class ObjectiveSettings implements ObjectiveUserSettings {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_objective_settings_user',
  })
  user!: User;

  @Column({ type: 'varchar', length: 4, default: 'list' })
  defaultView!: ObjectiveUserSettings['defaultView'];

  @Column({ type: 'boolean', default: false })
  showArchived!: boolean;

  @Column({ type: 'varchar', length: 11, default: 'day-before' })
  defaultDueReminder!: ObjectiveUserSettings['defaultDueReminder'];

  @Column({ type: 'boolean', default: true })
  notifications!: boolean;

  @Column({ type: 'varchar', length: 9, default: 'scheduled' })
  habitReminders!: ObjectiveUserSettings['habitReminders'];

  @Column({ type: 'boolean', default: true })
  showPercentage!: boolean;

  @Column({ type: 'boolean', default: true })
  categoryColors!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  recentIds!: string[];
}
