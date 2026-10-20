import { createMockPlanoData, type AgendaEvent } from '@plano/common';
import {
  AgendaItem,
  addMinutes,
  coveredDates,
  eventColor,
  formatFileSize,
  formatTime,
  isSafeUrl,
  layoutDay,
  minutesBetween,
  nextOccurrence,
  occurrencesBetween,
  eventReminderLabel,
  timeRangeLabel,
} from './agenda.utils';

const agenda = createMockPlanoData().agenda;

function seeded(id: string): AgendaEvent {
  const event = agenda.events.find((item) => item.id === id);
  if (!event) throw new Error(`Missing seed event ${id}`);
  return event;
}

function custom(changes: Partial<AgendaEvent>): AgendaEvent {
  return { ...seeded('dejeuner'), ...changes };
}

function item(key: string, start: string, end: string, allDay = false): AgendaItem {
  return {
    key, kind: 'event', eventId: key, title: key, subtitle: '', color: '#000', allDay,
    start, end, participantIds: [], done: false, link: [], queryParams: {},
  };
}

describe('agenda utils', () => {
  describe('recurrence', () => {
    it('returns a one-off event only when it touches the range', () => {
      const lunch = seeded('dejeuner');
      expect(occurrencesBetween(lunch, '2026-10-12', '2026-10-18').length).toBe(1);
      expect(occurrencesBetween(lunch, '2026-10-16', '2026-10-31')).toEqual([]);
    });

    it('repeats weekly events from their first date, keeping the duration', () => {
      // "Sport" started on Thursday 1 October.
      expect(occurrencesBetween(seeded('sport'), '2026-10-12', '2026-10-25')).toEqual([
        { start: '2026-10-15T15:00', end: '2026-10-15T16:00' },
        { start: '2026-10-22T15:00', end: '2026-10-22T16:00' },
      ]);
      expect(occurrencesBetween(seeded('sport'), '2026-09-01', '2026-09-30')).toEqual([]);
    });

    it('repeats daily events', () => {
      const daily = custom({ start: '2026-10-10T08:00', end: '2026-10-10T08:30', recurrence: 'daily' });
      expect(occurrencesBetween(daily, '2026-10-14', '2026-10-16').map((occurrence) => occurrence.start)).toEqual([
        '2026-10-14T08:00', '2026-10-15T08:00', '2026-10-16T08:00',
      ]);
    });

    it('skips months without the day of a monthly event', () => {
      const monthly = custom({ start: '2026-01-31T09:00', end: '2026-01-31T10:00', recurrence: 'monthly' });
      expect(occurrencesBetween(monthly, '2026-01-01', '2026-05-31').map((occurrence) => occurrence.start)).toEqual([
        '2026-01-31T09:00', '2026-03-31T09:00', '2026-05-31T09:00',
      ]);
    });

    it('keeps 29 February birthdays on leap years only', () => {
      const yearly = custom({ start: '2024-02-29T00:00', end: '2024-02-29T23:59', recurrence: 'yearly', allDay: true });
      expect(occurrencesBetween(yearly, '2024-01-01', '2028-12-31').map((occurrence) => occurrence.start)).toEqual([
        '2024-02-29T00:00', '2028-02-29T00:00',
      ]);
    });

    it('includes multi-day events on every day they cover', () => {
      const trip = seeded('week-end-mer');
      expect(occurrencesBetween(trip, '2026-10-25', '2026-10-25').length).toBe(1);
      expect(coveredDates(trip)).toEqual(['2026-10-24', '2026-10-25']);
    });

    it('finds the next occurrence from a date', () => {
      expect(nextOccurrence(seeded('sport'), '2026-10-16')?.start).toBe('2026-10-22T15:00');
      expect(nextOccurrence(seeded('dentiste'), '2026-10-15')).toBeNull();
    });
  });

  describe('time', () => {
    it('does minute arithmetic across midnight', () => {
      expect(minutesBetween('2026-10-15T09:00', '2026-10-15T10:30')).toBe(90);
      expect(minutesBetween('2026-10-15T23:00', '2026-10-16T01:00')).toBe(120);
      expect(addMinutes('2026-10-15T23:30', 60)).toBe('2026-10-16T00:30');
    });

    it('formats hours in 24-hour or 12-hour style', () => {
      expect(formatTime('09:05', '24h')).toBe('09:05');
      expect(formatTime('09:05', '12h')).toBe('9:05 AM');
      expect(formatTime('00:00', '12h')).toBe('12:00 AM');
      expect(formatTime('13:30', '12h')).toBe('1:30 PM');
    });

    it('labels time ranges, all-day items and point-in-time tasks', () => {
      expect(timeRangeLabel({ allDay: false, start: '2026-10-15T09:00', end: '2026-10-15T10:30' }, '24h')).toBe('09:00 – 10:30');
      expect(timeRangeLabel({ allDay: true, start: '2026-10-16T00:00', end: '2026-10-16T23:59' }, '24h')).toBe('Toute la journée');
      expect(timeRangeLabel({ allDay: false, start: '2026-10-15T18:00', end: '2026-10-15T18:00' }, '24h')).toBe('18:00');
    });
  });

  it('lays overlapping events side by side', () => {
    const layout = layoutDay([
      item('a', '2026-10-15T09:00', '2026-10-15T10:00'),
      item('b', '2026-10-15T09:30', '2026-10-15T10:30'),
      item('c', '2026-10-15T11:00', '2026-10-15T12:00'),
      item('night', '2026-10-14T22:00', '2026-10-15T01:00'),
      item('all-day', '2026-10-15T00:00', '2026-10-15T23:59', true),
    ], '2026-10-15');
    const byKey = new Map(layout.map((entry) => [entry.item.key, entry]));

    expect(byKey.has('all-day')).toBe(false);
    expect(byKey.get('a')).toEqual(
      expect.objectContaining({ column: 0, columns: 2, top: 540, height: 60 }),
    );
    expect(byKey.get('b')).toEqual(expect.objectContaining({ column: 1, columns: 2 }));
    expect(byKey.get('c')).toEqual(expect.objectContaining({ column: 0, columns: 1 }));
    // An event started the day before is clamped to midnight.
    expect(byKey.get('night')).toEqual(expect.objectContaining({ top: 0, height: 60 }));
  });

  it('only accepts web links for conferences', () => {
    expect(isSafeUrl('https://meet.example.com/abc')).toBe(true);
    expect(isSafeUrl('http://intranet.local/visio')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('pas un lien')).toBe(false);
  });

  it('formats labels for reminders, file sizes and colours', () => {
    expect(eventReminderLabel(null)).toBe('Aucun');
    expect(eventReminderLabel(15)).toBe('15 minutes avant');
    expect(eventReminderLabel(45)).toBe('45 minutes avant');
    expect(formatFileSize(500)).toBe('500 o');
    expect(formatFileSize(245760)).toBe('240 Ko');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5,0 Mo');
    expect(eventColor(seeded('appel-camille'), agenda.calendars)).toBe('#f59e0b');
    expect(eventColor(seeded('courses'), agenda.calendars)).toBe('#22a95a');
    expect(eventColor(custom({ calendarId: 'unknown', color: null }), agenda.calendars)).toBe('#94a3b8');
  });
});
