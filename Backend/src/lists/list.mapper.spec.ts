import type { User } from '../users/user.entity';
import type { ListEntry } from './entities/list-entry.entity';
import type { ListSection } from './entities/list-section.entity';
import { displayName, toEntryResponse, toSectionResponse } from './list.mapper';

describe('list mapper', () => {
  const author = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
  } as User;
  const entry = (overrides: Partial<ListEntry> = {}): ListEntry =>
    ({
      id: 'entry-1',
      name: 'Lait',
      done: false,
      highlighted: true,
      addedBy: author,
      createdAt: new Date('2030-01-02T03:04:05.000Z'),
      assignedToUserId: 'user-2',
      reminder: '2030-01-03T18:00',
      notes: 'Demi-écrémé',
      ...overrides,
    }) as ListEntry;

  it('names people by full name, or by username when both names are blank', () => {
    expect(displayName(author)).toBe('Ada Lovelace');
    expect(displayName({ ...author, lastName: '' })).toBe('Ada');
    expect(displayName({ ...author, firstName: ' ', lastName: '' })).toBe(
      'ada',
    );
  });

  it('maps an entry to the API shape, with an ISO creation date', () => {
    expect(toEntryResponse(entry())).toEqual({
      id: 'entry-1',
      name: 'Lait',
      done: false,
      highlighted: true,
      addedBy: 'Ada Lovelace',
      addedAt: '2030-01-02T03:04:05.000Z',
      assignedTo: 'user-2',
      reminder: '2030-01-03T18:00',
      notes: 'Demi-écrémé',
    });
  });

  it('keeps entries whose author account was deleted', () => {
    expect(toEntryResponse(entry({ addedBy: null })).addedBy).toBe(
      'Compte supprimé',
    );
  });

  it('maps a section with its entries in the given order', () => {
    const section = {
      id: 'section-1',
      name: 'Frais',
      color: '#2ecb70',
    } as ListSection;

    const response = toSectionResponse(section, [
      entry({ id: 'b' }),
      entry({ id: 'a' }),
    ]);

    expect(response).toEqual({
      id: 'section-1',
      name: 'Frais',
      color: '#2ecb70',
      entries: [
        expect.objectContaining({ id: 'b' }),
        expect.objectContaining({ id: 'a' }),
      ],
    });
  });
});
