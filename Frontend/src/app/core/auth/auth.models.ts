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
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
  /** The interface language at registration, kept as the account's language. */
  locale?: Locale;
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
