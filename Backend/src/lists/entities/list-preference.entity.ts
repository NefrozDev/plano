import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { List } from './list.entity';

/**
 * How one person arranges a list they can open: its place in their lists and
 * whether it shows on their home page. Shared lists get one row per person, so
 * nobody's arrangement changes anyone else's. No row: default place, not pinned.
 */
@Entity({ name: 'list_preferences' })
@Index('IDX_list_preferences_list', ['listId'])
export class ListPreference {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_list_preferences_user',
  })
  user!: User;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  listId!: string;

  @ManyToOne(() => List, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'listId',
    foreignKeyConstraintName: 'FK_list_preferences_list',
  })
  list!: List;

  /** Null until the person reorders their lists. */
  @Column({ type: 'integer', nullable: true })
  position!: number | null;

  @Column({ type: 'boolean', default: false })
  onHome!: boolean;
}
