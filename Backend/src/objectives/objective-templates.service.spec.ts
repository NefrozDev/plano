import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ObjectiveTemplate } from './entities/objective-template.entity';
import { MAX_TEMPLATES } from './objective-templates.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('ObjectiveTemplatesService', () => {
  let bed: ObjectivesTestBed;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
  });

  afterEach(() => bed.destroy());

  const create = (changes = {}, userId = bed.ada) =>
    bed.objectives.create(userId, objectiveDetails(changes));
  const structure = (id: string) =>
    bed.dataSource.manager.findOneByOrFail(ObjectiveTemplate, { id });

  it('saves the structure, and counts what it holds', async () => {
    const top = await create({
      title: 'Voyage',
      completion: 'children',
      children: ['Réserver', 'Partir'],
    });

    const template = await bed.templates.save(top.id, bed.ada, {
      name: 'Un voyage',
    });

    expect(template).toEqual({
      id: expect.any(String) as string,
      name: 'Un voyage',
      nodeCount: 3,
    });
    expect(await bed.templates.findAll(bed.ada)).toEqual([template]);
  });

  it('copies settings, never progress or people', async () => {
    const objective = await create({
      completion: 'metric',
      metric: { unit: 'km', target: 10, aggregation: 'sum' },
      description: 'Une fois',
      plan: 'Souvent',
      startDate: '2026-10-01',
      dueDate: '2026-10-31',
      timelapse: 'remaining',
      recurrence: 'monthly',
      members: [{ userId: bed.bob, role: 'contributor' }],
    });
    await bed.tracking.addSession(objective.id, bed.ada, {
      date: '2026-10-02',
      status: 'done',
      label: 'Secret',
      value: 4,
    });

    const { id } = await bed.templates.save(objective.id, bed.ada, {
      name: 'Modèle',
    });

    const { structure: saved } = await structure(id);
    expect(saved).toEqual({
      title: 'Courir',
      category: 'health',
      description: 'Une fois',
      plan: 'Souvent',
      completion: 'metric',
      metric: { unit: 'km', target: 10, aggregation: 'sum' },
      habitTargetDays: null,
      timelapse: 'remaining',
      durationDays: 30,
      weight: 1,
      recurrence: 'monthly',
      children: [],
    });
    expect(JSON.stringify(saved)).not.toContain('Secret');
    expect(JSON.stringify(saved)).not.toContain(bed.bob);
  });

  it('leaves out archived sub-objectives', async () => {
    const top = await create({ children: ['Garde', 'Range'] });
    await bed.objectives.update(top.children[1].id, bed.ada, {
      archived: true,
    });

    const { nodeCount } = await bed.templates.save(top.id, bed.ada, {
      name: 'Modèle',
    });

    expect(nodeCount).toBe(2);
  });

  it('saves from what the person can open, and nothing more', async () => {
    const top = await create({ title: 'Haut', children: ['Branche', 'Autre'] });
    const branch = top.children[0];
    await bed.members.add(branch.id, bed.ada, {
      userId: bed.bob,
      role: 'viewer',
    });

    const { id } = await bed.templates.save(branch.id, bed.bob, {
      name: 'À moi',
    });
    expect((await structure(id)).structure.title).toBe('Branche');

    await expect(
      bed.templates.save(top.id, bed.bob, { name: 'Volé' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('keeps a person’s templates to themselves', async () => {
    const objective = await create();
    const { id } = await bed.templates.save(objective.id, bed.ada, {
      name: 'Modèle',
    });

    expect(await bed.templates.findAll(bed.bob)).toEqual([]);
    await expect(
      bed.templates.use(id, bed.bob, { startDate: '2026-10-01' }),
    ).rejects.toThrow(NotFoundException);
    await expect(bed.templates.remove(id, bed.bob)).rejects.toThrow(
      NotFoundException,
    );
    expect(await bed.templates.findAll(bed.ada)).toHaveLength(1);
  });

  it('stops at a limit', async () => {
    const objective = await create();
    await bed.dataSource.manager.insert(
      ObjectiveTemplate,
      Array.from({ length: MAX_TEMPLATES }, () => ({
        id: randomUUID(),
        ownerId: bed.ada,
        name: 'Modèle',
        structure: () => `'{"children":[]}'`,
      })),
    );

    await expect(
      bed.templates.save(objective.id, bed.ada, { name: 'De trop' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('deletes a template, not what was made from it', async () => {
    const objective = await create();
    const { id } = await bed.templates.save(objective.id, bed.ada, {
      name: 'Modèle',
    });
    const made = await bed.templates.use(id, bed.ada, {
      startDate: '2026-10-01',
    });

    await bed.templates.remove(id, bed.ada);

    expect(await bed.templates.findAll(bed.ada)).toEqual([]);
    expect(await bed.objectives.findOne(made.id, bed.ada)).toBeDefined();
    await expect(bed.templates.remove(id, bed.ada)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('using a template', () => {
    it('makes a new private objective with the whole tree, at zero', async () => {
      const top = await create({
        title: 'Voyage',
        completion: 'children',
        category: 'other',
        startDate: '2026-01-01',
        members: [{ userId: bed.bob, role: 'contributor' }],
      });
      const step = await create({
        title: 'Épargner',
        parentId: top.id,
        completion: 'metric',
        metric: { unit: '€', target: 500, aggregation: 'sum' },
        weight: 3,
        startDate: '2026-01-01',
        dueDate: '2026-01-11',
      });
      await bed.tracking.addSession(step.id, bed.ada, {
        date: '2026-01-02',
        status: 'done',
        label: '',
        value: 500,
      });
      await create({
        title: 'Partir',
        parentId: top.id,
        startDate: '2026-01-01',
      });
      const { id } = await bed.templates.save(top.id, bed.ada, {
        name: 'Modèle',
      });

      const made = await bed.templates.use(id, bed.ada, {
        startDate: '2026-11-01',
      });

      expect(made.id).not.toBe(top.id);
      expect(made).toMatchObject({
        title: 'Voyage',
        category: 'other',
        completion: 'children',
        percent: 0,
        status: 'active',
        startDate: '2026-11-01',
        sharing: 'private',
        parentId: null,
        childCount: 2,
        sessions: [],
      });
      expect(made.children.map(({ title }) => title)).toEqual([
        'Épargner',
        'Partir',
      ]);
      const child = await bed.objectives.findOne(made.children[0].id, bed.ada);
      expect(child).toMatchObject({
        weight: 3,
        percent: 0,
        metric: { unit: '€', target: 500, aggregation: 'sum' },
        // As long after its start as the original was.
        dueDate: '2026-11-11',
        breadcrumb: [{ id: made.id, title: 'Voyage' }],
      });
    });

    it('nests below the top', async () => {
      const top = await create({ title: 'Un' });
      const two = await create({ title: 'Deux', parentId: top.id });
      await create({ title: 'Trois', parentId: two.id });
      const { id } = await bed.templates.save(top.id, bed.ada, {
        name: 'Modèle',
      });

      const made = await bed.templates.use(id, bed.ada, {
        startDate: '2026-11-01',
      });

      expect(made.descendantCount).toBe(2);
    });

    it('keeps the recurrence, starting the first period that day', async () => {
      const objective = await create({
        recurrence: 'weekly',
        startDate: '2026-01-01',
      });
      const { id } = await bed.templates.save(objective.id, bed.ada, {
        name: 'Modèle',
      });

      const made = await bed.templates.use(id, bed.ada, {
        startDate: '2099-01-01',
      });

      expect(made.recurrence).toBe('weekly');
      expect(made.periods).toEqual([]);
    });

    it('saves a sub-objective as a top-level structure', async () => {
      const top = await create({ children: ['Branche'] });
      const { id } = await bed.templates.save(top.children[0].id, bed.ada, {
        name: 'Modèle',
      });

      const made = await bed.templates.use(id, bed.ada, {
        startDate: '2026-11-01',
      });

      expect(made).toMatchObject({ title: 'Branche', parentId: null });
      expect(
        (await bed.objectives.findAll(bed.ada)).map(({ id: top2 }) => top2),
      ).toContain(made.id);
    });

    it('turns a timelapse off when there was no deadline', async () => {
      const objective = await create({ dueDate: '2026-12-01' });
      const { id } = await bed.templates.save(objective.id, bed.ada, {
        name: 'Modèle',
      });

      const made = await bed.templates.use(id, bed.ada, {
        startDate: '2026-11-01',
      });

      expect(made).toMatchObject({ timelapse: 'off' });
      expect(made.dueDate).not.toBeNull();
    });

    it('answers 404 for an unknown template', async () => {
      await expect(
        bed.templates.use(randomUUID(), bed.ada, { startDate: '2026-11-01' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
