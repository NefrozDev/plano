import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddObjectiveRecurrenceAndTemplates1787900000000 implements MigrationInterface {
  readonly name = 'AddObjectiveRecurrenceAndTemplates1787900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('objectives', [
      new TableColumn({
        name: 'recurrence',
        type: 'varchar',
        length: '8',
        default: "'none'",
      }),
      new TableColumn({
        name: 'periodStart',
        type: 'varchar',
        length: '10',
        isNullable: true,
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'objective_periods',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'objectiveId', type: 'varchar', length: '36' },
          { name: 'startDate', type: 'varchar', length: '10' },
          { name: 'endDate', type: 'varchar', length: '10' },
          { name: 'percent', type: 'integer', isNullable: true },
          { name: 'completed', type: 'boolean' },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'objective_periods',
      new TableIndex({
        name: 'IDX_objective_periods_objective',
        columnNames: ['objectiveId'],
      }),
    );
    await queryRunner.createForeignKey(
      'objective_periods',
      new TableForeignKey({
        name: 'FK_objective_periods_objective',
        columnNames: ['objectiveId'],
        referencedTableName: 'objectives',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'objective_templates',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'ownerId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '80' },
          { name: 'structure', type: 'jsonb' },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'objective_templates',
      new TableIndex({
        name: 'IDX_objective_templates_owner',
        columnNames: ['ownerId'],
      }),
    );
    await queryRunner.createForeignKey(
      'objective_templates',
      new TableForeignKey({
        name: 'FK_objective_templates_owner',
        columnNames: ['ownerId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('objective_templates');
    await queryRunner.dropTable('objective_periods');
    await queryRunner.dropColumns('objectives', ['recurrence', 'periodStart']);
  }
}
