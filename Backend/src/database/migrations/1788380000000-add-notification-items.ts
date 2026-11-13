import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Notifications point at what is new inside their list or objective. */
export class AddNotificationItems1788380000000 implements MigrationInterface {
  readonly name = 'AddNotificationItems1788380000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'notifications',
      new TableColumn({ name: 'itemIds', type: 'jsonb', default: "'[]'" }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('notifications', 'itemIds');
  }
}
