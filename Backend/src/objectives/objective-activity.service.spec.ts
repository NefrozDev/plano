import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User } from '../users/user.entity';
import { ObjectiveActivity } from './entities/objective-activity.entity';
import { ObjectiveComment } from './entities/objective-comment.entity';
import { ACTIVITY_LIMIT } from './objective-activity.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('ObjectiveActivityService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const create = (changes = {}, userId = bed.ada) =>
    bed.objectives.create(userId, objectiveDetails(changes));
  const share = (id: string, role: 'viewer' | 'contributor' = 'contributor') =>
    bed.members.add(id, bed.ada, { userId: bed.bob, role });
  /** The history, oldest first, as `kind` or `kind:detail`. */
  const kinds = async (id: string, userId = bed.ada) =>
    (await bed.activity.history(id, userId))
      .reverse()
      .map(({ kind, detail }) => (detail ? `${kind}:${detail}` : kind));

  describe('history', () => {
    it('starts with the creation, and who did it', async () => {
      const objective = await create();

      const [entry] = await bed.activity.history(objective.id, bed.ada);

      expect(entry).toEqual({
        id: expect.any(String) as string,
        kind: 'created',
        detail: '',
        actor: { id: bed.ada, name: 'Ada Test' },
        objectiveId: objective.id,
        objectiveTitle: 'Courir',
        createdAt: expect.any(String) as string,
      });
    });

    it('tells what was done to the settings', async () => {
      const objective = await create();

      await bed.objectives.update(objective.id, bed.ada, { title: 'Nager' });
      await bed.objectives.update(objective.id, bed.ada, { paused: true });
      await bed.objectives.update(objective.id, bed.ada, { paused: false });
      await bed.objectives.update(objective.id, bed.ada, { archived: true });
      await bed.objectives.update(objective.id, bed.ada, { archived: false });

      expect(await kinds(objective.id)).toEqual([
        'created',
        'edited',
        'paused',
        'resumed',
        'archived',
        'unarchived',
      ]);
    });

    it('tells about progress, and completion when it comes', async () => {
      const metric = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });

      const { sessions } = await bed.tracking.addSession(metric.id, bed.ada, {
        date: '2026-10-02',
        status: 'done',
        label: 'Sortie',
        value: 10,
      });
      await bed.tracking.removeSession(metric.id, sessions[0].id, bed.ada);

      expect(await kinds(metric.id)).toEqual([
        'created',
        'session:10 km · Sortie',
        'completed',
        'session_removed:Sortie',
        'reopened',
      ]);
    });

    it('leaves out sessions that are only planned', async () => {
      const metric = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
      });

      await bed.tracking.addSession(metric.id, bed.ada, {
        date: '2030-10-02',
        status: 'planned',
        label: 'Plus tard',
        value: 10,
      });

      expect(await kinds(metric.id)).toEqual(['created']);
    });

    it('tells about days, percentages and ticks', async () => {
      const habit = await create({ completion: 'habit', habitTargetDays: 5 });
      await bed.tracking.setCheckIn(habit.id, '2026-10-02', bed.ada, true);
      await bed.tracking.setCheckIn(habit.id, '2026-10-02', bed.ada, false);
      expect(await kinds(habit.id)).toEqual([
        'created',
        'check_in:2026-10-02',
        'check_out:2026-10-02',
      ]);

      const manual = await create({ completion: 'manual' });
      await bed.tracking.setProgress(manual.id, bed.ada, { percent: 40 });
      expect(await kinds(manual.id)).toEqual(['created', 'progress:40']);

      const plain = await create();
      await bed.tracking.setCompleted(plain.id, bed.ada, { completed: true });
      await bed.tracking.setCompleted(plain.id, bed.ada, { completed: false });
      expect(await kinds(plain.id)).toEqual([
        'created',
        'completed',
        'reopened',
      ]);
    });

    it('tells who comes and goes, and who is assigned', async () => {
      const top = await create({ children: ['Un'] });
      const child = top.children[0];
      await share(top.id, 'viewer');
      await bed.members.updateRole(top.id, bed.bob, bed.ada, 'contributor');
      await bed.objectives.update(child.id, bed.ada, {
        assignedToUserId: bed.bob,
      });
      await bed.objectives.update(child.id, bed.ada, {
        assignedToUserId: null,
      });
      await bed.members.remove(top.id, bed.bob, bed.ada);
      await share(top.id);
      await bed.members.leave(top.id, bed.bob);

      expect(await kinds(top.id)).toEqual(
        expect.arrayContaining([
          'member_added:Bob Test',
          'member_removed:Bob Test',
          'member_left',
          'assigned:Bob Test',
          'unassigned',
        ]),
      );
    });

    it('names who did it, and what it was on, for what is below', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const child = await create({
        title: 'Bas',
        parentId: top.id,
        completion: 'manual',
      });
      await share(top.id);

      await bed.tracking.setProgress(child.id, bed.bob, { percent: 30 });

      const [latest] = await bed.activity.history(top.id, bed.ada);
      expect(latest).toMatchObject({
        kind: 'progress',
        detail: '30',
        actor: { id: bed.bob, name: 'Bob Test' },
        objectiveId: child.id,
        objectiveTitle: 'Bas',
      });
    });

    it('keeps the history of an account since deleted, without a name', async () => {
      const objective = await create({ completion: 'manual' });
      await share(objective.id);
      await bed.tracking.setProgress(objective.id, bed.bob, { percent: 10 });

      await bed.dataSource.manager.delete(User, { id: bed.bob });

      const [latest] = await bed.activity.history(objective.id, bed.ada);
      expect(latest).toMatchObject({ kind: 'progress', actor: null });
    });

    it('stops at a limit', async () => {
      const objective = await create();
      await bed.dataSource.manager.insert(
        ObjectiveActivity,
        Array.from({ length: ACTIVITY_LIMIT + 5 }, () => ({
          id: randomUUID(),
          objectiveId: objective.id,
          actorId: bed.ada,
          kind: 'edited' as const,
        })),
      );

      expect(await bed.activity.history(objective.id, bed.ada)).toHaveLength(
        ACTIVITY_LIMIT,
      );
    });

    it('shows someone invited to a branch that branch, nothing above or beside', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const branch = await create({
        title: 'Branche',
        parentId: top.id,
        completion: 'manual',
      });
      const other = await create({ title: 'Autre', parentId: top.id });
      await bed.objectives.update(top.id, bed.ada, { title: 'Secret' });
      await bed.objectives.update(other.id, bed.ada, { title: 'Caché' });
      await share(branch.id);

      const history = await bed.activity.history(branch.id, bed.bob);

      expect(new Set(history.map(({ objectiveId }) => objectiveId))).toEqual(
        new Set([branch.id]),
      );
      await expect(bed.activity.history(top.id, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
      await expect(bed.activity.history(other.id, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('answers 404 to strangers', async () => {
      const objective = await create();

      await expect(bed.activity.history(objective.id, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('comments', () => {
    it('lets anyone who can open it talk, a viewer included, oldest first', async () => {
      const objective = await create();
      await share(objective.id, 'viewer');

      const first = await bed.activity.addComment(objective.id, bed.ada, {
        body: 'Courage',
      });
      expect(first).toEqual({
        id: expect.any(String) as string,
        body: 'Courage',
        author: { id: bed.ada, name: 'Ada Test' },
        createdAt: expect.any(String) as string,
      });
      await bed.activity.addComment(objective.id, bed.bob, { body: 'Merci' });

      const comments = await bed.activity.comments(objective.id, bed.bob);
      expect(comments.map(({ body }) => body)).toEqual(['Courage', 'Merci']);
    });

    it('tells the others, and not the one who wrote', async () => {
      const objective = await create();
      await share(objective.id, 'viewer');
      const publish = vi.spyOn(bed.live, 'publish');

      await bed.activity.addComment(objective.id, bed.bob, { body: 'Salut' });

      const news = publish.mock.calls.filter(
        ([, event]) => event.type === 'objective.news',
      );
      expect(news).toHaveLength(1);
      expect([...news[0][0]]).toEqual([bed.ada]);
      expect(news[0][1]).toMatchObject({ kind: 'comment', actor: 'Bob Test' });
    });

    it('keeps each level to itself: nothing from above reaches a branch', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const branch = await create({ title: 'Branche', parentId: top.id });
      await share(branch.id);
      await bed.activity.addComment(top.id, bed.ada, { body: 'Entre nous' });
      await bed.activity.addComment(branch.id, bed.ada, { body: 'Pour Bob' });

      expect(
        (await bed.activity.comments(branch.id, bed.bob)).map(
          ({ body }) => body,
        ),
      ).toEqual(['Pour Bob']);
      await expect(bed.activity.comments(top.id, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        bed.activity.addComment(top.id, bed.bob, { body: 'Coucou' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets people take back their own words, and the owner remove any', async () => {
      const objective = await create();
      await share(objective.id, 'viewer');
      const byAda = await bed.activity.addComment(objective.id, bed.ada, {
        body: 'Ada',
      });
      const byBob = await bed.activity.addComment(objective.id, bed.bob, {
        body: 'Bob',
      });

      await expect(
        bed.activity.removeComment(objective.id, byAda.id, bed.bob),
      ).rejects.toThrow(ForbiddenException);
      expect(await bed.dataSource.manager.count(ObjectiveComment)).toBe(2);

      await bed.activity.removeComment(objective.id, byBob.id, bed.bob);
      expect(await bed.dataSource.manager.count(ObjectiveComment)).toBe(1);

      const again = await bed.activity.addComment(objective.id, bed.bob, {
        body: 'Encore',
      });
      await bed.activity.removeComment(objective.id, again.id, bed.ada);
      expect(await bed.dataSource.manager.count(ObjectiveComment)).toBe(1);
    });

    it('answers 404 for a comment elsewhere, or that does not exist', async () => {
      const objective = await create();
      const other = await create();
      const { id } = await bed.activity.addComment(other.id, bed.ada, {
        body: 'Ailleurs',
      });

      await expect(
        bed.activity.removeComment(objective.id, id, bed.ada),
      ).rejects.toThrow(NotFoundException);
      await expect(
        bed.activity.removeComment(objective.id, randomUUID(), bed.ada),
      ).rejects.toThrow(NotFoundException);
      expect(await bed.dataSource.manager.count(ObjectiveComment)).toBe(1);
    });

    it('keeps the words of an account since deleted', async () => {
      const objective = await create();
      await share(objective.id, 'viewer');
      await bed.activity.addComment(objective.id, bed.bob, { body: 'Salut' });

      await bed.dataSource.manager.delete(User, { id: bed.bob });

      const [comment] = await bed.activity.comments(objective.id, bed.ada);
      expect(comment).toMatchObject({ body: 'Salut', author: null });
    });

    it('goes with its objective', async () => {
      const objective = await create();
      await bed.activity.addComment(objective.id, bed.ada, { body: 'Salut' });

      await bed.objectives.remove(objective.id, bed.ada);

      expect(await bed.dataSource.manager.count(ObjectiveComment)).toBe(0);
      expect(await bed.dataSource.manager.count(ObjectiveActivity)).toBe(0);
    });
  });
});
