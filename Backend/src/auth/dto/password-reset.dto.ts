import type {
  ConfirmPasswordResetRequest,
  PasswordResetRequest,
} from '@plano/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { trimString } from './trim-string.transform';

export class PasswordResetDto implements PasswordResetRequest {
  @IsEmail()
  @Transform(trimString)
  @Length(3, 254)
  email!: string;
}

export class ConfirmPasswordResetDto implements ConfirmPasswordResetRequest {
  /** 32 random bytes, base64url: 43 characters. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token is malformed' })
  token!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
