import type { Locale, PublicUser } from '@plano/common';
import type { AuthUser } from '../auth/auth.types';
import type { User } from './user.entity';

/** Runtime copy of LOCALES from @plano/common, which the API may only import types from. */
export const SUPPORTED_LOCALES = [
  'fr',
  'en',
  'nl',
  'es',
  'de',
  'it',
] as const satisfies readonly Locale[];

export function avatarVersion(
  user: Pick<User, 'avatarUpdatedAt'>,
): number | null {
  return user.avatarUpdatedAt?.getTime() ?? null;
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    locale: user.locale,
    avatarVersion: avatarVersion(user),
  };
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarVersion: avatarVersion(user),
  };
}
