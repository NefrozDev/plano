import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddListRemoveChecked1787580000000 implements MigrationInterface {
  readonly name = 'AddListRemoveChecked1787580000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'lists',
      new TableColumn({
        name: 'removeChecked',
        type: 'boolean',
        default: false,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('lists', 'removeChecked');
  }
}
