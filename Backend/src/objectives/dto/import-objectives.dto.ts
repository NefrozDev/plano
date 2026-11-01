import type {
  DueReminder,
  ImportObjectiveRequest,
  ImportObjectivesRequest,
  ObjectiveCategory,
  ObjectiveSessionStatus,
  ObjectiveStatus,
} from '@plano/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ObjectiveMetricDto, ObjectiveReminderDto } from './objective.dto';
import {
  DUE_REMINDERS,
  IsIsoDate,
  OBJECTIVE_CATEGORIES,
  SESSION_STATUSES,
} from './validation';

const MAX_AMOUNT = 1_000_000_000;

class ImportedSessionDto {
  @IsIsoDate()
  date!: string;

  @IsIn(SESSION_STATUSES)
  status!: ObjectiveSessionStatus;

  @IsString()
  @MaxLength(60)
  label!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_AMOUNT)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMinutes!: number | null;
}

class ImportedStepDto {
  @IsString()
  @Length(1, 80)
  label!: string;

  @IsBoolean()
  done!: boolean;

  @IsOptional()
  @IsIsoDate()
  completedOn!: string | null;
}

class ImportedHabitDto {
  @IsInt()
  @Min(1)
  @Max(3660)
  targetDays!: number;

  @IsArray()
  @ArrayMaxSize(5000)
  @IsIsoDate({ each: true })
  checkIns!: string[];
}

export class ImportedObjectiveDto implements ImportObjectiveRequest {
  @IsString()
  @Length(1, 200)
  localId!: string;

  @IsString()
  @Length(1, 80)
  title!: string;

  @IsIn(OBJECTIVE_CATEGORIES)
  category!: ObjectiveCategory;

  @IsIn(['metric', 'steps', 'habit'])
  tracking!: ImportObjectiveRequest['tracking'];

  @IsIn(['active', 'paused', 'completed'])
  status!: ObjectiveStatus;

  @IsBoolean()
  archived!: boolean;

  @IsIsoDate()
  createdOn!: string;

  @IsOptional()
  @IsIsoDate()
  dueDate!: string | null;

  @IsOptional()
  @IsIsoDate()
  completedOn!: string | null;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsString()
  @MaxLength(120)
  plan!: string;

  @ValidateNested()
  @Type(() => ObjectiveReminderDto)
  reminder!: ObjectiveReminderDto;

  @IsIn(DUE_REMINDERS)
  dueReminder!: DueReminder;

  @IsOptional()
  @ValidateNested()
  @Type(() => ObjectiveMetricDto)
  metric!: ObjectiveMetricDto | null;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportedSessionDto)
  sessions!: ImportedSessionDto[];

  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => ImportedStepDto)
  steps!: ImportedStepDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ImportedHabitDto)
  habit!: ImportedHabitDto | null;
}

export class ImportObjectivesDto implements ImportObjectivesRequest {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportedObjectiveDto)
  objectives!: ImportedObjectiveDto[];
}
