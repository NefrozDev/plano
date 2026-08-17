import type { Request } from 'express';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
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
