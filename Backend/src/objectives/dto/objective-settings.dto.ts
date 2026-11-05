import type {
  DueReminder,
  ObjectiveUserSettings,
  UpdateObjectiveUserSettingsRequest,
} from '@plano/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsUUID,
} from 'class-validator';
import {
  IsOptionalButNotNull,
  MAX_RECENT_IDS,
} from '../../lists/dto/validation';

/** A `Record`, so a new reminder cannot be forgotten here: the API would refuse it. */
const KNOWN_DUE_REMINDERS: Record<DueReminder, true> = {
  none: true,
  'same-day': true,
  'day-before': true,
  'week-before': true,
};

export class UpdateObjectiveSettingsDto implements UpdateObjectiveUserSettingsRequest {
  @IsOptionalButNotNull()
  @IsIn(['list', 'grid'])
  defaultView?: ObjectiveUserSettings['defaultView'];

  @IsOptionalButNotNull()
  @IsBoolean()
  showArchived?: boolean;

  @IsOptionalButNotNull()
  @IsIn(Object.keys(KNOWN_DUE_REMINDERS))
  defaultDueReminder?: DueReminder;

  @IsOptionalButNotNull()
  @IsBoolean()
  notifications?: boolean;

  @IsOptionalButNotNull()
  @IsIn(['scheduled', 'none'])
  habitReminders?: ObjectiveUserSettings['habitReminders'];

  @IsOptionalButNotNull()
  @IsBoolean()
  showPercentage?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  categoryColors?: boolean;

  @IsOptionalButNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_RECENT_IDS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  recentIds?: string[];
}
