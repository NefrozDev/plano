import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class JoinGroupDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Length(8, 8)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'inviteCode is invalid' })
  inviteCode!: string;
}
