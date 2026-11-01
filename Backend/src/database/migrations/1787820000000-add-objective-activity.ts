import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddObjectiveActivity1787820000000 implements MigrationInterface {
  readonly name = 'AddObjectiveActivity1787820000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'objective_activity',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'objectiveId', type: 'varchar', length: '36' },
          { name: 'actorId', type: 'varchar', length: '36', isNullable: true },
          { name: 'kind', type: 'varchar', length: '24' },
          { name: 'detail', type: 'varchar', length: '200', default: "''" },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'objective_activity',
      new TableIndex({
        name: 'IDX_objective_activity_objective',
        columnNames: ['objectiveId', 'createdAt'],
      }),
    );
    await queryRunner.createForeignKeys('objective_activity', [
      new TableForeignKey({
        name: 'FK_objective_activity_objective',
        columnNames: ['objectiveId'],
        referencedTableName: 'objectives',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_objective_activity_actor',
        columnNames: ['actorId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'objective_comments',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'objectiveId', type: 'varchar', length: '36' },
          { name: 'authorId', type: 'varchar', length: '36', isNullable: true },
          { name: 'body', type: 'varchar', length: '1000' },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'objective_comments',
      new TableIndex({
        name: 'IDX_objective_comments_objective',
        columnNames: ['objectiveId', 'createdAt'],
      }),
    );
    await queryRunner.createForeignKeys('objective_comments', [
      new TableForeignKey({
        name: 'FK_objective_comments_objective',
        columnNames: ['objectiveId'],
        referencedTableName: 'objectives',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_objective_comments_author',
        columnNames: ['authorId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('objective_comments');
    await queryRunner.dropTable('objective_activity');
  }
}
