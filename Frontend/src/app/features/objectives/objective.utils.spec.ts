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
  categoryMeta,
  formatDuration,
  longestStreak,
  metricCurrent,
  objectiveProgress,
  objectiveTint,
  progressLabel,
  objectiveReminderLabel,
  slugify,
  withDerivedStatus,
} from './objective.utils';

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

  describe('progress', () => {
    it('keeps the best session for "max" metrics and adds sessions for "sum" metrics', () => {
      // Only sessions with status "done" count; planned 7–8 km runs are ignored.
      expect(metricCurrent(seeded('courir-10-km'))).toBe(6.5);
      expect(metricCurrent(seeded('economiser-1000'))).toBe(450);
      expect(objectiveProgress(seeded('courir-10-km'))).toBe(65);
    });

    it('derives progress from steps and habit check-ins', () => {
      expect(objectiveProgress(seeded('apprendre-italien'))).toBe(40);
      expect(progressLabel(seeded('apprendre-italien'))).toBe('2 / 5 étapes');
      expect(objectiveProgress(seeded('mediter-30-jours'))).toBe(100);
    });

    it('caps progress at 100 % and treats a missing target as 0 %', () => {
      const overDone = { ...seeded('economiser-1000'), metric: { unit: '€', target: 100, aggregation: 'sum' as const, sessionsTarget: 0 } };
      expect(objectiveProgress(overDone)).toBe(100);
      expect(objectiveProgress({ ...seeded('apprendre-italien'), steps: [] })).toBe(0);
    });

    it('completes, reopens or leaves objectives depending on their progress', () => {
      const run = seeded('courir-10-km');
      const finished = { ...run, sessions: [...run.sessions, { id: 'x', date: '2026-10-15', status: 'done' as const, value: 10, label: '' }] };

      expect(withDerivedStatus(finished, '2026-10-15')).toEqual(
        expect.objectContaining({ status: 'completed', completedOn: '2026-10-15' }),
      );
      expect(
        withDerivedStatus({ ...run, status: 'completed', completedOn: '2026-10-01' }, '2026-10-15'),
      ).toEqual(expect.objectContaining({ status: 'active', completedOn: null }));
      // A paused objective is never auto-completed.
      expect(withDerivedStatus({ ...finished, status: 'paused' }, '2026-10-15').status).toBe(
        'paused',
      );
      // A paused objective is never auto-completed.
      expect(withDerivedStatus({ ...finished, status: 'paused' }, '2026-10-15').status).toBe('paused');
      expect(withDerivedStatus(run, '2026-10-15')).toBe(run);
    });
  });

  describe('labels', () => {
    it('describes reminders in French', () => {
      expect(objectiveReminderLabel({ frequency: 'none', time: '09:00', weekday: 0 })).toBe('Aucun rappel');
      expect(objectiveReminderLabel({ frequency: 'daily', time: '08:00', weekday: 0 })).toBe('Chaque jour à 08:00');
      expect(objectiveReminderLabel({ frequency: 'weekly', time: '09:00', weekday: 0 })).toBe('Chaque lundi à 09:00');
    });

    it('normalizes text for search and slugs', () => {
      expect(normalizeText('  Économiser ')).toBe('economiser');
      expect(slugify('Apprendre l’italien !')).toBe('apprendre-l-italien');
      expect(slugify('!!!')).toBe('objectif');
    });

    it('falls back to the brand colour when category colours are off', () => {
      expect(objectiveTint('finance', true)).toBe(categoryMeta('finance').color);
      expect(objectiveTint('finance', false)).toBe('#3264ed');
    });
  });
});
