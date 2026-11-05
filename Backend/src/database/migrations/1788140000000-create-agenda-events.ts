import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/** Agenda events move from the browser to the API, so they can be shared. */
export class CreateAgendaEvents1788140000000 implements MigrationInterface {
  readonly name = 'CreateAgendaEvents1788140000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'agenda_events',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'ownerId', type: 'varchar', length: '36' },
          { name: 'title', type: 'varchar', length: '120' },
          { name: 'allDay', type: 'boolean', default: false },
          { name: 'start', type: 'varchar', length: '16' },
          { name: 'end', type: 'varchar', length: '16' },
          { name: 'location', type: 'varchar', length: '120', default: "''" },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            default: "''",
          },
          {
            name: 'recurrence',
            type: 'varchar',
            length: '8',
            default: "'none'",
          },
          { name: 'color', type: 'varchar', length: '7', isNullable: true },
          {
            name: 'conferenceUrl',
            type: 'varchar',
            length: '300',
            default: "''",
          },
          { name: 'attachments', type: 'jsonb', default: "'[]'" },
          { name: 'notes', type: 'varchar', length: '1000', default: "''" },
          {
            name: 'availability',
            type: 'varchar',
            length: '4',
            default: "'busy'",
          },
          {
            name: 'visibility',
            type: 'varchar',
            length: '8',
            default: "'default'",
          },
          { name: 'calendarId', type: 'varchar', length: '40' },
          { name: 'reminderMinutes', type: 'integer', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'agenda_events',
      new TableIndex({
        name: 'IDX_agenda_events_owner',
        columnNames: ['ownerId'],
      }),
    );
    await queryRunner.createForeignKey(
      'agenda_events',
      new TableForeignKey({
        name: 'FK_agenda_events_owner',
        columnNames: ['ownerId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'agenda_guests',
        columns: [
          { name: 'eventId', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36', isPrimary: true },
          {
            name: 'status',
            type: 'varchar',
            length: '8',
            default: "'pending'",
          },
          {
            name: 'calendarId',
            type: 'varchar',
            length: '40',
            isNullable: true,
          },
          { name: 'reminderMinutes', type: 'integer', isNullable: true },
          { name: 'invitedAt', type: 'timestamptz', default: 'now()' },
          { name: 'respondedAt', type: 'timestamptz', isNullable: true },
        ],
      }),
    );
    await queryRunner.createIndex(
      'agenda_guests',
      new TableIndex({
        name: 'IDX_agenda_guests_user',
        columnNames: ['userId'],
      }),
    );
    await queryRunner.createForeignKeys('agenda_guests', [
      new TableForeignKey({
        name: 'FK_agenda_guests_event',
        columnNames: ['eventId'],
        referencedTableName: 'agenda_events',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_agenda_guests_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('agenda_guests');
    await queryRunner.dropTable('agenda_events');
  }
}
