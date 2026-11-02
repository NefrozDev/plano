import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateNotifications1787980000000 implements MigrationInterface {
  readonly name = 'CreateNotifications1787980000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'area', type: 'varchar', length: '16' },
          { name: 'kind', type: 'varchar', length: '32' },
          { name: 'targetId', type: 'varchar', length: '36' },
          { name: 'title', type: 'varchar', length: '120', default: "''" },
          { name: 'actorId', type: 'varchar', length: '36', isNullable: true },
          { name: 'count', type: 'integer', default: 1 },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz' },
          { name: 'readAt', type: 'timestamptz', isNullable: true },
        ],
      }),
    );
    await queryRunner.createIndices('notifications', [
      new TableIndex({
        name: 'IDX_notifications_user_updated',
        columnNames: ['userId', 'updatedAt'],
      }),
      new TableIndex({
        name: 'IDX_notifications_user_target',
        columnNames: ['userId', 'targetId'],
      }),
    ]);
    await queryRunner.createForeignKeys('notifications', [
      new TableForeignKey({
        name: 'FK_notifications_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_notifications_actor',
        columnNames: ['actorId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications');
  }
}
