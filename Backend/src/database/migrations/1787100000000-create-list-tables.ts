import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

const id = { name: 'id', type: 'varchar', length: '36', isPrimary: true };
const createdAt = {
  name: 'createdAt',
  type: 'datetime',
  default: 'CURRENT_TIMESTAMP',
};

function references(
  name: string,
  column: string,
  table: string,
  onDelete: 'CASCADE' | 'SET NULL' = 'CASCADE',
): TableForeignKey {
  return new TableForeignKey({
    name,
    columnNames: [column],
    referencedTableName: table,
    referencedColumnNames: ['id'],
    onDelete,
  });
}

export class CreateListTables1787100000000 implements MigrationInterface {
  readonly name = 'CreateListTables1787100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'lists',
        columns: [
          id,
          { name: 'ownerId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '80' },
          { name: 'icon', type: 'varchar', length: '16' },
          { name: 'color', type: 'varchar', length: '7' },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            default: "''",
          },
          { name: 'archived', type: 'boolean', default: 0 },
          createdAt,
        ],
        indices: [{ name: 'IDX_lists_owner', columnNames: ['ownerId'] }],
        foreignKeys: [references('FK_lists_owner', 'ownerId', 'users')],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'list_members',
        columns: [
          id,
          { name: 'listId', type: 'varchar', length: '36' },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'role', type: 'varchar', length: '16' },
          createdAt,
        ],
        indices: [
          new TableIndex({
            name: 'UQ_list_members_list_user',
            columnNames: ['listId', 'userId'],
            isUnique: true,
          }),
          new TableIndex({
            name: 'IDX_list_members_user',
            columnNames: ['userId'],
          }),
        ],
        foreignKeys: [
          references('FK_list_members_list', 'listId', 'lists'),
          references('FK_list_members_user', 'userId', 'users'),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'list_sections',
        columns: [
          id,
          { name: 'listId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '80' },
          { name: 'color', type: 'varchar', length: '7' },
          { name: 'position', type: 'integer' },
        ],
        indices: [{ name: 'IDX_list_sections_list', columnNames: ['listId'] }],
        foreignKeys: [references('FK_list_sections_list', 'listId', 'lists')],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'list_entries',
        columns: [
          id,
          { name: 'listId', type: 'varchar', length: '36' },
          { name: 'sectionId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '200' },
          { name: 'done', type: 'boolean', default: 0 },
          { name: 'highlighted', type: 'boolean', default: 0 },
          {
            name: 'addedByUserId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'assignedToUserId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          { name: 'reminder', type: 'varchar', length: '16', isNullable: true },
          { name: 'notes', type: 'varchar', length: '2000', default: "''" },
          { name: 'position', type: 'integer' },
          createdAt,
        ],
        indices: [
          { name: 'IDX_list_entries_section', columnNames: ['sectionId'] },
          { name: 'IDX_list_entries_list', columnNames: ['listId'] },
        ],
        foreignKeys: [
          references('FK_list_entries_list', 'listId', 'lists'),
          references('FK_list_entries_section', 'sectionId', 'list_sections'),
          references(
            'FK_list_entries_added_by',
            'addedByUserId',
            'users',
            'SET NULL',
          ),
          references(
            'FK_list_entries_assigned_to',
            'assignedToUserId',
            'users',
            'SET NULL',
          ),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'list_settings',
        columns: [
          { name: 'userId', type: 'varchar', length: '36', isPrimary: true },
          {
            name: 'defaultView',
            type: 'varchar',
            length: '8',
            default: "'list'",
          },
          { name: 'showCounts', type: 'boolean', default: 1 },
          { name: 'showCompleted', type: 'boolean', default: 1 },
          { name: 'completedLast', type: 'boolean', default: 1 },
          {
            name: 'defaultReminder',
            type: 'varchar',
            length: '5',
            default: "'09:00'",
          },
          {
            name: 'notifyScope',
            type: 'varchar',
            length: '8',
            default: "'mine'",
          },
          { name: 'archiveCompleted', type: 'boolean', default: 0 },
          { name: 'confirmDelete', type: 'boolean', default: 1 },
        ],
        foreignKeys: [references('FK_list_settings_user', 'userId', 'users')],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('list_settings');
    await queryRunner.dropTable('list_entries');
    await queryRunner.dropTable('list_sections');
    await queryRunner.dropTable('list_members');
    await queryRunner.dropTable('lists');
  }
}
