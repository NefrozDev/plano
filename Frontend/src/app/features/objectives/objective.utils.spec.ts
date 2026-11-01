import { createMockPlanoData, type Objective } from '@plano/common';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDay,
  formatMonth,
  monthGrid,
  normalizeText,
} from '../../core/time/dates';
import {
  activityLabel,
  categoryMeta,
  dueCaption,
  formatDuration,
  longestStreak,
  objectiveReminderLabel,
  objectiveTint,
  progressText,
  sharingLabel,
  slugify,
  timelapseView,
  toImportRequest,
} from './objective.utils';
import { objectiveSummary } from './testing/objectives-fixtures';

function seeded(id: string): Objective {
  const objective = createMockPlanoData().objectives.items.find((item) => item.id === id);
  if (!objective) throw new Error(`Missing seed objective ${id}`);
  return objective;
}

describe('objective utils', () => {
  describe('dates', () => {
    it('does calendar arithmetic on local YYYY-MM-DD strings', () => {
      // Crossing a month end and the October DST change must not drift by a day.
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(daysBetween('2026-10-15', '2026-11-30')).toBe(46);
      expect(daysBetween('2026-10-15', '2026-10-10')).toBe(-5);
    });

    it('formats dates the French way', () => {
      expect(formatDate('2026-12-31')).toBe('31 déc. 2026');
      expect(formatDay('2026-10-15')).toBe('Jeu 15 octobre');
      expect(formatMonth(2026, 9)).toBe('Octobre 2026');
      expect(formatDuration(45)).toBe('45 min');
      expect(formatDuration(108)).toBe('1 h 48');
    });

    it('builds Monday-first month grids padded with neighbouring days', () => {
      const weeks = monthGrid(2026, 9);
      // October 2026 starts on a Thursday: Mon 28 → Wed 30 September pad the first week.
      expect(weeks[0].map((day) => day.day)).toEqual([28, 29, 30, 1, 2, 3, 4]);
      expect(weeks[0][0].inMonth).toBe(false);
      expect(weeks.every((week) => week.length === 7)).toBe(true);
      expect(weeks.at(-1)?.at(-1)?.date).toBe('2026-11-01');
    });

    it('measures the longest run of consecutive days, ignoring duplicates and order', () => {
      expect(longestStreak([])).toBe(0);
      expect(longestStreak(['2026-10-03', '2026-10-01', '2026-10-02', '2026-10-02', '2026-10-09'])).toBe(3);
    });
  });

  describe('labels', () => {
    it('falls back to the last category for an unknown one', () => {
      expect(categoryMeta('finance').label).toBe('Finances');
      expect(categoryMeta('nope' as never).value).toBe('other');
    });

    it('tints by category, or in the brand colour when turned off', () => {
      expect(objectiveTint('finance', true)).toBe('#e65591');
      expect(objectiveTint('finance', false)).toBe('#3264ed');
    });

    it('describes reminders', () => {
      expect(objectiveReminderLabel({ frequency: 'none', time: '09:00', weekday: 0 })).toBe('Aucun rappel');
      expect(objectiveReminderLabel({ frequency: 'daily', time: '07:30', weekday: 0 })).toBe('Chaque jour à 07:30');
      expect(objectiveReminderLabel({ frequency: 'weekly', time: '09:00', weekday: 2 })).toBe('Chaque mercredi à 09:00');
      expect(objectiveReminderLabel({ frequency: 'weekly', time: '09:00', weekday: 9 })).toBe('Chaque lundi à 09:00');
    });

    it('slugifies titles, with a fallback', () => {
      expect(slugify('  Économiser 1 000 € ! ')).toBe('economiser-1-000');
      expect(slugify('***')).toBe('objectif');
      expect(normalizeText('ÉTÉ')).toBe('ete');
    });
  });

  describe('activityLabel', () => {
    it.each([
      ['created', '', 'a créé l’objectif'],
      ['member_left', '', 'a quitté l’objectif'],
      ['session', '3 km · Sortie', 'a ajouté une séance : 3 km · Sortie'],
      ['session_removed', '', 'a retiré une séance'],
      ['check_in', '2026-10-05', 'a réussi le 5 oct. 2026'],
      ['check_out', '2026-10-05', 'a décoché le 5 oct. 2026'],
      ['progress', '40', 'a avancé à 40 %'],
      ['member_added', 'Bob Martin', 'a invité Bob Martin'],
      ['assigned', 'Bob Martin', 'a assigné à Bob Martin'],
      ['restarted', '', 'a relancé une nouvelle période'],
    ] as const)('words %s', (kind, detail, label) => {
      expect(activityLabel({ kind, detail })).toBe(label);
    });
  });

  describe('progressText', () => {
    it('is empty without a completion bar', () => {
      expect(progressText(objectiveSummary(), true)).toBe('');
    });

    it('shows a percentage, or the amount when asked to', () => {
      const objective = objectiveSummary({ percent: 65, amount: { current: 6.5, target: 10, unit: 'km' } });
      expect(progressText(objective, true)).toBe('65 %');
      expect(progressText(objective, false)).toBe('6,5 / 10 km');
    });

    it('falls back to the percentage for bars without an amount', () => {
      expect(progressText(objectiveSummary({ percent: 40 }), false)).toBe('40 %');
    });
  });

  describe('sharingLabel', () => {
    it('stays empty for a private objective', () => {
      expect(sharingLabel(objectiveSummary())).toBe('');
    });

    it('tells the owner how it is shared', () => {
      expect(sharingLabel(objectiveSummary({ sharing: 'shared' }))).toBe('Partagé');
      expect(sharingLabel(objectiveSummary({ sharing: 'common' }))).toBe('Commun');
    });

    it('tells others whose it is', () => {
      expect(sharingLabel(objectiveSummary({ role: 'viewer', sharing: 'shared' }))).toBe('Par Ada Lovelace');
    });

    it('adds who it is for', () => {
      expect(
        sharingLabel(objectiveSummary({ sharing: 'common', assignee: { id: 'b', name: 'Bob Martin' } })),
      ).toBe('Commun · Pour Bob Martin');
    });
  });

  describe('dueCaption', () => {
    it('gives the deadline, the absence of one, or the day it was completed', () => {
      expect(dueCaption(objectiveSummary({ dueDate: '2026-11-30' }))).toBe('Échéance : 30 nov. 2026');
      expect(dueCaption(objectiveSummary())).toBe('Sans échéance');
      expect(
        dueCaption(objectiveSummary({ status: 'completed', dueDate: '2026-11-30', completedAt: '2026-08-30T12:00:00.000Z' })),
      ).toBe('Terminé le 30 août 2026');
      expect(
        dueCaption(
          objectiveSummary({
            status: 'completed',
            completedAt: '2026-08-30T12:00:00.000Z',
            completedBy: { id: 'b', name: 'Bob Martin' },
          }),
        ),
      ).toBe('Terminé le 30 août 2026 par Bob Martin');
    });
  });

  describe('timelapseView', () => {
    const bar = (changes: Parameters<typeof objectiveSummary>[0]) =>
      objectiveSummary({ timelapse: 'elapsed', startDate: '2026-10-01', dueDate: '2026-10-11', ...changes });

    it('has no bar when turned off or without a deadline', () => {
      expect(timelapseView(bar({ timelapse: 'off' }), '2026-10-05')).toBeNull();
      expect(timelapseView(bar({ dueDate: null }), '2026-10-05')).toBeNull();
    });

    it('fills up with the time elapsed', () => {
      expect(timelapseView(bar({}), '2026-10-01')).toEqual({ percent: 0, label: '10 jours restants', overdue: false });
      expect(timelapseView(bar({}), '2026-10-06')).toEqual({ percent: 50, label: '5 jours restants', overdue: false });
    });

    it('starts full and empties when reversed', () => {
      expect(timelapseView(bar({ timelapse: 'remaining' }), '2026-10-01')?.percent).toBe(100);
      expect(timelapseView(bar({ timelapse: 'remaining' }), '2026-10-06')?.percent).toBe(50);
      expect(timelapseView(bar({ timelapse: 'remaining' }), '2026-10-11')?.percent).toBe(0);
    });

    it('counts one day in the singular, and names the last one', () => {
      expect(timelapseView(bar({}), '2026-10-10')?.label).toBe('1 jour restant');
      expect(timelapseView(bar({}), '2026-10-11')?.label).toBe('Dernier jour');
    });

    it('stays empty before the start', () => {
      expect(timelapseView(bar({}), '2026-09-25')?.percent).toBe(0);
    });

    it('turns overdue past the deadline, full whichever the direction', () => {
      for (const timelapse of ['elapsed', 'remaining'] as const) {
        expect(timelapseView(bar({ timelapse }), '2026-10-13')).toEqual({
          percent: 100,
          label: '2 jours de retard',
          overdue: true,
        });
      }
      expect(timelapseView(bar({}), '2026-10-12')?.label).toBe('1 jour de retard');
    });

    it('is never late once complete', () => {
      expect(timelapseView(bar({ status: 'completed' }), '2026-10-20')).toEqual({
        percent: 100,
        label: 'Terminé',
        overdue: false,
      });
    });

    it('copes with a deadline on the start day', () => {
      expect(timelapseView(bar({ dueDate: '2026-10-01' }), '2026-10-01')).toEqual({
        percent: 0,
        label: 'Dernier jour',
        overdue: false,
      });
    });
  });

  describe('toImportRequest', () => {
    const today = '2026-10-15';

    it('maps a numeric objective, leaving out what was made up in the browser', () => {
      const request = toImportRequest(seeded('courir-10-km'), today);

      expect(request).toMatchObject({
        localId: 'courir-10-km',
        title: 'Courir 10 km',
        tracking: 'metric',
        createdOn: '2026-09-14',
        metric: { unit: 'km', target: 10, aggregation: 'max' },
        steps: [],
        habit: null,
      });
      expect(request.sessions[0]).toEqual({
        date: '2026-09-21',
        status: 'done',
        label: 'Sortie 3 km',
        value: 3,
        durationMinutes: 20,
      });
      expect(request).not.toHaveProperty('sharedWith');
      expect(request).not.toHaveProperty('shareCode');
      expect(request).not.toHaveProperty('ownerId');
    });

    it('maps steps and habits', () => {
      const steps = toImportRequest(seeded('apprendre-italien'), today);
      expect(steps.steps[0]).toMatchObject({ label: 'Apprendre 100 mots', done: true });
      expect(steps.metric).toBeNull();

      const habit = toImportRequest(seeded('mediter-30-min'), today);
      expect(habit.habit?.targetDays).toBeGreaterThan(0);
      expect(habit.habit?.checkIns.length).toBeGreaterThan(0);
    });

    it('makes valid what old data may hold, so one objective never blocks the others', () => {
      const broken = {
        ...seeded('courir-10-km'),
        id: '',
        title: `  ${'x'.repeat(100)}  `,
        createdOn: 'hier',
        dueDate: '30/11/2026',
        completedOn: '',
        description: 'd'.repeat(600),
        plan: 'p'.repeat(200),
        metric: { unit: '', target: 0, aggregation: 'sum', sessionsTarget: 0 },
        reminder: undefined,
        dueReminder: undefined,
        sessions: [
          { id: 's1', date: 'jamais', status: 'done', label: 'Sans date', value: 1 },
          { id: 's2', date: '2026-10-01', status: 'done', label: 'l'.repeat(80), value: -3 },
        ],
      } as unknown as Objective;

      const request = toImportRequest(broken, today);

      expect(request.title).toHaveLength(80);
      expect(request.localId).toBe('x'.repeat(100));
      expect(request.createdOn).toBe(today);
      expect(request.dueDate).toBeNull();
      expect(request.completedOn).toBeNull();
      expect(request.description).toHaveLength(500);
      expect(request.plan).toHaveLength(120);
      expect(request.metric).toEqual({ unit: '-', target: 1, aggregation: 'sum' });
      expect(request.reminder).toEqual({ frequency: 'none', time: '09:00', weekday: 0 });
      expect(request.dueReminder).toBe('none');
      expect(request.sessions).toEqual([
        { date: '2026-10-01', status: 'done', label: 'l'.repeat(60), value: 0, durationMinutes: null },
      ]);
    });

    it('never sends a blank title or step', () => {
      const request = toImportRequest(
        {
          ...seeded('apprendre-italien'),
          title: '   ',
          steps: [
            { id: 'a', label: '  ', done: false, completedOn: null },
            { id: 'b', label: ' Un ', done: false, completedOn: 'hier' },
          ],
        },
        today,
      );

      expect(request.title).toBe('Objectif');
      expect(request.steps).toEqual([{ label: 'Un', done: false, completedOn: null }]);
    });

    it('gives a habit without settings a valid target', () => {
      const request = toImportRequest({ ...seeded('mediter-30-min'), habit: null }, today);

      expect(request.habit).toEqual({ targetDays: 1, checkIns: [] });
    });
  });
});
