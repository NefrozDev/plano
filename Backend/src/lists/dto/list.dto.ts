import type {
  CreateListRequest,
  ListIcon,
  UpdateListRequest,
} from '@plano/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../auth/dto/trim-string.transform';
import { HEX_COLOR, IsOptionalButNotNull, LIST_ICONS } from './validation';

export class CreateListDto implements CreateListRequest {
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  name!: string;

  @IsIn(LIST_ICONS)
  icon!: ListIcon;

  @Matches(HEX_COLOR)
  color!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateListDto implements UpdateListRequest {
  @IsOptionalButNotNull()
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  name?: string;

  @IsOptionalButNotNull()
  @IsIn(LIST_ICONS)
  icon?: ListIcon;

  @IsOptionalButNotNull()
  @Matches(HEX_COLOR)
  color?: string;

  @IsOptionalButNotNull()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptionalButNotNull()
  @IsBoolean()
  archived?: boolean;
}
