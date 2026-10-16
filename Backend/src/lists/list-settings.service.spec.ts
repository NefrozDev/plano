import {
  createListsTestBed,
  type ListsTestBed,
} from './testing/lists-test-bed';

describe('ListSettingsService', () => {
  let bed: ListsTestBed;

  beforeEach(async () => {
    bed = await createListsTestBed();
  });

  afterEach(() => bed.destroy());

  it('starts from the defaults and keeps each user’s changes apart', async () => {
    const defaults = {
      defaultView: 'list',
      showCounts: true,
      showCompleted: true,
      completedLast: true,
      defaultReminder: '09:00',
      notifyScope: 'mine',
      archiveCompleted: false,
      confirmDelete: true,
    };
    expect(await bed.settings.find(bed.ada)).toEqual(defaults);

    await bed.settings.update(bed.ada, {
      defaultView: 'grid',
      confirmDelete: false,
    });

    expect(await bed.settings.find(bed.ada)).toEqual({
      ...defaults,
      defaultView: 'grid',
      confirmDelete: false,
    });
    expect(await bed.settings.find(bed.bob)).toEqual(defaults);
  });
});
