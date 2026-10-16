import { NEW_PERSON_COLOR, createPerson, initialsOf } from './people';

describe('people', () => {
  it('builds initials from the first letter of each non-empty part', () => {
    expect(initialsOf('ada', 'lovelace')).toBe('AL');
    expect(initialsOf('  Grace ')).toBe('G');
    expect(initialsOf('', 'Hopper')).toBe('H');
    expect(initialsOf('', '')).toBe('');
  });

  it('creates a person from a trimmed name, or null for a blank one', () => {
    const person = createPerson('  Alan Turing ');
    expect(person).toEqual({
      id: jasmine.any(String),
      name: 'Alan Turing',
      initials: 'A',
      color: NEW_PERSON_COLOR,
    });
    expect(createPerson('   ')).toBeNull();
  });
});
