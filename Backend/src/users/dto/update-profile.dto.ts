import type { Locale, UpdateProfileRequest } from '@plano/common';
import { IsIn, IsOptional } from 'class-validator';
import { SUPPORTED_LOCALES } from '../user.mapper';

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}
