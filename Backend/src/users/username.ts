/**
 * Usernames and e-mails compare case-insensitively: Plano stores this form
 * next to the copy the Synapse identity service sends, which owns the rules.
 */
export function normalizeIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
