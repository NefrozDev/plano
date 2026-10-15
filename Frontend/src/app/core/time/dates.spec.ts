import { createId, formatLongDay, isoWeekNumber, monthGrid, startOfWeek } from './dates';

describe('date helpers', () => {
  it('finds the first day of the week for Monday- and Sunday-first calendars', () => {
    expect(startOfWeek('2026-10-15', 1)).toBe('2026-10-12');
    expect(startOfWeek('2026-10-15', 0)).toBe('2026-10-11');
    expect(startOfWeek('2026-10-12', 1)).toBe('2026-10-12');
  });

  it('computes ISO week numbers, including years with 53 weeks', () => {
    expect(isoWeekNumber('2026-10-15')).toBe(42);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    // 2026 starts on a Thursday, so it has a week 53 that spills into 2027.
    expect(isoWeekNumber('2027-01-01')).toBe(53);
  });

  it('builds Sunday-first month grids', () => {
    const weeks = monthGrid(2026, 9, 0);

    expect(weeks[0].map((day) => day.day)).toEqual([27, 28, 29, 30, 1, 2, 3]);
    expect(weeks.every((week) => week.length === 7)).toBeTrue();
  });

  it('formats long French day labels', () => {
    expect(formatLongDay('2026-10-15')).toBe('Jeudi 15 octobre');
  });

  it('defaults to Monday-first weeks and creates prefixed ids', () => {
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(monthGrid(2026, 9)[0][0].date).toBe('2026-09-28');
    expect(createId('event')).toMatch(/^event-[\w-]+$/);
  });

  it('falls back to a time-based id where crypto.randomUUID is unavailable (non-HTTPS pages)', () => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(createId('file')).toMatch(/^file-[a-z0-9]+$/);
    } finally {
      // Remove the own property so the prototype method is visible again.
      delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
    }
    expect(typeof globalThis.crypto.randomUUID).toBe('function');
  });
});
