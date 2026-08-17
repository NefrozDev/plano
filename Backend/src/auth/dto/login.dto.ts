import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trimString } from './trim-string.transform';

export class LoginDto {
  @IsString()
  @Transform(trimString)
  @Matches(/^[a-zA-Z0-9._-]{3,30}$/)
  username!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
