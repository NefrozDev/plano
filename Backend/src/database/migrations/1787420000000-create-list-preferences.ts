import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateListPreferences1787420000000 implements MigrationInterface {
  readonly name = 'CreateListPreferences1787420000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'list_preferences',
        columns: [
          { name: 'userId', type: 'varchar', length: '36', isPrimary: true },
          { name: 'listId', type: 'varchar', length: '36', isPrimary: true },
          { name: 'position', type: 'integer', isNullable: true },
          { name: 'onHome', type: 'boolean', default: false },
        ],
      }),
    );
    await queryRunner.createIndex(
      'list_preferences',
      new TableIndex({
        name: 'IDX_list_preferences_list',
        columnNames: ['listId'],
      }),
    );
    await queryRunner.createForeignKeys('list_preferences', [
      new TableForeignKey({
        name: 'FK_list_preferences_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_list_preferences_list',
        columnNames: ['listId'],
        referencedTableName: 'lists',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('list_preferences');
  }
}
