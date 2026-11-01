import { ObjectiveAgendaService } from './objective-agenda.service';
import {
  createObjectivesTestBed,
  objectiveDetails,
  type ObjectivesTestBed,
} from './testing/objectives-test-bed';

describe('ObjectiveAgendaService', () => {
  let bed: ObjectivesTestBed;
  let agenda: ObjectiveAgendaService;

  beforeEach(async () => {
    bed = await createObjectivesTestBed();
    agenda = bed.agenda;
  });

  afterEach(() => bed.destroy());

  const metric = {
    completion: 'metric' as const,
    metric: { unit: 'km', target: 10, aggregation: 'sum' as const },
  };

  it('is empty without objectives', async () => {
    expect(await agenda.find(bed.ada)).toEqual([]);
  });

  it('lists planned sessions, not the others', async () => {
    const objective = await bed.objectives.create(
      bed.ada,
      objectiveDetails(metric),
    );
    for (const [status, label] of [
      ['planned', 'Sortie longue'],
      ['planned', ''],
      ['done', 'Faite'],
      ['missed', 'Ratée'],
    ] as const) {
      await bed.tracking.addSession(objective.id, bed.ada, {
        date: '2026-10-03',
        status,
        label,
        value: 1,
      });
    }

    const items = await agenda.find(bed.ada);

    expect(items.map(({ kind, label }) => [kind, label])).toEqual(
      expect.arrayContaining([
        ['session', 'Sortie longue'],
        // Without a label, the session goes by its objective's title.
        ['session', 'Courir'],
      ]),
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      objectiveId: objective.id,
      objectiveTitle: 'Courir',
      category: 'health',
      date: '2026-10-03',
      key: expect.stringMatching(/^session:/) as string,
    });
  });

  it('lists the deadline of what is still open, sub-objectives included', async () => {
    const top = await bed.objectives.create(
      bed.ada,
      objectiveDetails({ title: 'Haut', dueDate: '2026-12-01' }),
    );
    const child = await bed.objectives.create(
      bed.ada,
      objectiveDetails({
        title: 'Bas',
        parentId: top.id,
        dueDate: '2026-11-01',
      }),
    );

    expect(await agenda.find(bed.ada)).toEqual([
      {
        kind: 'deadline',
        key: `deadline:${top.id}`,
        objectiveId: top.id,
        objectiveTitle: 'Haut',
        category: 'health',
        date: '2026-12-01',
        label: 'Haut',
      },
      {
        kind: 'deadline',
        key: `deadline:${child.id}`,
        objectiveId: child.id,
        objectiveTitle: 'Bas',
        category: 'health',
        date: '2026-11-01',
        label: 'Bas',
      },
    ]);
  });

  it('leaves out deadlines that no longer matter', async () => {
    const done = await bed.objectives.create(
      bed.ada,
      objectiveDetails({ dueDate: '2026-12-01' }),
    );
    await bed.tracking.setCompleted(done.id, bed.ada, { completed: true });
    const paused = await bed.objectives.create(
      bed.ada,
      objectiveDetails({ dueDate: '2026-12-01' }),
    );
    await bed.objectives.update(paused.id, bed.ada, { paused: true });
    await bed.objectives.create(bed.ada, objectiveDetails());

    expect(await agenda.find(bed.ada)).toEqual([]);
  });

  it('leaves out an archived objective and everything below it', async () => {
    const top = await bed.objectives.create(
      bed.ada,
      objectiveDetails({ dueDate: '2026-12-01' }),
    );
    const child = await bed.objectives.create(
      bed.ada,
      objectiveDetails({ ...metric, parentId: top.id }),
    );
    await bed.tracking.addSession(child.id, bed.ada, {
      date: '2026-10-03',
      status: 'planned',
      label: 'Sortie',
      value: 1,
    });
    await bed.objectives.update(top.id, bed.ada, { archived: true });

    expect(await agenda.find(bed.ada)).toEqual([]);
  });

  it('shows nothing of other people', async () => {
    await bed.objectives.create(
      bed.bob,
      objectiveDetails({ dueDate: '2026-12-01' }),
    );

    expect(await agenda.find(bed.ada)).toEqual([]);
  });
});
