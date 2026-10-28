import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/** Lifts the one-group-per-user rule: a user may now join several groups, each once. */
export class AllowSeveralGroups1787180000000 implements MigrationInterface {
  readonly name = 'AllowSeveralGroups1787180000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'group_memberships',
      'UQ_group_memberships_user',
    );
    await queryRunner.dropIndex(
      'group_memberships',
      'IDX_group_memberships_group',
    );
    await queryRunner.createIndices('group_memberships', [
      new TableIndex({
        name: 'UQ_group_memberships_group_user',
        columnNames: ['groupId', 'userId'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_group_memberships_user',
        columnNames: ['userId'],
      }),
    ]);
  }

  /** Fails while a user still belongs to several groups: the old unique index cannot be rebuilt then. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'group_memberships',
      'IDX_group_memberships_user',
    );
    await queryRunner.dropIndex(
      'group_memberships',
      'UQ_group_memberships_group_user',
    );
    await queryRunner.createIndices('group_memberships', [
      new TableIndex({
        name: 'UQ_group_memberships_user',
        columnNames: ['userId'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_group_memberships_group',
        columnNames: ['groupId'],
      }),
    ]);
  }
}
