import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trimString } from '../../auth/dto/trim-string.transform';

export class CreateGroupDto {
  @IsString()
  @Transform(trimString)
  @Length(2, 80)
  @Matches(/\S/, { message: 'name must not be blank' })
  name!: string;
}
