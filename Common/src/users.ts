/** Languages of the interface; French is the source language. */
export const LOCALES = ['fr', 'en', 'nl', 'es', 'de', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

export interface UpdateProfileRequest {
  locale?: Locale;
  /** 3 to 30 letters, numbers, dots, underscores or hyphens; stored lower case. */
  username?: string;
}

/** POST /auth/password-reset: always answered with 204, account or not. */
export interface PasswordResetRequest {
  email: string;
}

/** POST /auth/password-reset/confirm, with the token from the e-mailed link. */
export interface ConfirmPasswordResetRequest {
  token: string;
  password: string;
}

export interface UsernameAvailability {
  available: boolean;
}

/** Image formats accepted for profile pictures, detected from the file content. */
export type AvatarType = 'image/jpeg' | 'image/png' | 'image/webp';
