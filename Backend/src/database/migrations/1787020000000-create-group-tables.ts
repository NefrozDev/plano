import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateGroupTables1787020000000 implements MigrationInterface {
  readonly name = 'CreateGroupTables1787020000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'groups',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar', length: '80' },
          { name: 'inviteCode', type: 'varchar', length: '8' },
          { name: 'createdByUserId', type: 'varchar', length: '36' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'groups',
      new TableIndex({
        name: 'UQ_groups_invite_code',
        columnNames: ['inviteCode'],
        isUnique: true,
      }),
    );
    await queryRunner.createForeignKey(
      'groups',
      new TableForeignKey({
        name: 'FK_groups_creator',
        columnNames: ['createdByUserId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'group_memberships',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'groupId', type: 'varchar', length: '36' },
          { name: 'role', type: 'varchar', length: '16' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'group_memberships',
      new TableIndex({
        name: 'UQ_group_memberships_user',
        columnNames: ['userId'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'group_memberships',
      new TableIndex({
        name: 'IDX_group_memberships_group',
        columnNames: ['groupId'],
      }),
    );
    await queryRunner.createForeignKeys('group_memberships', [
      new TableForeignKey({
        name: 'FK_group_memberships_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_group_memberships_group',
        columnNames: ['groupId'],
        referencedTableName: 'groups',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('group_memberships');
    await queryRunner.dropTable('groups');
  }
}
