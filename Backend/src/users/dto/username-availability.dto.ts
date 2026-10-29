import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { trimString } from '../../auth/dto/trim-string.transform';
import { USERNAME_FORMAT_MESSAGE, USERNAME_PATTERN } from '../username';

export class UsernameAvailabilityQuery {
  @IsString()
  @Transform(trimString)
  @Matches(USERNAME_PATTERN, { message: USERNAME_FORMAT_MESSAGE })
  username!: string;
}
