import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddObjectiveSharing1787740000000 implements MigrationInterface {
  readonly name = 'AddObjectiveSharing1787740000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'objective_members',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'objectiveId', type: 'varchar', length: '36' },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'role', type: 'varchar', length: '16' },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndices('objective_members', [
      new TableIndex({
        name: 'UQ_objective_members_objective_user',
        columnNames: ['objectiveId', 'userId'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_objective_members_user',
        columnNames: ['userId'],
      }),
    ]);
    await queryRunner.createForeignKeys('objective_members', [
      new TableForeignKey({
        name: 'FK_objective_members_objective',
        columnNames: ['objectiveId'],
        referencedTableName: 'objectives',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_objective_members_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.addColumn(
      'objectives',
      new TableColumn({
        name: 'assignedToUserId',
        type: 'varchar',
        length: '36',
        isNullable: true,
      }),
    );
    await queryRunner.createForeignKey(
      'objectives',
      new TableForeignKey({
        name: 'FK_objectives_assigned_to',
        columnNames: ['assignedToUserId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('objectives', 'FK_objectives_assigned_to');
    await queryRunner.dropColumn('objectives', 'assignedToUserId');
    await queryRunner.dropTable('objective_members');
  }
}
