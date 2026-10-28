import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserLocaleAndAvatar1787340000000 implements MigrationInterface {
  readonly name = 'AddUserLocaleAndAvatar1787340000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'locale',
        type: 'varchar',
        length: '8',
        default: "'fr'",
      }),
      new TableColumn({ name: 'avatar', type: 'bytea', isNullable: true }),
      new TableColumn({
        name: 'avatarType',
        type: 'varchar',
        length: '16',
        isNullable: true,
      }),
      new TableColumn({
        name: 'avatarUpdatedAt',
        type: 'timestamptz',
        isNullable: true,
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('users', [
      'avatarUpdatedAt',
      'avatarType',
      'avatar',
      'locale',
    ]);
  }
}
