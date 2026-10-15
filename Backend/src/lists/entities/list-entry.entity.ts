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
import { ListSection } from './list-section.entity';

@Entity({ name: 'list_entries' })
@Index('IDX_list_entries_section', ['sectionId'])
@Index('IDX_list_entries_list', ['listId'])
export class ListEntry {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  /** Denormalised from the section, so a list's entries need no join. */
  @Column({ type: 'varchar', length: 36 })
  listId!: string;

  @Column({ type: 'varchar', length: 36 })
  sectionId!: string;

  @ManyToOne(() => ListSection, (section) => section.entries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sectionId' })
  section!: ListSection;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'boolean', default: false })
  done!: boolean;

  @Column({ type: 'boolean', default: false })
  highlighted!: boolean;

  /** Null once that user's account is deleted. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  addedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'addedByUserId' })
  addedBy!: User | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedToUserId!: string | null;

  /** Local `YYYY-MM-DDTHH:mm`. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  reminder!: string | null;

  @Column({ type: 'varchar', length: 2000, default: '' })
  notes!: string;

  /** Display order within the section, from 0. */
  @Column({ type: 'integer' })
  position!: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
