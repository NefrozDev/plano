import type { Contact } from '@plano/common';

/** A contact as GET /contacts returns it, with sensible defaults. */
export const contact = (id: string, firstName: string, changes: Partial<Contact> = {}): Contact => ({
  id,
  firstName,
  lastName: 'Test',
  username: firstName.toLowerCase(),
  avatarVersion: null,
  friend: false,
  groups: [],
  ...changes,
});
const family = { id: 'group-family', name: 'Famille proche' };
const work = { id: 'group-work', name: 'Travail' };
/** As GET /contacts answers: sorted by name, friends and group mates mixed. */
export const CONTACTS: Contact[] = [
  contact('user-bob', 'Bob', { friend: true, groups: [work] }),
  contact('user-chloe', 'Chloé', { groups: [family] }),
  contact('user-dan', 'Dan', { groups: [work, family] }),
  contact('user-eve', 'Eve', { friend: true }),
];
