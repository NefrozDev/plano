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
import { Objective } from './objective.entity';

/** Said on one objective: only those who can open it can read it. */
@Entity({ name: 'objective_comments' })
@Index('IDX_objective_comments_objective', ['objectiveId', 'createdAt'])
export class ObjectiveComment {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  objectiveId!: string;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'objectiveId',
    foreignKeyConstraintName: 'FK_objective_comments_objective',
  })
  objective!: Objective;

  /** Null once that user's account is deleted. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  authorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'authorId',
    foreignKeyConstraintName: 'FK_objective_comments_author',
  })
  author!: User | null;

  @Column({ type: 'varchar', length: 1000 })
  body!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
