import type {
  LinkObjectiveListRequest,
  AddObjectiveCommentRequest,
  AddObjectiveMemberRequest,
  AddObjectiveSessionRequest,
  CompletionMode,
  CreateObjectiveRequest,
  DueReminder,
  MetricAggregation,
  ObjectiveCategory,
  ObjectiveMemberRole,
  ObjectiveMetricSettings,
  ObjectiveRecurrence,
  ObjectiveReminder,
  ObjectiveSessionStatus,
  ReorderChildObjectivesRequest,
  ReorderObjectivesRequest,
  SaveObjectiveTemplateRequest,
  SetObjectiveCompletedRequest,
  SetObjectiveProgressRequest,
  TimelapseMode,
  UpdateObjectiveMemberRequest,
  UpdateObjectivePreferencesRequest,
  UpdateObjectiveRequest,
  UseObjectiveTemplateRequest,
} from '@plano/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../auth/dto/trim-string.transform';
import { IsOptionalButNotNull } from '../../lists/dto/validation';
import {
  COMPLETION_MODES,
  DUE_REMINDERS,
  IsIsoDate,
  METRIC_AGGREGATIONS,
  OBJECTIVE_CATEGORIES,
  REMINDER_FREQUENCIES,
  REMINDER_TIME,
  SESSION_STATUSES,
  TIMELAPSE_MODES,
} from './validation';

/** The largest amount a target or a session can hold. */
const MAX_AMOUNT = 1_000_000_000;

export class ObjectiveMetricDto implements ObjectiveMetricSettings {
  @IsString()
  @Transform(trimString)
  @Length(1, 12)
  unit!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(MAX_AMOUNT)
  target!: number;

  @IsIn(METRIC_AGGREGATIONS)
  aggregation!: MetricAggregation;
}

export class ObjectiveReminderDto implements ObjectiveReminder {
  @IsIn(REMINDER_FREQUENCIES)
  frequency!: ObjectiveReminder['frequency'];

  @Matches(REMINDER_TIME)
  time!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;
}

export class AddObjectiveCommentDto implements AddObjectiveCommentRequest {
  @IsString()
  @Transform(trimString)
  @Length(1, 1000)
  body!: string;
}

export class AddObjectiveMemberDto implements AddObjectiveMemberRequest {
  @IsUUID()
  userId!: string;

  @IsIn(['viewer', 'contributor'])
  role!: ObjectiveMemberRole;
}

export class UpdateObjectiveMemberDto implements UpdateObjectiveMemberRequest {
  @IsIn(['viewer', 'contributor'])
  role!: ObjectiveMemberRole;
}

/** Fields shared by creating and editing; each is optional on its own here. */
class ObjectiveSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ObjectiveMetricDto)
  metric?: ObjectiveMetricDto | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3660)
  habitTargetDays?: number | null;

  @IsOptionalButNotNull()
  @IsIn(TIMELAPSE_MODES)
  timelapse?: TimelapseMode;

  @IsOptional()
  @IsIsoDate()
  dueDate?: string | null;

  @IsOptionalButNotNull()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptionalButNotNull()
  @IsString()
  @MaxLength(120)
  plan?: string;

  @IsOptionalButNotNull()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number;

  @IsOptionalButNotNull()
  @IsIn(['none', 'weekly', 'monthly', 'yearly'])
  recurrence?: ObjectiveRecurrence;
}

export class SaveObjectiveTemplateDto implements SaveObjectiveTemplateRequest {
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  name!: string;
}

export class UseObjectiveTemplateDto implements UseObjectiveTemplateRequest {
  @IsIsoDate()
  startDate!: string;
}

export class CreateObjectiveDto
  extends ObjectiveSettingsDto
  implements CreateObjectiveRequest
{
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  title!: string;

  @IsIn(OBJECTIVE_CATEGORIES)
  category!: ObjectiveCategory;

  @IsIn(COMPLETION_MODES)
  completion!: CompletionMode;

  @IsIsoDate()
  startDate!: string;

  @IsOptionalButNotNull()
  @IsUUID()
  parentId?: string;

  @IsOptionalButNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim() : item,
        )
      : value,
  )
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  children?: string[];

  @IsOptionalButNotNull()
  @ValidateNested()
  @Type(() => ObjectiveReminderDto)
  reminder?: ObjectiveReminderDto;

  @IsOptionalButNotNull()
  @IsIn(DUE_REMINDERS)
  dueReminder?: DueReminder;

  @IsOptionalButNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AddObjectiveMemberDto)
  members?: AddObjectiveMemberDto[];
}

export class UpdateObjectiveDto
  extends ObjectiveSettingsDto
  implements UpdateObjectiveRequest
{
  @IsOptionalButNotNull()
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  title?: string;

  @IsOptionalButNotNull()
  @IsIn(OBJECTIVE_CATEGORIES)
  category?: ObjectiveCategory;

  @IsOptionalButNotNull()
  @IsIn(COMPLETION_MODES)
  completion?: CompletionMode;

  @IsOptionalButNotNull()
  @IsIsoDate()
  startDate?: string;

  @IsOptionalButNotNull()
  @IsBoolean()
  archived?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;
}

export class AddObjectiveSessionDto implements AddObjectiveSessionRequest {
  @IsIsoDate()
  date!: string;

  @IsIn(SESSION_STATUSES)
  status!: ObjectiveSessionStatus;

  @IsString()
  @Transform(trimString)
  @MaxLength(60)
  label!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_AMOUNT)
  value!: number;

  @IsOptionalButNotNull()
  @IsInt()
  @Min(0)
  @Max(100_000)
  durationMinutes?: number;
}

export class SetObjectiveProgressDto implements SetObjectiveProgressRequest {
  @IsInt()
  @Min(0)
  @Max(100)
  percent!: number;
}

export class SetObjectiveCompletedDto implements SetObjectiveCompletedRequest {
  @IsBoolean()
  completed!: boolean;
}

export class ReorderObjectivesDto implements ReorderObjectivesRequest {
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  objectiveIds!: string[];
}

export class ReorderChildObjectivesDto implements ReorderChildObjectivesRequest {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  objectiveIds!: string[];
}

export class UpdateObjectivePreferencesDto implements UpdateObjectivePreferencesRequest {
  @IsOptionalButNotNull()
  @IsBoolean()
  onHome?: boolean;

  @IsOptionalButNotNull()
  @ValidateNested()
  @Type(() => ObjectiveReminderDto)
  reminder?: ObjectiveReminderDto;

  @IsOptionalButNotNull()
  @IsIn(DUE_REMINDERS)
  dueReminder?: DueReminder;
}

export class LinkObjectiveListDto implements LinkObjectiveListRequest {
  @IsUUID()
  listId!: string;
}
