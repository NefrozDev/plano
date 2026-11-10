import { createId } from '../time/dates';

/** Shape shared by contacts, list members and avatar bubbles. */
export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** Their profile picture, when they are a real user who has one. */
  avatarVersion?: number | null;
}

/** Colour of people added by hand, before they pick their own. */
export const NEW_PERSON_COLOR = '#5371c5';

/** First letter of each non-empty part, upper-cased: ('Ada', 'Lovelace') → 'AL'. */
export function initialsOf(...parts: readonly string[]): string {
  return parts.map((part) => part.trim().charAt(0)).join('').toUpperCase();
}

// Dark enough for white initials (4.5:1 at least).
const PERSON_COLORS = ['#a76142', '#a66356', '#3d6f83', '#5371c5', '#7a5bec', '#1e854d', '#c04a7e', '#a6661e'];

/** A stable colour for a user id, so someone keeps their colour across screens. */
export function personColor(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PERSON_COLORS[hash % PERSON_COLORS.length];
}

/** Avatar of a real user known by id and full name: 'Ada Lovelace' → 'AL'. */
export function toPerson({
  id,
  name,
  avatarVersion,
}: {
  id: string;
  name: string;
  avatarVersion?: number | null;
}): Person {
  const words = name.trim().split(/\s+/);
  return {
    id,
    name,
    initials: initialsOf(words[0] ?? '', words.length > 1 ? words[words.length - 1] : ''),
    color: personColor(id),
    avatarVersion,
  };
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
