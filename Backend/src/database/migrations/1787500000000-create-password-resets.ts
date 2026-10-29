import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreatePasswordResets1787500000000 implements MigrationInterface {
  readonly name = 'CreatePasswordResets1787500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'password_resets',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'tokenHash', type: 'varchar', length: '64' },
          { name: 'expiresAt', type: 'timestamptz' },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndices('password_resets', [
      new TableIndex({
        name: 'UQ_password_resets_token_hash',
        columnNames: ['tokenHash'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_password_resets_user',
        columnNames: ['userId'],
      }),
    ]);
    await queryRunner.createForeignKey(
      'password_resets',
      new TableForeignKey({
        name: 'FK_password_resets_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('password_resets');
  }
}
