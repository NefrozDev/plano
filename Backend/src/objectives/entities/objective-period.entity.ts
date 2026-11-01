import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Objective } from './objective.entity';

/** How a period of a recurring objective ended. */
@Entity({ name: 'objective_periods' })
@Index('IDX_objective_periods_objective', ['objectiveId'])
export class ObjectivePeriod {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  objectiveId!: string;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'objectiveId',
    foreignKeyConstraintName: 'FK_objective_periods_objective',
  })
  objective!: Objective;

  /** First day, `YYYY-MM-DD`. */
  @Column({ type: 'varchar', length: 10 })
  startDate!: string;

  /** Last day, `YYYY-MM-DD`. */
  @Column({ type: 'varchar', length: 10 })
  endDate!: string;

  /** Where the bar was; null without a completion bar. */
  @Column({ type: 'integer', nullable: true })
  percent!: number | null;

  @Column({ type: 'boolean' })
  completed!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
