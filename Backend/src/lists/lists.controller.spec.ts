import type { Mock } from 'vitest';
import { ListSettingsController } from './list-settings.controller';
import type { ListSettingsService } from './list-settings.service';
import { ListsController } from './lists.controller';
import type { ListContentService } from './list-content.service';
import type { ListsService } from './lists.service';

/**
 * Controllers only route: every handler must forward the caller, the route
 * ids and the body to the right service method, in the right order, and hand
 * back its result untouched. Distinct values per argument catch swapped ids.
 */
describe('ListsController', () => {
  const USER = 'user-1';
  const LIST = 'list-1';
  const SECTION = 'section-1';
  const ENTRY = 'entry-1';
  const MEMBER = 'user-2';

  let lists: Record<string, Mock>;
  let content: Record<string, Mock>;
  let controller: ListsController;

  beforeEach(() => {
    const service = (names: string[]) =>
      Object.fromEntries(
        names.map((name) => [name, vi.fn().mockResolvedValue({ from: name })]),
      );
    lists = service([
      'findAll',
      'findReminders',
      'create',
      'findOne',
      'update',
      'remove',
      'addMember',
      'removeAllMembers',
      'updateMember',
      'removeMember',
    ]);
    content = service([
      'addSection',
      'addEntry',
      'reorderEntries',
      'updateEntry',
      'removeEntry',
    ]);
    controller = new ListsController(
      lists as unknown as ListsService,
      content as unknown as ListContentService,
    );
  });

  const cases: {
    handler: string;
    call: (c: ListsController) => Promise<unknown>;
    service: 'lists' | 'content';
    method: string;
    args: unknown[];
  }[] = [
    {
      handler: 'findAll',
      call: (c) => c.findAll(USER),
      service: 'lists',
      method: 'findAll',
      args: [USER],
    },
    {
      handler: 'findReminders',
      call: (c) => c.findReminders(USER),
      service: 'lists',
      method: 'findReminders',
      args: [USER],
    },
    {
      handler: 'create',
      call: (c) =>
        c.create(USER, { name: 'Courses', icon: 'cart', color: '#2ecb70' }),
      service: 'lists',
      method: 'create',
      args: [USER, { name: 'Courses', icon: 'cart', color: '#2ecb70' }],
    },
    {
      handler: 'findOne',
      call: (c) => c.findOne(USER, LIST),
      service: 'lists',
      method: 'findOne',
      args: [LIST, USER],
    },
    {
      handler: 'update',
      call: (c) => c.update(USER, LIST, { name: 'Maison' }),
      service: 'lists',
      method: 'update',
      args: [LIST, USER, { name: 'Maison' }],
    },
    {
      handler: 'remove',
      call: (c) => c.remove(USER, LIST),
      service: 'lists',
      method: 'remove',
      args: [LIST, USER],
    },
    {
      handler: 'addSection',
      call: (c) =>
        c.addSection(USER, LIST, { name: 'Frais', color: '#3264ed' }),
      service: 'content',
      method: 'addSection',
      args: [LIST, USER, { name: 'Frais', color: '#3264ed' }],
    },
    {
      handler: 'addEntry',
      call: (c) => c.addEntry(USER, LIST, SECTION, { name: 'Lait' }),
      service: 'content',
      method: 'addEntry',
      args: [LIST, SECTION, USER, { name: 'Lait' }],
    },
    {
      handler: 'reorderEntries',
      call: (c) => c.reorderEntries(USER, LIST, SECTION, { entryIds: [ENTRY] }),
      service: 'content',
      method: 'reorderEntries',
      args: [LIST, SECTION, USER, { entryIds: [ENTRY] }],
    },
    {
      handler: 'updateEntry',
      call: (c) => c.updateEntry(USER, LIST, ENTRY, { done: true }),
      service: 'content',
      method: 'updateEntry',
      args: [LIST, ENTRY, USER, { done: true }],
    },
    {
      handler: 'removeEntry',
      call: (c) => c.removeEntry(USER, LIST, ENTRY),
      service: 'content',
      method: 'removeEntry',
      args: [LIST, ENTRY, USER],
    },
    {
      handler: 'addMember',
      call: (c) => c.addMember(USER, LIST, { userId: MEMBER, role: 'editor' }),
      service: 'lists',
      method: 'addMember',
      args: [LIST, USER, { userId: MEMBER, role: 'editor' }],
    },
    {
      handler: 'removeAllMembers',
      call: (c) => c.removeAllMembers(USER, LIST),
      service: 'lists',
      method: 'removeAllMembers',
      args: [LIST, USER],
    },
    {
      handler: 'updateMember',
      call: (c) => c.updateMember(USER, LIST, MEMBER, { role: 'viewer' }),
      service: 'lists',
      method: 'updateMember',
      args: [LIST, MEMBER, USER, { role: 'viewer' }],
    },
    {
      handler: 'removeMember',
      call: (c) => c.removeMember(USER, LIST, MEMBER),
      service: 'lists',
      method: 'removeMember',
      args: [LIST, MEMBER, USER],
    },
  ];

  it.each(cases)(
    '$handler forwards to the $service service ($method) with the ids in order',
    async ({ call, service, method, args }) => {
      const target = service === 'lists' ? lists : content;

      await expect(call(controller)).resolves.toEqual({ from: method });

      expect(target[method]).toHaveBeenCalledTimes(1);
      expect(target[method]).toHaveBeenCalledWith(...args);
      // No other service method is touched.
      const others = [
        ...Object.entries(lists),
        ...Object.entries(content),
      ].filter(([name, mock]) => mock !== target[method] && name !== method);
      for (const [, mock] of others) expect(mock).not.toHaveBeenCalled();
    },
  );

  it('covers every route handler of the controller', () => {
    const handlers = Object.getOwnPropertyNames(
      ListsController.prototype,
    ).filter((name) => name !== 'constructor');
    expect(handlers.sort()).toEqual(cases.map(({ handler }) => handler).sort());
  });
});

describe('ListSettingsController', () => {
  it('reads and updates the settings of the current user only', async () => {
    const settings = {
      find: vi.fn().mockResolvedValue({ defaultView: 'list' }),
      update: vi.fn().mockResolvedValue({ defaultView: 'grid' }),
    };
    const controller = new ListSettingsController(
      settings as unknown as ListSettingsService,
    );

    await expect(controller.find('user-1')).resolves.toEqual({
      defaultView: 'list',
    });
    expect(settings.find).toHaveBeenCalledTimes(1);
    expect(settings.find).toHaveBeenCalledWith('user-1');
    expect(settings.update).not.toHaveBeenCalled();

    await expect(
      controller.update('user-1', { defaultView: 'grid' }),
    ).resolves.toEqual({ defaultView: 'grid' });
    expect(settings.update).toHaveBeenCalledTimes(1);
    expect(settings.update).toHaveBeenCalledWith('user-1', {
      defaultView: 'grid',
    });
  });
});
