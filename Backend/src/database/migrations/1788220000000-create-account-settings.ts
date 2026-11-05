import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumnOptions,
  TableForeignKeyOptions,
} from 'typeorm';

const USER_ID: TableColumnOptions = {
  name: 'userId',
  type: 'varchar',
  length: '36',
  isPrimary: true,
};

const toUser = (table: string): TableForeignKeyOptions => ({
  name: `FK_${table}_user`,
  columnNames: ['userId'],
  referencedTableName: 'users',
  referencedColumnNames: ['id'],
  onDelete: 'CASCADE',
});

/**
 * The agenda and objectives settings move from the browser to the account, so
 * they follow it on every device. The defaults are the ones new accounts had.
 */
export class CreateAccountSettings1788220000000 implements MigrationInterface {
  readonly name = 'CreateAccountSettings1788220000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'agenda_settings',
        columns: [
          USER_ID,
          { name: 'weekStartsOn', type: 'smallint', default: 1 },
          { name: 'defaultDurationMinutes', type: 'integer', default: 60 },
          {
            name: 'timeZone',
            type: 'varchar',
            length: '64',
            default: "'Europe/Brussels'",
          },
          {
            name: 'defaultReminderMinutes',
            type: 'integer',
            isNullable: true,
            default: 15,
          },
          { name: 'eventNotifications', type: 'boolean', default: true },
          { name: 'invitationNotifications', type: 'boolean', default: true },
          { name: 'showWeekNumbers', type: 'boolean', default: false },
          {
            name: 'hourFormat',
            type: 'varchar',
            length: '3',
            default: "'24h'",
          },
          { name: 'hiddenCalendarIds', type: 'jsonb', default: "'[]'" },
          { name: 'showEvents', type: 'boolean', default: true },
          { name: 'showTasks', type: 'boolean', default: true },
          { name: 'showPastEvents', type: 'boolean', default: true },
          { name: 'calendarColors', type: 'jsonb', default: "'{}'" },
          { name: 'recentIds', type: 'jsonb', default: "'[]'" },
        ],
        foreignKeys: [toUser('agenda_settings')],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'objective_settings',
        columns: [
          USER_ID,
          {
            name: 'defaultView',
            type: 'varchar',
            length: '4',
            default: "'list'",
          },
          { name: 'showArchived', type: 'boolean', default: false },
          {
            name: 'defaultDueReminder',
            type: 'varchar',
            length: '11',
            default: "'day-before'",
          },
          { name: 'notifications', type: 'boolean', default: true },
          {
            name: 'habitReminders',
            type: 'varchar',
            length: '9',
            default: "'scheduled'",
          },
          { name: 'showPercentage', type: 'boolean', default: true },
          { name: 'categoryColors', type: 'boolean', default: true },
          { name: 'recentIds', type: 'jsonb', default: "'[]'" },
        ],
        foreignKeys: [toUser('objective_settings')],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('objective_settings');
    await queryRunner.dropTable('agenda_settings');
  }
}
