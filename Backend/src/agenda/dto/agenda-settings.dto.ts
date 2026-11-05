import type {
  AgendaUserSettings,
  UpdateAgendaUserSettingsRequest,
} from '@plano/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsTimeZone,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateBy,
} from 'class-validator';
import {
  HEX_COLOR,
  IsOptionalButNotNull,
  MAX_RECENT_IDS,
} from '../../lists/dto/validation';
import { MAX_REMINDER_MINUTES } from './agenda-event.dto';

/** Built-in calendar ids (`personnel`, `travail`...); the screens ignore unknown ones. */
const CALENDAR_ID = /^[a-z0-9-]{1,40}$/;
const MAX_CALENDARS = 20;

/** A map from calendar id to `#rrggbb`, so a colour cannot carry CSS of its own. */
function IsCalendarColors(): PropertyDecorator {
  return ValidateBy({
    name: 'isCalendarColors',
    validator: {
      validate: (value: unknown) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          Object.getPrototypeOf(value) !== Object.prototype
        ) {
          return false;
        }
        const entries = Object.entries(value);
        return (
          entries.length <= MAX_CALENDARS &&
          entries.every(
            ([id, color]) =>
              CALENDAR_ID.test(id) &&
              typeof color === 'string' &&
              HEX_COLOR.test(color),
          )
        );
      },
      defaultMessage: () =>
        'calendarColors must map calendar ids to #rrggbb colours',
    },
  });
}

export class UpdateAgendaSettingsDto implements UpdateAgendaUserSettingsRequest {
  @IsOptionalButNotNull()
  @IsIn([0, 1])
  weekStartsOn?: AgendaUserSettings['weekStartsOn'];

  @IsOptionalButNotNull()
  @IsInt()
  @Min(5)
  @Max(1440)
  defaultDurationMinutes?: number;

  @IsOptionalButNotNull()
  @IsTimeZone()
  timeZone?: string;

  /** null: no reminder. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REMINDER_MINUTES)
  defaultReminderMinutes?: number | null;

  @IsOptionalButNotNull()
  @IsBoolean()
  eventNotifications?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  invitationNotifications?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  showWeekNumbers?: boolean;

  @IsOptionalButNotNull()
  @IsIn(['24h', '12h'])
  hourFormat?: AgendaUserSettings['hourFormat'];

  @IsOptionalButNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_CALENDARS)
  @ArrayUnique()
  @Matches(CALENDAR_ID, { each: true })
  hiddenCalendarIds?: string[];

  @IsOptionalButNotNull()
  @IsBoolean()
  showEvents?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  showTasks?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  showPastEvents?: boolean;

  @IsOptionalButNotNull()
  @IsCalendarColors()
  calendarColors?: Record<string, string>;

  @IsOptionalButNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_RECENT_IDS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  recentIds?: string[];
}
