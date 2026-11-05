import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import {
  createListsTestBed,
  type ListsTestBed,
} from '../lists/testing/lists-test-bed';
import { AgendaSettingsService } from './agenda-settings.service';
import { UpdateAgendaSettingsDto } from './dto/agenda-settings.dto';
import { AgendaSettings } from './entities/agenda-settings.entity';

const DEFAULTS = {
  weekStartsOn: 1,
  defaultDurationMinutes: 60,
  timeZone: 'Europe/Brussels',
  defaultReminderMinutes: 15,
  eventNotifications: true,
  invitationNotifications: true,
  showWeekNumbers: false,
  hourFormat: '24h',
  hiddenCalendarIds: [],
  showEvents: true,
  showTasks: true,
  showPastEvents: true,
  calendarColors: {},
  recentIds: [],
};
const EVENT_ID = '4b0c7e8e-2a8c-4f43-9a3e-0d1c3f6a2b10';

/** The DTO as the global ValidationPipe builds it from a request body. */
const dto = (body: object): UpdateAgendaSettingsDto =>
  plainToInstance(UpdateAgendaSettingsDto, body);
const invalidFields = async (body: object): Promise<string[]> =>
  (await validate(dto(body), { forbidNonWhitelisted: true })).map(
    ({ property }) => property,
  );

describe('AgendaSettingsService', () => {
  let bed: ListsTestBed;
  let settings: AgendaSettingsService;

  beforeEach(async () => {
    bed = await createListsTestBed();
    settings = new AgendaSettingsService(
      bed.dataSource,
      new DatabaseWriteLockService(),
    );
  });

  afterEach(() => bed.destroy());

  it('starts from the defaults new accounts always had, in a single row', async () => {
    expect(await settings.find(bed.ada)).toEqual(DEFAULTS);
    expect(await settings.find(bed.ada)).toEqual(DEFAULTS);

    expect(await bed.dataSource.manager.count(AgendaSettings)).toBe(1);
  });

  it('changes only what was sent, for that user only', async () => {
    const changed = await settings.update(
      bed.ada,
      dto({
        hourFormat: '12h',
        hiddenCalendarIds: ['travail'],
        calendarColors: { personnel: '#22a95a' },
        recentIds: [EVENT_ID],
      }),
    );

    const expected = {
      ...DEFAULTS,
      hourFormat: '12h',
      hiddenCalendarIds: ['travail'],
      calendarColors: { personnel: '#22a95a' },
      recentIds: [EVENT_ID],
    };
    expect(changed).toEqual(expected);
    expect(await settings.find(bed.ada)).toEqual(expected);
    expect(await settings.find(bed.bob)).toEqual(DEFAULTS);
  });

  it('clears the default reminder with null, and keeps it when the field is absent', async () => {
    await settings.update(bed.ada, dto({ defaultReminderMinutes: null }));
    expect((await settings.find(bed.ada)).defaultReminderMinutes).toBeNull();

    await settings.update(bed.ada, dto({ showTasks: false }));
    expect(await settings.find(bed.ada)).toEqual({
      ...DEFAULTS,
      defaultReminderMinutes: null,
      showTasks: false,
    });
  });

  describe('validation', () => {
    it('accepts what the agenda screens send', async () => {
      await expect(
        invalidFields({
          weekStartsOn: 0,
          defaultDurationMinutes: 90,
          timeZone: 'America/Montreal',
          defaultReminderMinutes: null,
          hiddenCalendarIds: ['sport', 'anniversaires'],
          calendarColors: { travail: '#3264ed', sport: '#E65591' },
          recentIds: [EVENT_ID],
        }),
      ).resolves.toEqual([]);
    });

    it('refuses values the screens could not show', async () => {
      await expect(
        invalidFields({
          weekStartsOn: 3,
          defaultDurationMinutes: 0,
          timeZone: 'Mars/Olympus',
          defaultReminderMinutes: -5,
          hourFormat: '13h',
          showEvents: null,
        }),
      ).resolves.toEqual([
        'weekStartsOn',
        'defaultDurationMinutes',
        'timeZone',
        'defaultReminderMinutes',
        'hourFormat',
        'showEvents',
      ]);
    });

    it('keeps calendar colours to plain #rrggbb values on calendar ids', async () => {
      for (const calendarColors of [
        { personnel: 'red; background: url(https://evil.test)' },
        { Personnel: '#22a95a' },
        ['#22a95a'],
        Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [`c${index}`, '#22a95a']),
        ),
      ]) {
        await expect(invalidFields({ calendarColors })).resolves.toEqual([
          'calendarColors',
        ]);
      }
    });

    it('never lets a body change the prototype of the colours', () => {
      const body = JSON.parse(
        '{"calendarColors": {"__proto__": {"polluted": true}, "sport": "#e65591"}}',
      ) as object;
      const colors = dto(body).calendarColors ?? {};

      expect(Object.getPrototypeOf(colors)).toBe(Object.prototype);
      expect(Object.keys(colors)).toEqual(['sport']);
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('refuses duplicate or malformed ids, and too many', async () => {
      for (const body of [
        { hiddenCalendarIds: ['travail', 'travail'] },
        { hiddenCalendarIds: ['<script>'] },
        { recentIds: ['not-an-id'] },
        { recentIds: [EVENT_ID, EVENT_ID] },
        {
          recentIds: Array.from(
            { length: 11 },
            (_, index) =>
              `4b0c7e8e-2a8c-4f43-9a3e-0d1c3f6a2b${String(index).padStart(2, '0')}`,
          ),
        },
      ]) {
        await expect(invalidFields(body)).resolves.toHaveLength(1);
      }
    });
  });
});
