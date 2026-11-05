import type { AgendaAttendeeStatus } from '@plano/common';
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
import { AgendaEvent } from './agenda-event.entity';

/** Someone the owner invited, with their answer. The owner has no row. */
@Entity({ name: 'agenda_guests' })
@Index('IDX_agenda_guests_user', ['userId'])
export class AgendaGuest {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  eventId!: string;

  @ManyToOne(() => AgendaEvent, (event) => event.guests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'eventId',
    foreignKeyConstraintName: 'FK_agenda_guests_event',
  })
  event!: AgendaEvent;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_agenda_guests_user',
  })
  user!: User;

  @Column({ type: 'varchar', length: 8, default: 'pending' })
  status!: AgendaAttendeeStatus;

  /** The guest's own calendar, chosen when they accept. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  calendarId!: string | null;

  @Column({ type: 'integer', nullable: true })
  reminderMinutes!: number | null;

  /** In invitation order. */
  @CreateDateColumn({ type: 'timestamptz' })
  invitedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;
}
