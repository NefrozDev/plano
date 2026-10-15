import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { ListEntry } from './list-entry.entity';
import { List } from './list.entity';

@Entity({ name: 'list_sections' })
@Index('IDX_list_sections_list', ['listId'])
export class ListSection {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  listId!: string;

  @ManyToOne(() => List, (list) => list.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listId' })
  list!: List;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 7 })
  color!: string;

  /** Display order within the list, from 0. */
  @Column({ type: 'integer' })
  position!: number;

  @OneToMany(() => ListEntry, (entry) => entry.section)
  entries!: ListEntry[];
}
