import { ValidateIf } from 'class-validator';

/**
 * Like @IsOptional(), but only for a missing field: `null` is still validated
 * (and rejected) for fields that cannot be cleared. Use @IsOptional() where
 * null is a meaningful value, e.g. removing a reminder.
 */
export function IsOptionalButNotNull(): PropertyDecorator {
  return ValidateIf((_object, value) => value !== undefined);
}

/**
 * The fields a PATCH body actually sent. DTO instances define every declared
 * field (ES2022+ class fields), so absent ones are present as `undefined` and
 * would overwrite stored values if assigned as-is.
 */
export function sentFields<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const LIST_ICONS = [
  'cart',
  'home',
  'suitcase',
  'gift',
  'tools',
] as const;
export const LIST_MEMBER_ROLES = ['editor', 'viewer'] as const;
