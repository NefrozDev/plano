import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Plano signs people in through the Synapse identity service, which now owns
 * passwords, recovery and the uniqueness of usernames and e-mail addresses.
 * Run only after Plano's accounts were imported there (synapse-auth's
 * deploy/import-plano-accounts.sh): this drops the password hashes.
 */
export class SignInWithSynapse1788300000000 implements MigrationInterface {
  readonly name = 'SignInWithSynapse1788300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'sessions',
      new TableColumn({
        name: 'oidcSid',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_sessions_oidc_sid',
        columnNames: ['oidcSid'],
      }),
    );

    await queryRunner.dropTable('password_resets');
    await queryRunner.dropColumn('users', 'passwordHash');
    // Someone coming from another Synapse app has not accepted Plano's terms yet.
    // Plain SQL: changeColumn read the type as "timestamp with time zone", saw
    // a change from "timestamptz", and recreated the column, losing every date.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "termsAcceptedAt" DROP NOT NULL`,
    );

    // A copy may lag behind a rename at the identity service: no longer unique here.
    await queryRunner.dropIndex('users', 'UQ_users_normalized_username');
    await queryRunner.dropIndex('users', 'UQ_users_normalized_email');
    await queryRunner.createIndices('users', [
      new TableIndex({
        name: 'IDX_users_normalized_username',
        columnNames: ['normalizedUsername'],
      }),
      new TableIndex({
        name: 'IDX_users_normalized_email',
        columnNames: ['normalizedEmail'],
      }),
    ]);
  }

  /** The structure only: the password hashes are gone for good. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_users_normalized_email');
    await queryRunner.dropIndex('users', 'IDX_users_normalized_username');
    await queryRunner.createIndices('users', [
      new TableIndex({
        name: 'UQ_users_normalized_username',
        columnNames: ['normalizedUsername'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'UQ_users_normalized_email',
        columnNames: ['normalizedEmail'],
        isUnique: true,
      }),
    ]);

    await queryRunner.query(
      `UPDATE "users" SET "termsAcceptedAt" = now() WHERE "termsAcceptedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "termsAcceptedAt" SET NOT NULL`,
    );
    await queryRunner.addColumn(
      'users',
      new TableColumn({ name: 'passwordHash', type: 'text', default: "''" }),
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP DEFAULT`,
    );

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

    await queryRunner.dropIndex('sessions', 'IDX_sessions_oidc_sid');
    await queryRunner.dropColumn('sessions', 'oidcSid');
  }
}
