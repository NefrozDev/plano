import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddListObjective1788060000000 implements MigrationInterface {
  readonly name = 'AddListObjective1788060000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'lists',
      new TableColumn({
        name: 'objectiveId',
        type: 'varchar',
        length: '36',
        isNullable: true,
      }),
    );
    await queryRunner.createIndex(
      'lists',
      new TableIndex({
        name: 'IDX_lists_objective',
        columnNames: ['objectiveId'],
      }),
    );
    // Deleting the objective keeps its lists, unlinked.
    await queryRunner.createForeignKey(
      'lists',
      new TableForeignKey({
        name: 'FK_lists_objective',
        columnNames: ['objectiveId'],
        referencedTableName: 'objectives',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('lists', 'FK_lists_objective');
    await queryRunner.dropIndex('lists', 'IDX_lists_objective');
    await queryRunner.dropColumn('lists', 'objectiveId');
  }
}
