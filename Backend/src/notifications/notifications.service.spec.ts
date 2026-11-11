import { NotFoundException } from '@nestjs/common';
import type { NotificationEntry } from '@plano/common';
import { randomUUID } from 'node:crypto';
import type { MockInstance } from 'vitest';
import { LiveEventsService } from '../live/live-events.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from '../objectives/testing/objectives-test-bed';
import { Notification } from './notification.entity';
import {
  NOTIFICATION_PAGE,
  READ_RETENTION_DAYS,
} from './notifications.service';

/** Real services on a fresh database: what each change leaves in the bell, and for whom. */
describe('NotificationsService', () => {
  let bed: ObjectivesTestBed;
  let publish: MockInstance<LiveEventsService['publish']>;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
    publish = vi.spyOn(bed.live, 'publish');
  });

  afterEach(() => bed.destroy());

  const items = async (userId: string) =>
    (await bed.notifications.list(userId)).items;
  const brief = ({
    kind,
    targetId,
    title,
    actor,
    count,
    read,
  }: NotificationEntry) => ({
    kind,
    targetId,
    title,
    actor: actor?.name ?? null,
    count,
    read,
  });
  const bellEventsTo = (userId: string) =>
    publish.mock.calls.filter(
      ([userIds, event]) =>
        event.type === 'notifications.changed' && [...userIds].includes(userId),
    ).length;
  const news = (targetId: string = randomUUID()) => ({
    area: 'lists' as const,
    kind: 'list.entries' as const,
    targetId,
    title: 'Courses',
    actorId: bed.ada,
  });

  describe('storing', () => {
    it('keeps one per recipient, never for the one who acted, and tells their apps', async () => {
      await bed.notifications.notify(
        [bed.bob, bed.ada, bed.cyd, bed.bob],
        news('list-1'),
      );

      expect((await items(bed.bob)).map(brief)).toEqual([
        {
          kind: 'list.entries',
          targetId: 'list-1',
          title: 'Courses',
          actor: 'Ada Test',
          count: 1,
          read: false,
        },
      ]);
      expect(await items(bed.cyd)).toHaveLength(1);
      expect(await items(bed.ada)).toEqual([]);
      expect(publish).toHaveBeenCalledExactlyOnceWith(expect.any(Array), {
        type: 'notifications.changed',
      });
      expect([...publish.mock.calls[0][0]].sort()).toEqual(
        [bed.bob, bed.cyd].sort(),
      );
    });

    it('groups the same news on the same thing while unread, with the latest author', async () => {
      await bed.notifications.notify([bed.bob], news('list-1'));
      await bed.notifications.notify([bed.bob], {
        ...news('list-1'),
        actorId: bed.cyd,
        title: 'Courses du samedi',
      });

      expect((await items(bed.bob)).map(brief)).toEqual([
        {
          kind: 'list.entries',
          targetId: 'list-1',
          title: 'Courses du samedi',
          actor: 'Cyd Test',
          count: 2,
          read: false,
        },
      ]);
    });

    it('starts a new one once the previous was read', async () => {
      await bed.notifications.notify([bed.bob], news('list-1'));
      await bed.notifications.markRead(bed.bob, {
        area: 'lists',
        targetId: 'list-1',
      });
      await bed.notifications.notify([bed.bob], news('list-1'));

      expect(
        (await items(bed.bob)).map(({ read, count }) => ({ read, count })),
      ).toEqual([
        { read: false, count: 1 },
        { read: true, count: 1 },
      ]);
    });

    it('does nothing for nobody', async () => {
      await bed.notifications.notify([bed.ada], news());

      expect(publish).not.toHaveBeenCalled();
      expect(await bed.dataSource.manager.count(Notification)).toBe(0);
    });

    it('never fails the change it reports when it cannot be stored', async () => {
      await expect(
        bed.notifications.notify([randomUUID()], news()),
      ).resolves.toBeUndefined();
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('reading', () => {
    it('lists the latest first, with every unread one counted by area', async () => {
      for (let i = 0; i <= NOTIFICATION_PAGE; i++) {
        await bed.notifications.notify([bed.bob], news(`list-${i}`));
      }
      await bed.notifications.notify([bed.bob], {
        area: 'objectives',
        kind: 'objective.comment',
        targetId: 'objective-1',
        title: 'Courir',
        actorId: bed.ada,
      });

      const { items: page, unread } = await bed.notifications.list(bed.bob);

      expect(page).toHaveLength(NOTIFICATION_PAGE);
      expect(page[0].targetId).toBe('objective-1');
      expect(unread).toEqual({
        friends: 0,
        lists: NOTIFICATION_PAGE + 1,
        objectives: 1,
        agenda: 0,
      });
    });

    it('marks what is about one thing as read, or a whole area, and tells the user’s other devices', async () => {
      await bed.notifications.notify([bed.bob], news('list-1'));
      await bed.notifications.notify([bed.bob], news('list-2'));
      publish.mockClear();

      await bed.notifications.markRead(bed.bob, {
        area: 'lists',
        targetId: 'list-1',
      });

      expect((await bed.notifications.list(bed.bob)).unread.lists).toBe(1);
      expect(publish).toHaveBeenCalledExactlyOnceWith([bed.bob], {
        type: 'notifications.changed',
      });

      await bed.notifications.markRead(bed.bob, { area: 'lists' });
      await bed.notifications.markRead(bed.bob, { area: 'lists' });

      expect((await bed.notifications.list(bed.bob)).unread.lists).toBe(0);
      // Nothing left to mark: no event.
      expect(publish).toHaveBeenCalledTimes(2);
    });

    describe('once the bell is closed', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-11T09:00:00Z'));
      });
      afterEach(() => vi.useRealTimers());

      const unreadOf = async (userId: string) =>
        (await bed.notifications.list(userId)).unread;

      it('reads what it showed in its areas, not what came in after, and tells the user’s other devices', async () => {
        // Each at its own time: the bell sorts by date, then by (random) id.
        await bed.notifications.notify([bed.bob, bed.cyd], news('list-1'));
        vi.setSystemTime(new Date('2026-11-11T09:00:10Z'));
        await bed.notifications.notify([bed.bob], {
          area: 'objectives',
          kind: 'objective.comment',
          targetId: 'objective-1',
          title: 'Courir',
          actorId: bed.ada,
        });
        vi.setSystemTime(new Date('2026-11-11T09:00:20Z'));
        await bed.notifications.notify([bed.bob], news('list-2'));
        const until = (await items(bed.bob))[0].updatedAt;
        // While the bell was open: list-2 got news again, list-3 is new.
        vi.setSystemTime(new Date('2026-11-11T09:01:00Z'));
        await bed.notifications.notify([bed.bob], news('list-2'));
        vi.setSystemTime(new Date('2026-11-11T09:02:00Z'));
        await bed.notifications.notify([bed.bob], news('list-3'));
        publish.mockClear();

        await bed.notifications.markAllRead(bed.bob, {
          areas: ['lists'],
          until,
        });

        expect(
          (await items(bed.bob)).map(({ targetId, read }) => [targetId, read]),
        ).toEqual([
          ['list-3', false],
          ['list-2', false],
          ['objective-1', false],
          ['list-1', true],
        ]);
        expect(await unreadOf(bed.bob)).toMatchObject({
          lists: 2,
          objectives: 1,
        });
        // Another person's bell is theirs.
        expect((await unreadOf(bed.cyd)).lists).toBe(1);
        expect(publish).toHaveBeenCalledExactlyOnceWith([bed.bob], {
          type: 'notifications.changed',
        });
      });

      it('reads every unread one of those areas, past the page the bell shows', async () => {
        for (let i = 0; i <= NOTIFICATION_PAGE; i++) {
          await bed.notifications.notify([bed.bob], news(`list-${i}`));
        }
        const until = (await items(bed.bob))[0].updatedAt;

        await bed.notifications.markAllRead(bed.bob, {
          areas: ['lists', 'objectives'],
          until,
        });

        expect((await unreadOf(bed.bob)).lists).toBe(0);
      });

      it('tells nobody when nothing was left to read', async () => {
        await bed.notifications.notify([bed.bob], news('list-1'));
        const until = (await items(bed.bob))[0].updatedAt;
        await bed.notifications.markAllRead(bed.bob, {
          areas: ['lists'],
          until,
        });
        publish.mockClear();

        await bed.notifications.markAllRead(bed.bob, {
          areas: ['lists'],
          until,
        });

        expect(publish).not.toHaveBeenCalled();
      });
    });

    it('marks one as read, only for its owner', async () => {
      await bed.notifications.notify([bed.bob, bed.cyd], news('list-1'));
      const [mine] = await items(bed.bob);

      await expect(
        bed.notifications.markOneRead(bed.cyd, mine.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((await items(bed.bob))[0].read).toBe(false);

      await bed.notifications.markOneRead(bed.bob, mine.id);
      await bed.notifications.markOneRead(bed.bob, mine.id);

      expect((await items(bed.bob))[0].read).toBe(true);
      expect((await items(bed.cyd))[0].read).toBe(false);
      expect(bellEventsTo(bed.bob)).toBe(2);
    });

    it(`drops read notifications after ${READ_RETENTION_DAYS} days, never unread ones`, async () => {
      await bed.notifications.notify([bed.bob], news('old-read'));
      await bed.notifications.notify([bed.bob], news('old-unread'));
      const longAgo = new Date(
        Date.now() - (READ_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
      );
      await bed.dataSource.manager.update(
        Notification,
        { targetId: 'old-read' },
        { readAt: longAgo, updatedAt: longAgo },
      );
      await bed.dataSource.manager.update(
        Notification,
        { targetId: 'old-unread' },
        { updatedAt: longAgo },
      );

      expect((await items(bed.bob)).map(({ targetId }) => targetId)).toEqual([
        'old-unread',
      ]);
    });

    it('forgets what someone can no longer open', async () => {
      await bed.notifications.notify([bed.bob, bed.cyd], news('list-1'));
      await bed.notifications.notify([bed.bob], news('list-2'));

      await bed.notifications.forget([bed.bob], ['list-1']);

      expect((await items(bed.bob)).map(({ targetId }) => targetId)).toEqual([
        'list-2',
      ]);
      expect(await items(bed.cyd)).toHaveLength(1);
    });
  });

  describe('lists', () => {
    async function sharedList() {
      const list = await bed.lists.create(bed.ada, {
        name: 'Courses',
        icon: 'cart',
        color: '#3264ed',
      });
      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.bob,
        role: 'editor',
      });
      return list;
    }

    it('tells someone they were given a list, and by whom', async () => {
      const list = await sharedList();

      expect((await items(bed.bob)).map(brief)).toEqual([
        {
          kind: 'list.invited',
          targetId: list.id,
          title: 'Courses',
          actor: 'Ada Test',
          count: 1,
          read: false,
        },
      ]);
      expect(await items(bed.ada)).toEqual([]);
    });

    it('tells the others when items are added, once while unread', async () => {
      const list = await sharedList();
      const section = await bed.content.addSection(list.id, bed.bob, {
        name: 'Frais',
        color: '#3264ed',
      });

      await bed.content.addEntry(list.id, section.id, bed.bob, {
        name: 'Lait',
      });
      await bed.content.addEntry(list.id, section.id, bed.bob, {
        name: 'Beurre',
      });

      expect((await items(bed.ada)).map(brief)).toEqual([
        {
          kind: 'list.entries',
          targetId: list.id,
          title: 'Courses',
          actor: 'Bob Test',
          count: 2,
          read: false,
        },
      ]);
      // The one who added them hears nothing new.
      expect((await items(bed.bob)).map(({ kind }) => kind)).toEqual([
        'list.invited',
      ]);
    });

    it('forgets the list for whoever loses it', async () => {
      const list = await sharedList();
      await bed.lists.removeMember(list.id, bed.bob, bed.ada);

      expect(await items(bed.bob)).toEqual([]);

      await bed.lists.addMember(list.id, bed.ada, {
        userId: bed.bob,
        role: 'editor',
      });
      const section = await bed.content.addSection(list.id, bed.bob, {
        name: 'Frais',
        color: '#3264ed',
      });
      await bed.content.addEntry(list.id, section.id, bed.bob, {
        name: 'Lait',
      });
      await bed.lists.remove(list.id, bed.ada);

      expect(await items(bed.bob)).toEqual([]);
      expect(await items(bed.ada)).toEqual([]);
    });
  });

  describe('objectives', () => {
    const create = (changes = {}) =>
      bed.objectives.create(bed.ada, objectiveDetails(changes));
    const share = (
      id: string,
      userId: string,
      role: 'viewer' | 'contributor',
    ) => bed.members.add(id, bed.ada, { userId, role });

    it('keeps invitations, contributions and completions for the others', async () => {
      const objective = await create({ completion: 'manual' });
      await share(objective.id, bed.bob, 'contributor');

      await bed.tracking.setProgress(objective.id, bed.bob, { percent: 40 });
      await bed.tracking.setProgress(objective.id, bed.bob, { percent: 60 });
      await bed.tracking.setProgress(objective.id, bed.bob, { percent: 100 });

      expect((await items(bed.bob)).map(brief)).toEqual([
        {
          kind: 'objective.invited',
          targetId: objective.id,
          title: 'Courir',
          actor: 'Ada Test',
          count: 1,
          read: false,
        },
      ]);
      expect((await items(bed.ada)).map(brief)).toEqual([
        {
          kind: 'objective.completed',
          targetId: objective.id,
          title: 'Courir',
          actor: 'Bob Test',
          count: 1,
          read: false,
        },
        {
          kind: 'objective.contribution',
          targetId: objective.id,
          title: 'Courir',
          actor: 'Bob Test',
          count: 2,
          read: false,
        },
      ]);
    });

    it('leaks nothing above a shared branch: no notification about what the invitee cannot open', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const branch = await create({
        title: 'Branche',
        parentId: top.id,
        completion: 'manual',
      });
      await share(branch.id, bed.bob, 'contributor');

      await bed.tracking.setProgress(branch.id, bed.bob, { percent: 100 });

      const forBob = JSON.stringify(await items(bed.bob));
      expect(forBob).not.toContain(top.id);
      expect(forBob).not.toContain('Haut');
      expect(
        (await items(bed.ada)).map(({ kind, targetId }) => [kind, targetId]),
      ).toEqual(
        expect.arrayContaining([
          ['objective.completed', branch.id],
          ['objective.completed', top.id],
        ]),
      );
    });

    it('forgets the objective for whoever loses it, or when it is deleted', async () => {
      const objective = await create({ completion: 'manual' });
      await bed.befriend(bed.ada, bed.cyd);
      await share(objective.id, bed.bob, 'contributor');
      await share((await create({ title: 'Lire' })).id, bed.cyd, 'viewer');
      await bed.members.remove(objective.id, bed.bob, bed.ada);

      expect(await items(bed.bob)).toEqual([]);

      await share(objective.id, bed.bob, 'contributor');
      await bed.tracking.setProgress(objective.id, bed.bob, { percent: 30 });
      await bed.objectives.remove(objective.id, bed.ada);

      expect(await items(bed.bob)).toEqual([]);
      expect(await items(bed.ada)).toEqual([]);
      // Another objective's news are untouched.
      expect((await items(bed.cyd)).map(({ title }) => title)).toEqual([
        'Lire',
      ]);
    });
  });
});
