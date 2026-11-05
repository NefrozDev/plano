import type { ListIcon } from '@plano/common';
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

/** Items a settings resource remembers as recently opened. */
export const MAX_RECENT_IDS = 10;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** A `Record`, so a new `ListIcon` cannot be forgotten here: the API would refuse it. */
const KNOWN_ICONS: Record<ListIcon, true> = {
  cart: true,
  basket: true,
  home: true,
  kitchen: true,
  cleaning: true,
  laundry: true,
  plant: true,
  tools: true,
  key: true,
  food: true,
  apple: true,
  coffee: true,
  wine: true,
  cake: true,
  suitcase: true,
  plane: true,
  car: true,
  map: true,
  tent: true,
  beach: true,
  camera: true,
  gift: true,
  party: true,
  music: true,
  book: true,
  film: true,
  game: true,
  sport: true,
  bike: true,
  briefcase: true,
  laptop: true,
  pencil: true,
  school: true,
  idea: true,
  calendar: true,
  chart: true,
  pill: true,
  heart: true,
  baby: true,
  paw: true,
  wallet: true,
  piggy: true,
  star: true,
  flag: true,
  check: true,
  bell: true,
  phone: true,
};
export const LIST_ICONS = Object.keys(KNOWN_ICONS) as ListIcon[];
export const LIST_MEMBER_ROLES = ['editor', 'viewer'] as const;
