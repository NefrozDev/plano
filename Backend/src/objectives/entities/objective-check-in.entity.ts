import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/user.entity';
import { Objective } from './objective.entity';

/** One person succeeded a habit on one day. */
@Entity({ name: 'objective_check_ins' })
@Index('IDX_objective_check_ins_user', ['userId'])
export class ObjectiveCheckInRow {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  objectiveId!: string;

  @ManyToOne(() => Objective, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'objectiveId',
    foreignKeyConstraintName: 'FK_objective_check_ins_objective',
  })
  objective!: Objective;

  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_objective_check_ins_user',
  })
  user!: User;

  /** Local `YYYY-MM-DD`. */
  @PrimaryColumn({ type: 'varchar', length: 10 })
  date!: string;
}
