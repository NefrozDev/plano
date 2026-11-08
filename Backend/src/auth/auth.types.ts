import type { Locale } from '@plano/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  locale: Locale;
  /** Null without a profile picture; see PublicUser.avatarVersion. */
  avatarVersion: number | null;
  /** False until Plano's own terms are accepted, on its first screen. */
  termsAccepted: boolean;
}

export type AuthenticatedRequest = Omit<Request, 'cookies'> & {
  cookies: Record<string, string | undefined>;
  authUser?: AuthUser;
};

export interface IssuedAuthentication {
  token: string;
  expiresAt: Date;
  user: AuthUser;
}
