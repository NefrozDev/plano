import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddObjectiveSessionRequest,
  CreateObjectiveRequest,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { User } from '../users/user.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import { isFutureDate } from './objective-tracking.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('isFutureDate', () => {
  const now = new Date('2026-10-15T23:30:00Z');

  it('allows today and tomorrow, which can still be today for the user', () => {
    expect(isFutureDate('2026-10-14', now)).toBe(false);
    expect(isFutureDate('2026-10-15', now)).toBe(false);
    expect(isFutureDate('2026-10-16', now)).toBe(false);
  });

  it('refuses anything later', () => {
    expect(isFutureDate('2026-10-17', now)).toBe(true);
  });
});

describe('ObjectiveTrackingService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const create = (changes: Partial<CreateObjectiveRequest> = {}) =>
    bed.objectives.create(bed.ada, objectiveDetails(changes));
  const metric = (target = 10, aggregation: 'sum' | 'max' = 'sum') =>
    create({
      completion: 'metric',
      metric: { unit: 'km', target, aggregation },
    });
  const session = (
    changes: Partial<AddObjectiveSessionRequest> = {},
  ): AddObjectiveSessionRequest => ({
    date: '2026-10-02',
    status: 'done',
    label: 'Sortie',
    value: 4,
    ...changes,
  });

  describe('sessions', () => {
    it('records who did it, and moves the bar', async () => {
      const objective = await metric();

      const updated = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session({ durationMinutes: 30 }),
      );

      expect(updated.percent).toBe(40);
      expect(updated.amount?.current).toBe(4);
      expect(updated.sessions).toEqual([
        {
          id: expect.any(String) as string,
          date: '2026-10-02',
          status: 'done',
          label: 'Sortie',
          value: 4,
          durationMinutes: 30,
          author: { id: bed.ada, name: 'Ada Test' },
        },
      ]);
    });

    it('only counts done sessions', async () => {
      const objective = await metric();

      const updated = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session({ status: 'planned', date: '2030-01-01' }),
      );

      expect(updated.percent).toBe(0);
      expect(updated.sessions).toHaveLength(1);
    });

    it('orders sessions by date', async () => {
      const objective = await metric();
      await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session({ date: '2026-10-05', label: 'Tard' }),
      );

      const updated = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session({ date: '2026-10-01', label: 'Tôt' }),
      );

      expect(updated.sessions.map(({ label }) => label)).toEqual([
        'Tôt',
        'Tard',
      ]);
    });

    it('completes at the target, then reopens when a session is removed', async () => {
      const objective = await metric();
      const first = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session({ value: 10 }),
      );
      expect(first.status).toBe('completed');
      expect(first.percent).toBe(100);
      expect(first.completedAt).toEqual(expect.any(String));

      const reopened = await bed.tracking.removeSession(
        objective.id,
        first.sessions[0].id,
        bed.ada,
      );

      expect(reopened.status).toBe('active');
      expect(reopened.percent).toBe(0);
      expect(reopened.completedAt).toBeNull();
    });

    it('keeps the amount past the target', async () => {
      const objective = await metric(10);

      const updated = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session({ value: 15 }),
      );

      expect(updated.percent).toBe(100);
      expect(updated.amount?.current).toBe(15);
    });

    it('refuses a done session in the future', async () => {
      const objective = await metric();

      await expect(
        bed.tracking.addSession(
          objective.id,
          bed.ada,
          session({ date: '2099-01-01' }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(await bed.dataSource.manager.count(ObjectiveSession)).toBe(0);
    });

    it('refuses a session on an objective not tracked that way', async () => {
      const objective = await create({ completion: 'manual' });

      await expect(
        bed.tracking.addSession(objective.id, bed.ada, session()),
      ).rejects.toThrow(BadRequestException);
    });

    it('answers 404 for a session of another objective', async () => {
      const objective = await metric();
      const other = await metric();
      const { sessions } = await bed.tracking.addSession(
        other.id,
        bed.ada,
        session(),
      );

      await expect(
        bed.tracking.removeSession(objective.id, sessions[0].id, bed.ada),
      ).rejects.toThrow(NotFoundException);
      await expect(
        bed.tracking.removeSession(objective.id, randomUUID(), bed.ada),
      ).rejects.toThrow(NotFoundException);
      expect(await bed.dataSource.manager.count(ObjectiveSession)).toBe(1);
    });

    it('keeps a contributor from removing someone else’s session', async () => {
      const objective = await metric();
      const { sessions } = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session(),
      );
      vi.spyOn(bed.access, 'roleOn').mockReturnValue('contributor');

      await expect(
        bed.tracking.removeSession(objective.id, sessions[0].id, bed.bob),
      ).rejects.toThrow(ForbiddenException);
      expect(await bed.dataSource.manager.count(ObjectiveSession)).toBe(1);
    });

    it('lets the owner remove any session, and keeps those of deleted accounts', async () => {
      const objective = await metric();
      await bed.dataSource.manager.insert(ObjectiveSession, {
        id: randomUUID(),
        objectiveId: objective.id,
        authorId: bed.cyd,
        date: '2026-10-02',
        status: 'done',
        label: 'Cyd',
        value: 1,
      });
      await bed.dataSource.manager.delete(User, { id: bed.cyd });

      const { sessions } = await bed.objectives.findOne(objective.id, bed.ada);
      expect(sessions[0].author).toBeNull();

      const updated = await bed.tracking.removeSession(
        objective.id,
        sessions[0].id,
        bed.ada,
      );
      expect(updated.sessions).toEqual([]);
    });

    it('answers 404 to someone who cannot see it', async () => {
      const objective = await metric();

      await expect(
        bed.tracking.addSession(objective.id, bed.bob, session()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('check-ins', () => {
    const habit = (habitTargetDays = 2) =>
      create({ completion: 'habit', habitTargetDays });

    it('checks a day once, and completes at the target', async () => {
      const objective = await habit();

      await bed.tracking.setCheckIn(objective.id, '2026-10-01', bed.ada, true);
      const again = await bed.tracking.setCheckIn(
        objective.id,
        '2026-10-01',
        bed.ada,
        true,
      );
      expect(again.percent).toBe(50);
      expect(again.checkIns).toEqual([{ date: '2026-10-01', userId: bed.ada }]);

      const done = await bed.tracking.setCheckIn(
        objective.id,
        '2026-10-02',
        bed.ada,
        true,
      );
      expect(done.status).toBe('completed');
    });

    it('unchecks a day, which reopens it', async () => {
      const objective = await habit(1);
      await bed.tracking.setCheckIn(objective.id, '2026-10-01', bed.ada, true);

      const updated = await bed.tracking.setCheckIn(
        objective.id,
        '2026-10-01',
        bed.ada,
        false,
      );

      expect(updated.checkIns).toEqual([]);
      expect(updated.status).toBe('active');
    });

    it('refuses a day to come, but can still uncheck one', async () => {
      const objective = await habit();

      await expect(
        bed.tracking.setCheckIn(objective.id, '2099-01-01', bed.ada, true),
      ).rejects.toThrow(BadRequestException);
      await expect(
        bed.tracking.setCheckIn(objective.id, '2099-01-01', bed.ada, false),
      ).resolves.toMatchObject({ checkIns: [] });
    });

    it('refuses a check-in on an objective not tracked that way', async () => {
      const objective = await metric();

      await expect(
        bed.tracking.setCheckIn(objective.id, '2026-10-01', bed.ada, true),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('manual progress', () => {
    it('moves the bar and completes at 100', async () => {
      const objective = await create({ completion: 'manual' });

      const half = await bed.tracking.setProgress(objective.id, bed.ada, {
        percent: 50,
      });
      expect(half).toMatchObject({ percent: 50, manualProgress: 50 });

      const full = await bed.tracking.setProgress(objective.id, bed.ada, {
        percent: 100,
      });
      expect(full.status).toBe('completed');

      const back = await bed.tracking.setProgress(objective.id, bed.ada, {
        percent: 90,
      });
      expect(back.status).toBe('active');
    });

    it('refuses it on an objective not tracked that way', async () => {
      const objective = await create();

      await expect(
        bed.tracking.setProgress(objective.id, bed.ada, { percent: 50 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('marking complete', () => {
    it('completes an objective without a bar, records who, and reopens it', async () => {
      const objective = await create();

      const completed = await bed.tracking.setCompleted(objective.id, bed.ada, {
        completed: true,
      });
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toEqual(expect.any(String));

      const reopened = await bed.tracking.setCompleted(objective.id, bed.ada, {
        completed: false,
      });
      expect(reopened.status).toBe('active');
      expect(reopened.completedAt).toBeNull();
    });

    it('refuses it when a bar decides', async () => {
      const objective = await metric();

      await expect(
        bed.tracking.setCompleted(objective.id, bed.ada, { completed: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses it while paused', async () => {
      const objective = await create();
      await bed.objectives.update(objective.id, bed.ada, { paused: true });

      await expect(
        bed.tracking.setCompleted(objective.id, bed.ada, { completed: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rolling up the tree', () => {
    it('completes and reopens every level above', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const middle = await bed.objectives.create(
        bed.ada,
        objectiveDetails({
          title: 'Milieu',
          parentId: top.id,
          completion: 'children',
        }),
      );
      const bottom = await bed.objectives.create(
        bed.ada,
        objectiveDetails({
          title: 'Bas',
          parentId: middle.id,
          completion: 'manual',
        }),
      );

      await bed.tracking.setProgress(bottom.id, bed.ada, { percent: 100 });
      for (const id of [top.id, middle.id]) {
        expect(await bed.objectives.findOne(id, bed.ada)).toMatchObject({
          percent: 100,
          status: 'completed',
        });
      }

      await bed.tracking.setProgress(bottom.id, bed.ada, { percent: 40 });
      for (const id of [top.id, middle.id]) {
        expect(await bed.objectives.findOne(id, bed.ada)).toMatchObject({
          percent: 40,
          status: 'active',
        });
      }
    });

    it('leaves a paused parent paused', async () => {
      const top = await create({ completion: 'children' });
      const child = await bed.objectives.create(
        bed.ada,
        objectiveDetails({ parentId: top.id, completion: 'manual' }),
      );
      await bed.objectives.update(top.id, bed.ada, { paused: true });

      await bed.tracking.setProgress(child.id, bed.ada, { percent: 100 });

      expect(await bed.objectives.findOne(top.id, bed.ada)).toMatchObject({
        percent: 100,
        status: 'paused',
      });
    });
  });
});
