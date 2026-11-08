import type { Locale } from '@plano/common';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  locale: Locale;
  /** Null without a profile picture; versions the avatar URL otherwise. */
  avatarVersion: number | null;
  /** False until Plano's own terms are accepted on the welcome screen. */
  termsAccepted: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
