import type {
  MarkNotificationsReadRequest,
  NotificationArea,
} from '@plano/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

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
