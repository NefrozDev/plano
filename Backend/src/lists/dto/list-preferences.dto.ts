import type {
  ReorderListsRequest,
  UpdateListPreferencesRequest,
} from '@plano/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsUUID,
} from 'class-validator';

export class ReorderListsDto implements ReorderListsRequest {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  listIds!: string[];
}

export class UpdateListPreferencesDto implements UpdateListPreferencesRequest {
  @IsBoolean()
  onHome!: boolean;
}
