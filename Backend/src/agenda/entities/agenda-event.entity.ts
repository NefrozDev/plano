import type { AgendaAttachment, EventRecurrence } from '@plano/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { AgendaGuest } from './agenda-guest.entity';

/**
 * An event, organised by its owner. Times are floating local date-times
 * (`YYYY-MM-DDTHH:mm`): 09:00 stays 09:00 wherever it is opened.
 */
@Entity({ name: 'agenda_events' })
@Index('IDX_agenda_events_owner', ['ownerId'])
export class AgendaEvent {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'ownerId',
    foreignKeyConstraintName: 'FK_agenda_events_owner',
  })
  owner!: User;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'boolean', default: false })
  allDay!: boolean;

  @Column({ type: 'varchar', length: 16 })
  start!: string;

  @Column({ type: 'varchar', length: 16 })
  end!: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  location!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 8, default: 'none' })
  recurrence!: EventRecurrence;

  /** Overrides the calendar colour when set. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  color!: string | null;

  @Column({ type: 'varchar', length: 300, default: '' })
  conferenceUrl!: string;

  /** Names and sizes only: the files themselves are not uploaded. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments!: AgendaAttachment[];

  @Column({ type: 'varchar', length: 1000, default: '' })
  notes!: string;

  @Column({ type: 'varchar', length: 4, default: 'busy' })
  availability!: 'busy' | 'free';

  @Column({ type: 'varchar', length: 8, default: 'default' })
  visibility!: 'default' | 'private';

  /** The owner's calendar, kept in their browser; guests pick their own. */
  @Column({ type: 'varchar', length: 40 })
  calendarId!: string;

  /** The owner's reminder, in minutes before the start. */
  @Column({ type: 'integer', nullable: true })
  reminderMinutes!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => AgendaGuest, (guest) => guest.event)
  guests!: AgendaGuest[];
}
