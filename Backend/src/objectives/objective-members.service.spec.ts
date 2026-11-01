import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CreateObjectiveRequest, ObjectiveDetail } from '@plano/common';
import { randomUUID } from 'node:crypto';
import { User } from '../users/user.entity';
import { ObjectiveMember } from './entities/objective-member.entity';
import { ObjectiveAgendaService } from './objective-agenda.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('ObjectiveMembersService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const create = (
    changes: Partial<CreateObjectiveRequest> = {},
    userId = bed.ada,
  ): Promise<ObjectiveDetail> =>
    bed.objectives.create(userId, objectiveDetails(changes));
  /** A tree: Haut > (Branche > Feuille, Autre). */
  const tree = async () => {
    const top = await create({
      title: 'Haut',
      completion: 'children',
      description: 'Le secret du haut',
    });
    const branch = await create({
      title: 'Branche',
      parentId: top.id,
      completion: 'children',
    });
    const leaf = await create({
      title: 'Feuille',
      parentId: branch.id,
      completion: 'manual',
    });
    const sibling = await create({
      title: 'Autre',
      parentId: top.id,
      completion: 'manual',
    });
    return { top, branch, leaf, sibling };
  };
  /** Cyd becomes one of Ada's contacts; Bob already is, through their group. */
  const befriendCyd = () => bed.befriend(bed.ada, bed.cyd);

  describe('add', () => {
    it('shares with a contact, who then sees it', async () => {
      const objective = await create();

      const shared = await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      expect(shared.sharing).toBe('shared');
      expect(shared.members).toEqual([
        { id: bed.ada, name: 'Ada Test', role: 'owner', inheritedFrom: null },
        { id: bed.bob, name: 'Bob Test', role: 'viewer', inheritedFrom: null },
      ]);
      expect(shared.people.map(({ name }) => name)).toEqual([
        'Ada Test',
        'Bob Test',
      ]);
      const seen = await bed.objectives.findAll(bed.bob);
      expect(seen.map(({ id, role }) => [id, role])).toEqual([
        [objective.id, 'viewer'],
      ]);
    });

    it('makes it common with a contributor', async () => {
      const objective = await create();

      const shared = await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });

      expect(shared.sharing).toBe('common');
    });

    it('refuses someone who is not a contact, and stores nothing', async () => {
      const objective = await create();

      await expect(
        bed.members.add(objective.id, bed.ada, {
          userId: bed.cyd,
          role: 'viewer',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(await bed.dataSource.manager.count(ObjectiveMember)).toBe(0);
    });

    it('accepts a friend', async () => {
      const objective = await create();
      await befriendCyd();

      await expect(
        bed.members.add(objective.id, bed.ada, {
          userId: bed.cyd,
          role: 'viewer',
        }),
      ).resolves.toBeDefined();
    });

    it('refuses the owner', async () => {
      const objective = await create();

      await expect(
        bed.members.add(objective.id, bed.ada, {
          userId: bed.ada,
          role: 'viewer',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses someone already invited here, or inherited at that level', async () => {
      const { top, branch } = await tree();
      const bob = { userId: bed.bob, role: 'contributor' as const };
      await bed.members.add(top.id, bed.ada, bob);

      await expect(bed.members.add(top.id, bed.ada, bob)).rejects.toThrow(
        ConflictException,
      );
      await expect(bed.members.add(branch.id, bed.ada, bob)).rejects.toThrow(
        ConflictException,
      );
      await expect(
        bed.members.add(branch.id, bed.ada, { ...bob, role: 'viewer' }),
      ).rejects.toThrow(ConflictException);
      expect(await bed.dataSource.manager.count(ObjectiveMember)).toBe(1);
    });

    it('lets someone who only follows the top contribute to one branch', async () => {
      const { top, branch, sibling } = await tree();
      await bed.members.add(top.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      await bed.members.add(branch.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });

      expect(await bed.objectives.findOne(branch.id, bed.bob)).toMatchObject({
        role: 'contributor',
      });
      expect(await bed.objectives.findOne(sibling.id, bed.bob)).toMatchObject({
        role: 'viewer',
      });
    });

    it('is for the owner alone', async () => {
      const objective = await create();
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });
      await befriendCyd();

      await expect(
        bed.members.add(objective.id, bed.bob, {
          userId: bed.cyd,
          role: 'viewer',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('invites people while creating an objective, or not at all', async () => {
      const shared = await create({
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      expect(shared.sharing).toBe('common');

      await expect(
        create({
          members: [{ userId: bed.cyd, role: 'viewer' }],
          title: 'Non',
        }),
      ).rejects.toThrow(BadRequestException);
      // The refused one was not created halfway.
      expect(
        (await bed.objectives.findAll(bed.ada)).map(({ title }) => title),
      ).toEqual(['Courir']);
    });
  });

  describe('updateRole', () => {
    it('changes the role of someone invited here', async () => {
      const objective = await create();
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      const updated = await bed.members.updateRole(
        objective.id,
        bed.bob,
        bed.ada,
        'contributor',
      );

      expect(updated.members[1].role).toBe('contributor');
      expect(updated.sharing).toBe('common');
    });

    it('answers 404 for someone not invited here', async () => {
      const { top, branch } = await tree();
      await bed.members.add(top.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      await expect(
        bed.members.updateRole(branch.id, bed.bob, bed.ada, 'contributor'),
      ).rejects.toThrow(NotFoundException);
    });

    it('is for the owner alone', async () => {
      const objective = await create();
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      await expect(
        bed.members.updateRole(objective.id, bed.bob, bed.bob, 'contributor'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('takes access away', async () => {
      const objective = await create();
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      const updated = await bed.members.remove(objective.id, bed.bob, bed.ada);

      expect(updated.sharing).toBe('private');
      expect(await bed.objectives.findAll(bed.bob)).toEqual([]);
      await expect(
        bed.objectives.findOne(objective.id, bed.bob),
      ).rejects.toThrow(NotFoundException);
    });

    it('answers 404 for someone not invited here, and removes nothing', async () => {
      const { top, branch } = await tree();
      await bed.members.add(top.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      await expect(
        bed.members.remove(branch.id, bed.bob, bed.ada),
      ).rejects.toThrow(NotFoundException);
      expect(await bed.dataSource.manager.count(ObjectiveMember)).toBe(1);
    });

    it('is for the owner alone', async () => {
      const objective = await create();
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      await expect(
        bed.members.remove(objective.id, bed.bob, bed.bob),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('leave', () => {
    it('gives up everything the person had in the tree, wherever they leave from', async () => {
      const { top, branch, sibling } = await tree();
      await bed.members.add(branch.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });
      await bed.members.add(sibling.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });

      await bed.members.leave(branch.id, bed.bob);

      expect(await bed.objectives.findAll(bed.bob)).toEqual([]);
      expect(await bed.dataSource.manager.count(ObjectiveMember)).toBe(0);
      expect(await bed.objectives.findOne(top.id, bed.ada)).toBeDefined();
    });

    it('leaves other people’s access alone', async () => {
      const objective = await create();
      await befriendCyd();
      for (const userId of [bed.bob, bed.cyd]) {
        await bed.members.add(objective.id, bed.ada, {
          userId,
          role: 'viewer',
        });
      }

      await bed.members.leave(objective.id, bed.bob);

      expect(await bed.objectives.findAll(bed.cyd)).toHaveLength(1);
    });

    it('is not for the owner, nor for a stranger', async () => {
      const objective = await create();

      await expect(bed.members.leave(objective.id, bed.ada)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(bed.members.leave(objective.id, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('roles', () => {
    let objectiveId: string;

    beforeEach(async () => {
      const objective = await create({ completion: 'manual' });
      objectiveId = objective.id;
    });

    const invite = (role: 'viewer' | 'contributor') =>
      bed.members.add(objectiveId, bed.ada, { userId: bed.bob, role });

    it('lets a viewer read, and nothing else', async () => {
      await invite('viewer');

      await expect(
        bed.objectives.findOne(objectiveId, bed.bob),
      ).resolves.toMatchObject({ role: 'viewer' });
      await expect(
        bed.tracking.setProgress(objectiveId, bed.bob, { percent: 10 }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        bed.objectives.update(objectiveId, bed.bob, { title: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(bed.objectives.remove(objectiveId, bed.bob)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets a contributor move it forward, not change it', async () => {
      await invite('contributor');

      await expect(
        bed.tracking.setProgress(objectiveId, bed.bob, { percent: 10 }),
      ).resolves.toMatchObject({ percent: 10 });
      await expect(
        bed.objectives.update(objectiveId, bed.bob, { title: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(create({ parentId: objectiveId }, bed.bob)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(bed.objectives.remove(objectiveId, bed.bob)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        bed.objectives.reorderChildren(objectiveId, bed.bob, {
          objectiveIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets anyone who can read choose their own preferences', async () => {
      await invite('viewer');

      const pinned = await bed.objectivePreferences.update(
        objectiveId,
        bed.bob,
        { onHome: true, dueReminder: 'same-day' },
      );
      expect(pinned).toMatchObject({ onHome: true, dueReminder: 'same-day' });

      // Nothing of it reaches the owner.
      expect(await bed.objectives.findOne(objectiveId, bed.ada)).toMatchObject({
        onHome: false,
        dueReminder: 'none',
      });
    });

    it('lets contributors take back their own sessions only', async () => {
      const metric = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      const session = {
        date: '2026-10-02',
        status: 'done' as const,
        label: 'Sortie',
        value: 1,
      };
      const byAda = await bed.tracking.addSession(metric.id, bed.ada, session);
      const byBoth = await bed.tracking.addSession(metric.id, bed.bob, session);
      const adaSession = byAda.sessions[0].id;
      const bobSession = byBoth.sessions.find(
        ({ author }) => author?.id === bed.bob,
      )!.id;

      await expect(
        bed.tracking.removeSession(metric.id, adaSession, bed.bob),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        bed.tracking.removeSession(metric.id, bobSession, bed.bob),
      ).resolves.toBeDefined();
      await expect(
        bed.tracking.removeSession(metric.id, adaSession, bed.ada),
      ).resolves.toBeDefined();
    });
  });

  describe('losing the link', () => {
    it('takes access away at once, and gives it back with the link', async () => {
      const objective = await create();
      await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      await bed.leaveGroup(bed.bob);

      expect(await bed.objectives.findAll(bed.bob)).toEqual([]);
      await expect(
        bed.objectives.findOne(objective.id, bed.bob),
      ).rejects.toThrow(NotFoundException);
      // The owner no longer sees them as having access either.
      const seen = await bed.objectives.findOne(objective.id, bed.ada);
      expect(seen.sharing).toBe('private');
      expect(seen.members).toHaveLength(1);

      await bed.joinGroup(bed.bob);
      expect(await bed.objectives.findAll(bed.bob)).toHaveLength(1);
    });
  });

  describe('sharing one branch', () => {
    /** Bob is invited to Branche, as a contributor. */
    const shareBranch = async () => {
      const nodes = await tree();
      await bed.members.add(nodes.branch.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });
      return nodes;
    };

    it('shows the branch and what is below, as their own top', async () => {
      const { branch, leaf } = await shareBranch();

      const tops = await bed.objectives.findAll(bed.bob);
      expect(tops.map(({ id }) => id)).toEqual([branch.id]);
      expect(tops[0].parentId).toBeNull();

      await expect(
        bed.objectives.findOne(leaf.id, bed.bob),
      ).resolves.toMatchObject({ role: 'contributor' });
    });

    it('hides everything above and beside, with the same answer as an unknown id', async () => {
      const { top, sibling } = await shareBranch();

      for (const id of [top.id, sibling.id, randomUUID()]) {
        await expect(bed.objectives.findOne(id, bed.bob)).rejects.toThrow(
          NotFoundException,
        );
        await expect(
          bed.objectives.update(id, bed.bob, { title: 'X' }),
        ).rejects.toThrow(NotFoundException);
        await expect(
          bed.tracking.setProgress(id, bed.bob, { percent: 1 }),
        ).rejects.toThrow(NotFoundException);
        await expect(
          bed.objectivePreferences.update(id, bed.bob, { onHome: true }),
        ).rejects.toThrow(NotFoundException);
        await expect(
          bed.members.add(id, bed.bob, { userId: bed.ada, role: 'viewer' }),
        ).rejects.toThrow(NotFoundException);
      }
      await expect(create({ parentId: top.id }, bed.bob)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gives only the names of the parents, without their ids', async () => {
      const { branch, leaf } = await shareBranch();

      const atBranch = await bed.objectives.findOne(branch.id, bed.bob);
      expect(atBranch.breadcrumb).toEqual([{ id: null, title: 'Haut' }]);
      expect(atBranch.parentId).toBeNull();

      const atLeaf = await bed.objectives.findOne(leaf.id, bed.bob);
      expect(atLeaf.breadcrumb).toEqual([
        { id: null, title: 'Haut' },
        { id: branch.id, title: 'Branche' },
      ]);
      expect(atLeaf.parentId).toBe(branch.id);
    });

    it('leaks nothing of the rest of the tree in any answer', async () => {
      const { top, branch, sibling } = await shareBranch();
      await befriendCyd();
      await bed.members.add(top.id, bed.ada, {
        userId: bed.cyd,
        role: 'viewer',
      });

      for (const answer of [
        await bed.objectives.findOne(branch.id, bed.bob),
        await bed.objectives.findAll(bed.bob),
      ]) {
        const text = JSON.stringify(answer);
        expect(text).not.toContain(top.id);
        expect(text).not.toContain(sibling.id);
        expect(text).not.toContain('Autre');
        expect(text).not.toContain('Le secret du haut');
        // Someone invited higher up is none of their business.
        expect(text).not.toContain(bed.cyd);
        expect(text).not.toContain('Cyd');
      }
    });

    it('does not count the parent’s progress into what they see', async () => {
      const { top, branch, leaf } = await shareBranch();

      await bed.tracking.setProgress(leaf.id, bed.bob, { percent: 40 });

      expect(await bed.objectives.findOne(branch.id, bed.bob)).toMatchObject({
        percent: 40,
      });
      // The owner sees it roll up, with the sibling at 0.
      expect(await bed.objectives.findOne(top.id, bed.ada)).toMatchObject({
        percent: 20,
      });
    });

    it('keeps other people invited elsewhere out of the agenda and the people', async () => {
      const { sibling, branch } = await shareBranch();
      await befriendCyd();
      await bed.members.add(sibling.id, bed.ada, {
        userId: bed.cyd,
        role: 'contributor',
      });
      await bed.objectives.update(sibling.id, bed.ada, {
        dueDate: '2026-12-01',
      });
      await bed.objectives.update(branch.id, bed.ada, {
        dueDate: '2026-12-02',
      });

      const agenda = new ObjectiveAgendaService(bed.dataSource, bed.access);
      expect(
        (await agenda.find(bed.bob)).map(({ objectiveId }) => objectiveId),
      ).toEqual([branch.id]);

      const seen = await bed.objectives.findOne(branch.id, bed.bob);
      expect(seen.people.map(({ id }) => id)).toEqual([bed.ada, bed.bob]);
    });

    it('lists each branch once for someone invited to two', async () => {
      const { branch, sibling } = await shareBranch();
      await bed.members.add(sibling.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });

      const tops = await bed.objectives.findAll(bed.bob);
      expect(tops.map(({ id }) => id).sort()).toEqual(
        [branch.id, sibling.id].sort(),
      );
    });

    it('shows who was invited higher up to the people invited with them', async () => {
      const { top, branch } = await tree();
      for (const userId of [bed.bob]) {
        await bed.members.add(top.id, bed.ada, { userId, role: 'viewer' });
      }
      await befriendCyd();
      await bed.members.add(branch.id, bed.ada, {
        userId: bed.cyd,
        role: 'viewer',
      });

      // Bob, invited at the top, sees Cyd's invitation lower down.
      const seen = await bed.objectives.findOne(branch.id, bed.bob);
      expect(
        seen.members.map(({ name, inheritedFrom }) => [name, inheritedFrom]),
      ).toEqual([
        ['Ada Test', null],
        ['Bob Test', { id: top.id, title: 'Haut' }],
        ['Cyd Test', null],
      ]);
    });

    it('keeps the strongest role when someone is invited twice on the way', async () => {
      const { top, branch } = await tree();
      await bed.members.add(top.id, bed.ada, {
        userId: bed.bob,
        role: 'viewer',
      });
      await bed.members.add(branch.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });

      const seen = await bed.objectives.findOne(branch.id, bed.ada);
      expect(seen.members).toEqual([
        expect.objectContaining({ id: bed.ada }),
        expect.objectContaining({
          id: bed.bob,
          role: 'contributor',
          inheritedFrom: null,
        }),
      ]);
    });

    it('shows the owner the tree whole, invitations included', async () => {
      const { branch, top } = await shareBranch();

      expect(
        (await bed.objectives.findAll(bed.ada)).map(({ id }) => id),
      ).toEqual([top.id]);
      expect((await bed.objectives.findOne(branch.id, bed.ada)).sharing).toBe(
        'common',
      );
      // Sharing below does not make the top shared.
      expect((await bed.objectives.findOne(top.id, bed.ada)).sharing).toBe(
        'private',
      );
    });
  });

  describe('common objectives', () => {
    const session = (value: number, status = 'done' as const) => ({
      date: '2026-10-02',
      status,
      label: 'Versement',
      value,
    });

    it('attributes each amount, with shares, for a sum', async () => {
      const objective = await create({
        completion: 'metric',
        metric: { unit: '€', target: 1000, aggregation: 'sum' },
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      await bed.tracking.addSession(objective.id, bed.ada, session(600));
      await bed.tracking.addSession(objective.id, bed.bob, session(100));
      const updated = await bed.tracking.addSession(
        objective.id,
        bed.bob,
        session(300),
      );

      expect(updated.percent).toBe(100);
      expect(updated.status).toBe('completed');
      expect(updated.completedBy?.id).toBe(bed.bob);
      expect(updated.contributions).toEqual([
        { person: { id: bed.ada, name: 'Ada Test' }, value: 600 },
        { person: { id: bed.bob, name: 'Bob Test' }, value: 400 },
      ]);
    });

    it('takes each person’s best for a best value', async () => {
      const objective = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'max' },
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      await bed.tracking.addSession(objective.id, bed.bob, session(4));
      await bed.tracking.addSession(objective.id, bed.bob, session(3));
      const updated = await bed.tracking.addSession(
        objective.id,
        bed.ada,
        session(2),
      );

      expect(updated.contributions.map(({ value }) => value)).toEqual([4, 2]);
    });

    it('leaves out what was only planned, and accounts since deleted', async () => {
      const objective = await create({
        completion: 'metric',
        metric: { unit: 'km', target: 10, aggregation: 'sum' },
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      await bed.tracking.addSession(objective.id, bed.bob, session(4));
      await bed.dataSource.manager.delete(User, { id: bed.bob });

      const updated = await bed.tracking.addSession(objective.id, bed.ada, {
        ...session(1),
        status: 'planned',
        date: '2030-01-01',
      });

      expect(updated.contributions).toEqual([]);
      expect(updated.amount?.current).toBe(4);
    });

    it('has each person check in their own days, and full only when all have', async () => {
      const objective = await create({
        completion: 'habit',
        habitTargetDays: 2,
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      await bed.tracking.setCheckIn(objective.id, '2026-10-01', bed.ada, true);
      const adaDone = await bed.tracking.setCheckIn(
        objective.id,
        '2026-10-02',
        bed.ada,
        true,
      );
      expect(adaDone.percent).toBe(50);
      expect(adaDone.status).toBe('active');
      expect(adaDone.amount?.current).toBe(2);
      expect(adaDone.contributions).toEqual([
        { person: { id: bed.ada, name: 'Ada Test' }, value: 2 },
        { person: { id: bed.bob, name: 'Bob Test' }, value: 0 },
      ]);

      await bed.tracking.setCheckIn(objective.id, '2026-10-01', bed.bob, true);
      const both = await bed.tracking.setCheckIn(
        objective.id,
        '2026-10-02',
        bed.bob,
        true,
      );
      expect(both.status).toBe('completed');
      // Bob's own days, not the most advanced.
      expect(both.amount?.current).toBe(2);
    });

    it('reopens a complete habit when a contributor joins, and completes it when they leave', async () => {
      const objective = await create({
        completion: 'habit',
        habitTargetDays: 1,
      });
      const done = await bed.tracking.setCheckIn(
        objective.id,
        '2026-10-01',
        bed.ada,
        true,
      );
      expect(done.status).toBe('completed');

      const joined = await bed.members.add(objective.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });
      expect(joined).toMatchObject({ status: 'active', percent: 50 });

      const left = await bed.members.remove(objective.id, bed.bob, bed.ada);
      expect(left).toMatchObject({ status: 'completed', percent: 100 });
    });

    it('names no one on a habit who was invited higher and did nothing', async () => {
      const top = await create({ title: 'Haut', completion: 'children' });
      const habit = await create({
        parentId: top.id,
        completion: 'habit',
        habitTargetDays: 2,
      });
      await bed.members.add(top.id, bed.ada, {
        userId: bed.bob,
        role: 'contributor',
      });
      await bed.joinGroup(bed.cyd);
      await bed.members.add(habit.id, bed.ada, {
        userId: bed.cyd,
        role: 'contributor',
      });

      const seen = await bed.objectives.findOne(habit.id, bed.cyd);
      expect(seen.contributions.map(({ person }) => person.id).sort()).toEqual(
        [bed.ada, bed.cyd].sort(),
      );
      expect(JSON.stringify(seen)).not.toContain(bed.bob);
    });

    it('shows who completed each sub-objective', async () => {
      const top = await create({
        completion: 'children',
        children: ['Un', 'Deux', 'Trois'],
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      const [one, two] = top.children;
      await bed.tracking.setCompleted(one.id, bed.bob, { completed: true });
      await bed.tracking.setCompleted(two.id, bed.ada, { completed: true });

      const updated = await bed.objectives.findOne(top.id, bed.ada);

      expect(updated.children[0].completedBy?.id).toBe(bed.bob);
      expect(updated.children[1].completedBy?.id).toBe(bed.ada);
      expect(updated.children[2].completedBy).toBeNull();
      expect(updated.contributions.map(({ value }) => value)).toEqual([1, 1]);
    });

    it('has no contributions for a percentage set by hand', async () => {
      const objective = await create({
        completion: 'manual',
        members: [{ userId: bed.bob, role: 'contributor' }],
      });

      const updated = await bed.tracking.setProgress(objective.id, bed.bob, {
        percent: 50,
      });

      expect(updated.contributions).toEqual([]);
    });

    it('assigns a sub-objective to someone with access, and unassigns it', async () => {
      const top = await create({
        children: ['Un'],
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      const child = top.children[0];

      const assigned = await bed.objectives.update(child.id, bed.ada, {
        assignedToUserId: bed.bob,
      });
      expect(assigned.assignee).toEqual({ id: bed.bob, name: 'Bob Test' });

      const parent = await bed.objectives.findOne(top.id, bed.bob);
      expect(parent.children[0].assignee?.id).toBe(bed.bob);

      const unassigned = await bed.objectives.update(child.id, bed.ada, {
        assignedToUserId: null,
      });
      expect(unassigned.assignee).toBeNull();
    });

    it('refuses to assign someone without access', async () => {
      const top = await create({ children: ['Un'] });

      await expect(
        bed.objectives.update(top.children[0].id, bed.ada, {
          assignedToUserId: bed.bob,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('keeps assigning to the owner', async () => {
      const top = await create({
        children: ['Un'],
        members: [{ userId: bed.bob, role: 'viewer' }],
      });

      await expect(
        bed.objectives.update(top.children[0].id, bed.bob, {
          assignedToUserId: bed.bob,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
