/** Languages of the interface; French is the source language. */
export const LOCALES = ['fr', 'en', 'nl', 'es', 'de', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

export interface UpdateProfileRequest {
  locale?: Locale;
}

/** Image formats accepted for profile pictures, detected from the file content. */
export type AvatarType = 'image/jpeg' | 'image/png' | 'image/webp';
