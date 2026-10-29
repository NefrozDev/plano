import type { Locale, UpdateProfileRequest } from '@plano/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { trimString } from '../../auth/dto/trim-string.transform';
import { SUPPORTED_LOCALES } from '../user.mapper';
import { USERNAME_FORMAT_MESSAGE, USERNAME_PATTERN } from '../username';

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Matches(USERNAME_PATTERN, { message: USERNAME_FORMAT_MESSAGE })
  username?: string;
}
