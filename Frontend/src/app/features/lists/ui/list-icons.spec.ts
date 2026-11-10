import { t } from '../../../core/i18n/translate';
import { FIRST_LINE_SIZE, LIST_ICON_GROUPS, LIST_ICON_SHAPES } from './list-icons';

describe('list icon catalog', () => {
  const grouped = LIST_ICON_GROUPS.flatMap(({ icons }) => icons);

  it('offers way more than five icons, each drawn once under one theme', () => {
    expect(grouped.length).toBeGreaterThanOrEqual(40);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(LIST_ICON_SHAPES).sort());
  });

  it('names every icon differently and draws it', () => {
    const labels = Object.values(LIST_ICON_SHAPES).map(({ label }) => t(label));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.filter((label) => label.startsWith('lists.'))).toEqual([]);
    expect(t(LIST_ICON_SHAPES.cart.label)).toBe('Courses');
    for (const [icon, { paths }] of Object.entries(LIST_ICON_SHAPES)) {
      expect(paths.length, icon).toBeGreaterThan(0);
      expect(paths.every((path) => /^[Mm]/.test(path)), icon).toBe(true);
    }
  });

  it('keeps names that fit the database column', () => {
    expect(Object.keys(LIST_ICON_SHAPES).every((icon) => icon.length <= 16)).toBe(true);
  });

  it('starts with the everyday lists, the first line the editor shows', () => {
    expect(grouped.slice(0, FIRST_LINE_SIZE)).toEqual(['cart', 'basket', 'home', 'kitchen', 'cleaning']);
  });
});
