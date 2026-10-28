import { Transform } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import type { Locale } from '@plano/common';
import { SUPPORTED_LOCALES } from '../../users/user.mapper';
import { trimString } from './trim-string.transform';

export class RegisterDto {
  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  @Matches(/\S/, { message: 'firstName must not be blank' })
  firstName!: string;

  @IsString()
  @Transform(trimString)
  @Length(1, 80)
  @Matches(/\S/, { message: 'lastName must not be blank' })
  lastName!: string;

  @IsString()
  @Transform(trimString)
  @Matches(/^[a-zA-Z0-9._-]{3,30}$/, {
    message:
      'username must contain 3 to 30 letters, numbers, dots, underscores, or hyphens',
  })
  username!: string;

  @IsEmail()
  @Transform(trimString)
  @Length(3, 254)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsBoolean()
  @Equals(true, { message: 'acceptedTerms must be true' })
  acceptedTerms!: boolean;

  /** The language the interface was in while registering. */
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}
