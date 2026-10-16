import type {
  AddListMemberRequest,
  ListMemberRole,
  ListSettings,
  UpdateListMemberRequest,
  UpdateListSettingsRequest,
} from '@plano/common';
import { IsBoolean, IsIn, IsUUID, Matches } from 'class-validator';
import { IsOptionalButNotNull, LIST_MEMBER_ROLES } from './validation';

export class AddListMemberDto implements AddListMemberRequest {
  @IsUUID()
  userId!: string;

  @IsIn(LIST_MEMBER_ROLES)
  role!: ListMemberRole;
}

export class UpdateListMemberDto implements UpdateListMemberRequest {
  @IsIn(LIST_MEMBER_ROLES)
  role!: ListMemberRole;
}

export class UpdateListSettingsDto implements UpdateListSettingsRequest {
  @IsOptionalButNotNull()
  @IsIn(['list', 'grid'])
  defaultView?: ListSettings['defaultView'];

  @IsOptionalButNotNull()
  @IsBoolean()
  showCounts?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  showCompleted?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  completedLast?: boolean;

  @IsOptionalButNotNull()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  defaultReminder?: string;

  @IsOptionalButNotNull()
  @IsIn(['mine', 'all', 'none'])
  notifyScope?: ListSettings['notifyScope'];

  @IsOptionalButNotNull()
  @IsBoolean()
  archiveCompleted?: boolean;

  @IsOptionalButNotNull()
  @IsBoolean()
  confirmDelete?: boolean;
}
