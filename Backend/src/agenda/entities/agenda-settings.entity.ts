import type { AgendaUserSettings } from '@plano/common';
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/user.entity';

/** One row per user, created on their first visit; defaults come from the columns. */
@Entity({ name: 'agenda_settings' })
export class AgendaSettings implements AgendaUserSettings {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_agenda_settings_user',
  })
  user!: User;

  @Column({ type: 'smallint', default: 1 })
  weekStartsOn!: AgendaUserSettings['weekStartsOn'];

  @Column({ type: 'integer', default: 60 })
  defaultDurationMinutes!: number;

  @Column({ type: 'varchar', length: 64, default: 'Europe/Brussels' })
  timeZone!: string;

  @Column({ type: 'integer', nullable: true, default: 15 })
  defaultReminderMinutes!: number | null;

  @Column({ type: 'boolean', default: true })
  eventNotifications!: boolean;

  @Column({ type: 'boolean', default: true })
  invitationNotifications!: boolean;

  @Column({ type: 'boolean', default: false })
  showWeekNumbers!: boolean;

  @Column({ type: 'varchar', length: 3, default: '24h' })
  hourFormat!: AgendaUserSettings['hourFormat'];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  hiddenCalendarIds!: string[];

  @Column({ type: 'boolean', default: true })
  showEvents!: boolean;

  @Column({ type: 'boolean', default: true })
  showTasks!: boolean;

  @Column({ type: 'boolean', default: true })
  showPastEvents!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  calendarColors!: Record<string, string>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  recentIds!: string[];
}
