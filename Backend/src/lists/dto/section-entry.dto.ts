import type {
  CreateEntryRequest,
  CreateSectionRequest,
  ReorderEntriesRequest,
  UpdateEntryRequest,
} from '@plano/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../auth/dto/trim-string.transform';
import { HEX_COLOR, IsOptionalButNotNull, LOCAL_DATE_TIME } from './validation';

export class CreateSectionDto implements CreateSectionRequest {
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  name!: string;

  @Matches(HEX_COLOR)
  color!: string;
}

export class CreateEntryDto implements CreateEntryRequest {
  @IsString()
  @Transform(trimString)
  @Length(1, 200)
  name!: string;
}

export class UpdateEntryDto implements UpdateEntryRequest {
  @IsOptionalButNotNull()
  @IsString()
  @Transform(trimString)
  @Length(1, 200)
  name?: string;

  @IsOptionalButNotNull()
  @IsBoolean()
  done?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  highlighted?: boolean;

  /** null unassigns. */
  @IsOptional()
  @IsUUID()
  assignedTo?: string | null;

  /** null removes the reminder. */
  @IsOptional()
  @Matches(LOCAL_DATE_TIME)
  reminder?: string | null;

  @IsOptionalButNotNull()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReorderEntriesDto implements ReorderEntriesRequest {
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  entryIds!: string[];
}
