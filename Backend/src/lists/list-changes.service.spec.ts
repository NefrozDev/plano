import type { MockInstance } from 'vitest';
import type { ListDetail } from '@plano/common';
import type { DataSource } from 'typeorm';
import { LiveEventsService } from '../live/live-events.service';
import { ListChangesService } from './list-changes.service';
import {
  createListsTestBed,
  type ListsTestBed,
} from './testing/lists-test-bed';

/** Which live events each list change publishes, and to whom. */
describe('List live events', () => {
  let bed: ListsTestBed;
  let list: ListDetail;
  let publish: MockInstance<LiveEventsService['publish']>;

  /** Recipients and event of every publish, recipients sorted. */
  const published = () =>
    publish.mock.calls.map(([userIds, event]) => ({
      to: [...userIds].sort(),
      event,
    }));

  beforeEach(async () => {
    bed = await createListsTestBed();
    list = await bed.lists.create(bed.ada, {
      name: 'Courses',
      icon: 'cart',
      color: '#2ecb70',
    });
    await bed.lists.addMember(list.id, bed.ada, {
      userId: bed.bob,
      role: 'editor',
    });
    publish = vi.spyOn(bed.live, 'publish');
  });

  afterEach(() => bed.destroy());

  it('tells the owner and every member about a content change, once it is saved', async () => {
    const section = await bed.content.addSection(list.id, bed.bob, {
      name: 'Frais',
      color: '#23c666',
    });
    await bed.content.addEntry(list.id, section.id, bed.bob, { name: 'Lait' });

    expect(published()).toEqual([
      {
        to: [bed.ada, bed.bob].sort(),
        event: { type: 'list.changed', listId: list.id },
      },
      {
        to: [bed.ada, bed.bob].sort(),
        event: { type: 'list.changed', listId: list.id },
      },
    ]);
  });

  it('publishes nothing when the change is refused', async () => {
    await expect(
      bed.content.addSection(list.id, bed.cyd, {
        name: 'Frais',
        color: '#23c666',
      }),
    ).rejects.toThrow();

    expect(publish).not.toHaveBeenCalled();
  });

  it('tells a removed member they lost the list, and the others that it changed', async () => {
    await bed.lists.removeMember(list.id, bed.bob, bed.ada);

    expect(published()).toEqual([
      { to: [bed.bob], event: { type: 'list.removed', listId: list.id } },
      { to: [bed.ada], event: { type: 'list.changed', listId: list.id } },
    ]);
  });

  it('tells former members when sharing stops', async () => {
    await bed.lists.removeAllMembers(list.id, bed.ada);

    expect(published()).toEqual([
      { to: [bed.bob], event: { type: 'list.removed', listId: list.id } },
      { to: [bed.ada], event: { type: 'list.changed', listId: list.id } },
    ]);
  });

  it('tells everyone who had the list when it is deleted', async () => {
    await bed.lists.remove(list.id, bed.ada);

    expect(published()).toEqual([
      {
        to: [bed.ada, bed.bob].sort(),
        event: { type: 'list.removed', listId: list.id },
      },
    ]);
  });

  it('never fails a saved change when the audience cannot be read', async () => {
    const live = new LiveEventsService();
    const failing = {
      manager: { findOne: vi.fn().mockRejectedValue(new Error('down')) },
    } as unknown as DataSource;
    const spy = vi.spyOn(live, 'publish');

    await expect(
      new ListChangesService(failing, live).changed('list-1'),
    ).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    live.onApplicationShutdown();
  });
});
