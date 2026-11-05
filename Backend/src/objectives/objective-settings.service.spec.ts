import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import {
  createListsTestBed,
  type ListsTestBed,
} from '../lists/testing/lists-test-bed';
import { UpdateObjectiveSettingsDto } from './dto/objective-settings.dto';
import { ObjectiveSettings } from './entities/objective-settings.entity';
import { ObjectiveSettingsService } from './objective-settings.service';

const DEFAULTS = {
  defaultView: 'list',
  showArchived: false,
  defaultDueReminder: 'day-before',
  notifications: true,
  habitReminders: 'scheduled',
  showPercentage: true,
  categoryColors: true,
  recentIds: [],
};
const OBJECTIVE_ID = '9f1d2c3b-4a5e-4f60-8b7c-6d5e4f3a2b1c';

const dto = (body: object): UpdateObjectiveSettingsDto =>
  plainToInstance(UpdateObjectiveSettingsDto, body);
const invalidFields = async (body: object): Promise<string[]> =>
  (await validate(dto(body))).map(({ property }) => property);

describe('ObjectiveSettingsService', () => {
  let bed: ListsTestBed;
  let settings: ObjectiveSettingsService;

  beforeEach(async () => {
    bed = await createListsTestBed();
    settings = new ObjectiveSettingsService(
      bed.dataSource,
      new DatabaseWriteLockService(),
    );
  });

  afterEach(() => bed.destroy());

  it('starts from the defaults new accounts always had, in a single row', async () => {
    expect(await settings.find(bed.ada)).toEqual(DEFAULTS);
    expect(await settings.find(bed.ada)).toEqual(DEFAULTS);

    expect(await bed.dataSource.manager.count(ObjectiveSettings)).toBe(1);
  });

  it('changes only what was sent, for that user only', async () => {
    const changed = await settings.update(
      bed.ada,
      dto({ defaultView: 'grid', recentIds: [OBJECTIVE_ID] }),
    );
    await settings.update(bed.ada, dto({ showPercentage: false }));

    const expected = {
      ...DEFAULTS,
      defaultView: 'grid',
      recentIds: [OBJECTIVE_ID],
    };
    expect(changed).toEqual(expected);
    expect(await settings.find(bed.ada)).toEqual({
      ...expected,
      showPercentage: false,
    });
    expect(await settings.find(bed.bob)).toEqual(DEFAULTS);
  });

  it('accepts every due reminder and refuses anything else', async () => {
    for (const defaultDueReminder of [
      'none',
      'same-day',
      'day-before',
      'week-before',
    ]) {
      await expect(invalidFields({ defaultDueReminder })).resolves.toEqual([]);
    }
    await expect(
      invalidFields({
        defaultView: 'cards',
        defaultDueReminder: 'month-before',
        habitReminders: 'always',
        notifications: 'yes',
        recentIds: ['not-an-id'],
      }),
    ).resolves.toEqual([
      'defaultView',
      'defaultDueReminder',
      'notifications',
      'habitReminders',
      'recentIds',
    ]);
  });
});
