import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

const id = (name: string, isPrimary = false) => ({
  name,
  type: 'varchar',
  length: '36',
  isPrimary,
});

const foreignKey = (
  name: string,
  column: string,
  table: string,
  onDelete: 'CASCADE' | 'SET NULL' = 'CASCADE',
) =>
  new TableForeignKey({
    name,
    columnNames: [column],
    referencedTableName: table,
    referencedColumnNames: ['id'],
    onDelete,
  });

export class CreateObjectives1787660000000 implements MigrationInterface {
  readonly name = 'CreateObjectives1787660000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'objectives',
        columns: [
          id('id', true),
          id('rootId'),
          { ...id('parentId'), isNullable: true },
          id('ownerId'),
          { name: 'title', type: 'varchar', length: '80' },
          { name: 'category', type: 'varchar', length: '16' },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            default: "''",
          },
          { name: 'plan', type: 'varchar', length: '120', default: "''" },
          { name: 'completion', type: 'varchar', length: '16' },
          {
            name: 'metricUnit',
            type: 'varchar',
            length: '12',
            isNullable: true,
          },
          { name: 'metricTarget', type: 'double precision', isNullable: true },
          {
            name: 'metricAggregation',
            type: 'varchar',
            length: '8',
            isNullable: true,
          },
          { name: 'habitTargetDays', type: 'integer', isNullable: true },
          { name: 'manualProgress', type: 'integer', default: 0 },
          {
            name: 'timelapse',
            type: 'varchar',
            length: '16',
            default: "'off'",
          },
          { name: 'startDate', type: 'varchar', length: '10' },
          { name: 'dueDate', type: 'varchar', length: '10', isNullable: true },
          { name: 'weight', type: 'integer', default: 1 },
          { name: 'position', type: 'integer', default: 0 },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'active'",
          },
          { name: 'completedAt', type: 'timestamptz', isNullable: true },
          { ...id('completedByUserId'), isNullable: true },
          { name: 'archived', type: 'boolean', default: false },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndices('objectives', [
      new TableIndex({ name: 'IDX_objectives_root', columnNames: ['rootId'] }),
      new TableIndex({
        name: 'IDX_objectives_parent',
        columnNames: ['parentId'],
      }),
      new TableIndex({
        name: 'IDX_objectives_owner',
        columnNames: ['ownerId'],
      }),
    ]);
    await queryRunner.createForeignKeys('objectives', [
      foreignKey('FK_objectives_parent', 'parentId', 'objectives'),
      foreignKey('FK_objectives_owner', 'ownerId', 'users'),
      foreignKey(
        'FK_objectives_completed_by',
        'completedByUserId',
        'users',
        'SET NULL',
      ),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'objective_sessions',
        columns: [
          id('id', true),
          id('objectiveId'),
          { ...id('authorId'), isNullable: true },
          { name: 'date', type: 'varchar', length: '10' },
          { name: 'status', type: 'varchar', length: '16' },
          { name: 'label', type: 'varchar', length: '60', default: "''" },
          { name: 'value', type: 'double precision', default: 0 },
          { name: 'durationMinutes', type: 'integer', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'objective_sessions',
      new TableIndex({
        name: 'IDX_objective_sessions_objective',
        columnNames: ['objectiveId'],
      }),
    );
    await queryRunner.createForeignKeys('objective_sessions', [
      foreignKey(
        'FK_objective_sessions_objective',
        'objectiveId',
        'objectives',
      ),
      foreignKey(
        'FK_objective_sessions_author',
        'authorId',
        'users',
        'SET NULL',
      ),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'objective_check_ins',
        columns: [
          id('objectiveId', true),
          id('userId', true),
          { name: 'date', type: 'varchar', length: '10', isPrimary: true },
        ],
      }),
    );
    await queryRunner.createIndex(
      'objective_check_ins',
      new TableIndex({
        name: 'IDX_objective_check_ins_user',
        columnNames: ['userId'],
      }),
    );
    await queryRunner.createForeignKeys('objective_check_ins', [
      foreignKey(
        'FK_objective_check_ins_objective',
        'objectiveId',
        'objectives',
      ),
      foreignKey('FK_objective_check_ins_user', 'userId', 'users'),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'objective_preferences',
        columns: [
          id('userId', true),
          id('objectiveId', true),
          { name: 'position', type: 'integer', isNullable: true },
          { name: 'onHome', type: 'boolean', default: false },
          {
            name: 'reminderFrequency',
            type: 'varchar',
            length: '8',
            default: "'none'",
          },
          {
            name: 'reminderTime',
            type: 'varchar',
            length: '5',
            default: "'09:00'",
          },
          { name: 'reminderWeekday', type: 'integer', default: 0 },
          {
            name: 'dueReminder',
            type: 'varchar',
            length: '16',
            default: "'none'",
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'objective_preferences',
      new TableIndex({
        name: 'IDX_objective_preferences_objective',
        columnNames: ['objectiveId'],
      }),
    );
    await queryRunner.createForeignKeys('objective_preferences', [
      foreignKey('FK_objective_preferences_user', 'userId', 'users'),
      foreignKey(
        'FK_objective_preferences_objective',
        'objectiveId',
        'objectives',
      ),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('objective_preferences');
    await queryRunner.dropTable('objective_check_ins');
    await queryRunner.dropTable('objective_sessions');
    await queryRunner.dropTable('objectives');
  }
}
