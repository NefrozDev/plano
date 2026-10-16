import type { ListSettings as ListSettingsShape } from '@plano/common';
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/user.entity';

/** One row per user, created on their first change; defaults come from the columns. */
@Entity({ name: 'list_settings' })
export class ListSettings implements ListSettingsShape {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_list_settings_user',
  })
  user!: User;

  @Column({ type: 'varchar', length: 8, default: 'list' })
  defaultView!: ListSettingsShape['defaultView'];

  @Column({ type: 'boolean', default: true })
  showCounts!: boolean;

  @Column({ type: 'boolean', default: true })
  showCompleted!: boolean;

  @Column({ type: 'boolean', default: true })
  completedLast!: boolean;

  @Column({ type: 'varchar', length: 5, default: '09:00' })
  defaultReminder!: string;

  @Column({ type: 'varchar', length: 8, default: 'mine' })
  notifyScope!: ListSettingsShape['notifyScope'];

  @Column({ type: 'boolean', default: false })
  archiveCompleted!: boolean;

  @Column({ type: 'boolean', default: true })
  confirmDelete!: boolean;
}
