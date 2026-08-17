import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAuthTables1786940000000 implements MigrationInterface {
  readonly name = 'CreateAuthTables1786940000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'firstName', type: 'varchar', length: '80' },
          { name: 'lastName', type: 'varchar', length: '80' },
          { name: 'username', type: 'varchar', length: '30' },
          { name: 'normalizedUsername', type: 'varchar', length: '30' },
          { name: 'email', type: 'varchar', length: '254' },
          { name: 'normalizedEmail', type: 'varchar', length: '254' },
          { name: 'passwordHash', type: 'text' },
          { name: 'termsAcceptedAt', type: 'datetime' },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'UQ_users_normalized_username',
        columnNames: ['normalizedUsername'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'UQ_users_normalized_email',
        columnNames: ['normalizedEmail'],
        isUnique: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'tokenHash', type: 'varchar', length: '64' },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'expiresAt', type: 'datetime' },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'UQ_sessions_token_hash',
        columnNames: ['tokenHash'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_sessions_expires_at',
        columnNames: ['expiresAt'],
      }),
    );
    await queryRunner.createForeignKey(
      'sessions',
      new TableForeignKey({
        name: 'FK_sessions_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sessions');
    await queryRunner.dropTable('users');
  }
}
