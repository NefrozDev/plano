import type { ListIcon } from '@plano/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { ListMember } from './list-member.entity';
import { ListSection } from './list-section.entity';

@Entity({ name: 'lists' })
@Index('IDX_lists_owner', ['ownerId'])
export class List {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId', foreignKeyConstraintName: 'FK_lists_owner' })
  owner!: User;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 16 })
  icon!: ListIcon;

  @Column({ type: 'varchar', length: 7 })
  color!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  description!: string;

  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => ListMember, (member) => member.list)
  members!: ListMember[];

  @OneToMany(() => ListSection, (section) => section.list)
  sections!: ListSection[];
}
