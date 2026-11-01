import type { LiveEvent } from '@plano/common';
import type { MockInstance } from 'vitest';
import { LiveEventsService } from '../live/live-events.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('ObjectiveChangesService', () => {
  let bed: ObjectivesTestBed;
  let publish: MockInstance<LiveEventsService['publish']>;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
    publish = vi.spyOn(bed.live, 'publish');
  });

  afterEach(() => bed.destroy());

  /** Who received what, as `[event type, objective id, sorted recipients]`. */
  const sent = () =>
    publish.mock.calls.map(([userIds, event]) => {
      const { type, objectiveId } = event as Extract<
        LiveEvent,
        { type: 'objective.changed' }
      >;
      return [type, objectiveId, [...userIds].sort()];
    });
  const sentOf = (type: LiveEvent['type']) =>
    sent().filter(([eventType]) => eventType === type);
  const newsTo = (userId: string) =>
    publish.mock.calls
      .filter(
        ([userIds, event]) =>
          event.type === 'objective.news' && [...userIds].includes(userId),
      )
      .map(([, event]) => event);
  const create = (changes = {}) =>
    bed.objectives.create(bed.ada, objectiveDetails(changes));
  const share = (id: string, userId: string, role: 'viewer' | 'contributor') =>
    bed.members.add(id, bed.ada, { userId, role });

  it('tells the owner’s other devices about a new objective', async () => {
    const objective = await create();

    expect(sent()).toEqual([['objective.changed', objective.id, [bed.ada]]]);
  });

  it('tells everyone on the objective about a change', async () => {
    const objective = await create({ completion: 'manual' });
    await share(objective.id, bed.bob, 'contributor');
    publish.mockClear();

    await bed.objectives.update(objective.id, bed.ada, { title: 'Nager' });

    expect(sentOf('objective.changed')).toEqual([
      ['objective.changed', objective.id, [bed.ada, bed.bob].sort()],
    ]);
    // An edit is not news.
    expect(sentOf('objective.news')).toEqual([]);
  });

  it('never sends someone an id above what was shared with them', async () => {
    const top = await create({ title: 'Haut', completion: 'children' });
    const branch = await create({
      title: 'Branche',
      parentId: top.id,
      completion: 'manual',
    });
    await share(branch.id, bed.bob, 'contributor');
    publish.mockClear();

    await bed.objectives.update(top.id, bed.ada, { title: 'Renommé' });

    expect(sent()).toEqual(
      expect.arrayContaining([
        ['objective.changed', top.id, [bed.ada]],
        ['objective.changed', branch.id, [bed.bob]],
      ]),
    );
    const toBob = publish.mock.calls.filter(([userIds]) =>
      [...userIds].includes(bed.bob),
    );
    expect(JSON.stringify(toBob.map(([, event]) => event))).not.toContain(
      top.id,
    );
  });

  it('leaves out people invited to another branch', async () => {
    const top = await create({ completion: 'children' });
    const one = await create({ parentId: top.id, completion: 'manual' });
    const two = await create({ parentId: top.id, completion: 'manual' });
    await share(two.id, bed.bob, 'contributor');
    publish.mockClear();

    await bed.tracking.setProgress(one.id, bed.ada, { percent: 10 });

    expect(sent()).toEqual([['objective.changed', one.id, [bed.ada]]]);
  });

  it('tells someone who loses access, in the terms they knew', async () => {
    const objective = await create();
    await share(objective.id, bed.bob, 'viewer');
    publish.mockClear();

    await bed.members.remove(objective.id, bed.bob, bed.ada);

    expect(sentOf('objective.removed')).toEqual([
      ['objective.removed', objective.id, [bed.bob]],
    ]);
    expect(sentOf('objective.changed')).toEqual([
      ['objective.changed', objective.id, [bed.ada]],
    ]);
  });

  it('tells everyone when someone leaves, the one leaving included', async () => {
    const objective = await create();
    await share(objective.id, bed.bob, 'viewer');
    publish.mockClear();

    await bed.members.leave(objective.id, bed.bob);

    expect(sentOf('objective.removed')).toEqual([
      ['objective.removed', objective.id, [bed.bob]],
    ]);
  });

  it('tells everyone a deleted objective is gone', async () => {
    const objective = await create();
    await share(objective.id, bed.bob, 'viewer');
    publish.mockClear();

    await bed.objectives.remove(objective.id, bed.ada);

    expect(sent()).toEqual([
      ['objective.removed', objective.id, [bed.ada, bed.bob].sort()],
    ]);
  });

  it('tells those below a deleted branch, and that its parent changed', async () => {
    const top = await create({ title: 'Haut', completion: 'children' });
    const branch = await create({ title: 'Branche', parentId: top.id });
    const leaf = await create({ title: 'Feuille', parentId: branch.id });
    await share(leaf.id, bed.bob, 'viewer');
    publish.mockClear();

    await bed.objectives.remove(branch.id, bed.ada);

    expect(sent()).toEqual(
      expect.arrayContaining([
        ['objective.changed', top.id, [bed.ada]],
        ['objective.removed', branch.id, [bed.ada]],
        ['objective.removed', leaf.id, [bed.bob]],
      ]),
    );
    expect(sent()).toHaveLength(3);
  });

  describe('news', () => {
    it('tells someone they were invited, and by whom', async () => {
      const objective = await create();
      publish.mockClear();

      await share(objective.id, bed.bob, 'viewer');

      expect(newsTo(bed.bob)).toEqual([
        {
          type: 'objective.news',
          objectiveId: objective.id,
          kind: 'invited',
          title: 'Courir',
          actor: 'Ada Test',
        },
      ]);
      expect(newsTo(bed.ada)).toEqual([]);
    });

    it('tells those invited while creating', async () => {
      const objective = await create({
        members: [{ userId: bed.bob, role: 'contributor' }],
      });

      expect(newsTo(bed.bob)).toEqual([
        expect.objectContaining({ kind: 'invited', objectiveId: objective.id }),
      ]);
    });

    it('says nothing about nobody', async () => {
      await create();

      expect(sentOf('objective.news')).toEqual([]);
    });

    it('tells the others about a contribution, not the one who made it', async () => {
      const objective = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });
      await share(objective.id, bed.bob, 'contributor');
      publish.mockClear();

      await bed.tracking.addSession(objective.id, bed.bob, {
        date: '2026-10-02',
        status: 'done',
        label: 'Sortie',
        value: 1,
      });

      expect(newsTo(bed.ada)).toEqual([
        expect.objectContaining({
          kind: 'contribution',
          actor: 'Bob Test',
          title: 'Courir',
        }),
      ]);
      expect(newsTo(bed.bob)).toEqual([]);
    });

    it('does not count taking a session back as news', async () => {
      const objective = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });
      const { sessions } = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        { date: '2026-10-02', status: 'done', label: '', value: 1 },
      );
      publish.mockClear();

      await bed.tracking.removeSession(objective.id, sessions[0].id, bed.ada);

      expect(sentOf('objective.news')).toEqual([]);
    });

    it('says it was completed rather than contributed to, up the tree', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const child = await create({
        title: 'Bas',
        parentId: top.id,
        completion: 'manual',
      });
      await share(top.id, bed.bob, 'contributor');
      publish.mockClear();

      await bed.tracking.setProgress(child.id, bed.bob, { percent: 100 });

      const news = newsTo(bed.ada) as Extract<
        LiveEvent,
        { type: 'objective.news' }
      >[];
      expect(news.map(({ kind, title }) => [kind, title]).sort()).toEqual(
        [
          ['completed', 'Bas'],
          ['completed', 'Haut'],
        ].sort(),
      );
      expect(newsTo(bed.bob)).toEqual([]);
    });

    it('keeps a completion above what was shared from reaching someone', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const child = await create({
        title: 'Bas',
        parentId: top.id,
        completion: 'manual',
      });
      await share(child.id, bed.bob, 'contributor');
      publish.mockClear();

      await bed.tracking.setProgress(child.id, bed.ada, { percent: 100 });

      const news = newsTo(bed.bob) as Extract<
        LiveEvent,
        { type: 'objective.news' }
      >[];
      expect(news.map(({ title }) => title)).toEqual(['Bas']);
    });
  });

  it('never fails the change when an event cannot be sent', async () => {
    const objective = await create();
    publish.mockImplementation(() => {
      throw new Error('stream gone');
    });

    await expect(
      bed.objectives.update(objective.id, bed.ada, { title: 'Nager' }),
    ).resolves.toMatchObject({ title: 'Nager' });
    await expect(
      bed.members.leave(objective.id, bed.ada).catch(() => 'refused'),
    ).resolves.toBe('refused');
    await expect(
      bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      }),
    ).resolves.toBeDefined();
  });
});
