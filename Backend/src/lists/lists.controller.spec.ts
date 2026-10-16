import { ListsController } from './lists.controller';
import type { ListContentService } from './list-content.service';
import type { ListsService } from './lists.service';

describe('ListsController', () => {
  const lists = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    removeMember: jest.fn().mockResolvedValue(undefined),
  };
  const content = {
    addEntry: jest.fn().mockResolvedValue({}),
    reorderEntries: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new ListsController(
    lists as unknown as ListsService,
    content as unknown as ListContentService,
  );

  it('passes the current user and route ids to the services', async () => {
    await controller.findAll('user-1');
    await controller.findOne('user-1', 'list-1');
    await controller.update('user-1', 'list-1', { name: 'Courses' });
    await controller.addEntry('user-1', 'list-1', 'section-1', {
      name: 'Lait',
    });
    await controller.reorderEntries('user-1', 'list-1', 'section-1', {
      entryIds: [],
    });
    await controller.removeMember('user-1', 'list-1', 'user-2');

    expect(lists.findAll).toHaveBeenCalledWith('user-1');
    expect(lists.findOne).toHaveBeenCalledWith('list-1', 'user-1');
    expect(lists.update).toHaveBeenCalledWith('list-1', 'user-1', {
      name: 'Courses',
    });
    expect(content.addEntry).toHaveBeenCalledWith(
      'list-1',
      'section-1',
      'user-1',
      { name: 'Lait' },
    );
    expect(content.reorderEntries).toHaveBeenCalledWith(
      'list-1',
      'section-1',
      'user-1',
      { entryIds: [] },
    );
    expect(lists.removeMember).toHaveBeenCalledWith(
      'list-1',
      'user-2',
      'user-1',
    );
  });
});
