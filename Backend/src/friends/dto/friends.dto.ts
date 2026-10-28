import type { SendFriendRequestRequest } from '@plano/common';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Matches } from 'class-validator';

export class SendFriendRequestDto implements SendFriendRequestRequest {
  @IsUUID()
  userId!: string;
}

/** `?q=`: the start of a username, with the characters usernames allow. */
export class SearchUsersDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[a-zA-Z0-9._-]{2,30}$/, {
    message:
      'q must contain 2 to 30 letters, numbers, dots, underscores, or hyphens',
  })
  q!: string;
}
