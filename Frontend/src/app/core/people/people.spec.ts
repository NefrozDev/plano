import { NEW_PERSON_COLOR, createPerson, initialsOf, personColor, toPerson } from './people';

describe('people', () => {
  it('builds initials from the first letter of each non-empty part', () => {
    expect(initialsOf('ada', 'lovelace')).toBe('AL');
    expect(initialsOf('  Grace ')).toBe('G');
    expect(initialsOf('', 'Hopper')).toBe('H');
    expect(initialsOf('', '')).toBe('');
  });

  it('turns a user into an avatar with a colour stable for its id', () => {
    const ada = toPerson({ id: 'user-1', name: 'Ada King Lovelace' });

    expect(ada).toEqual({ id: 'user-1', name: 'Ada King Lovelace', initials: 'AL', color: personColor('user-1') });
    expect(toPerson({ id: 'user-2', name: 'Grace' }).initials).toBe('G');
    expect(personColor('user-1')).toBe(personColor('user-1'));
  });

  it('creates a person from a trimmed name, or null for a blank one', () => {
    const person = createPerson('  Alan Turing ');
    expect(person).toEqual({
      id: expect.any(String),
      name: 'Alan Turing',
      initials: 'A',
      color: NEW_PERSON_COLOR,
    });
    expect(createPerson('   ')).toBeNull();
  });
});
