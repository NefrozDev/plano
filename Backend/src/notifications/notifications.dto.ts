import type {
  MarkAllNotificationsReadRequest,
  MarkNotificationsReadRequest,
  NotificationArea,
} from '@plano/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export const NOTIFICATION_AREAS: readonly NotificationArea[] = [
  'friends',
  'lists',
  'objectives',
  'agenda',
];

export class MarkNotificationsReadDto implements MarkNotificationsReadRequest {
  @IsIn(NOTIFICATION_AREAS)
  area!: NotificationArea;

  @IsOptional()
  @IsString()
  @Length(1, 36)
  targetId?: string;
}

export class MarkAllNotificationsReadDto implements MarkAllNotificationsReadRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(NOTIFICATION_AREAS.length)
  @ArrayUnique()
  @IsIn(NOTIFICATION_AREAS, { each: true })
  areas!: NotificationArea[];

  @IsISO8601({ strict: true })
  until!: string;
}
