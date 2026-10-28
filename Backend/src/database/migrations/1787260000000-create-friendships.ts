import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateFriendships1787260000000 implements MigrationInterface {
  readonly name = 'CreateFriendships1787260000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'friendships',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'requesterId', type: 'varchar', length: '36' },
          { name: 'addresseeId', type: 'varchar', length: '36' },
          { name: 'status', type: 'varchar', length: '16' },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'acceptedAt', type: 'timestamptz', isNullable: true },
        ],
        checks: [
          new TableCheck({
            name: 'CHK_friendships_not_self',
            expression: '"requesterId" <> "addresseeId"',
          }),
        ],
      }),
    );
    await queryRunner.createIndices('friendships', [
      new TableIndex({
        name: 'IDX_friendships_requester',
        columnNames: ['requesterId'],
      }),
      new TableIndex({
        name: 'IDX_friendships_addressee',
        columnNames: ['addresseeId'],
      }),
    ]);
    // One row per pair in either direction, so two crossed requests cannot coexist.
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_friendships_pair" ON "friendships" (LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId"))',
    );
    await queryRunner.createForeignKeys('friendships', [
      new TableForeignKey({
        name: 'FK_friendships_requester',
        columnNames: ['requesterId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_friendships_addressee',
        columnNames: ['addresseeId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('friendships');
  }
}
