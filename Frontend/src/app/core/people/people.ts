import { createId } from '../time/dates';

/** Shape shared by contacts, list members and avatar bubbles. */
export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
}

/** Colour of people added by hand, before they pick their own. */
export const NEW_PERSON_COLOR = '#6387ed';

/** First letter of each non-empty part, upper-cased: ('Ada', 'Lovelace') → 'AL'. */
export function initialsOf(...parts: readonly string[]): string {
  return parts.map((part) => part.trim().charAt(0)).join('').toUpperCase();
}

/** A person typed in by name, or null when the name is blank. */
export function createPerson(name: string): Person | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return {
    id: createId('contact'),
    name: trimmed,
    initials: initialsOf(trimmed),
    color: NEW_PERSON_COLOR,
  };
}
