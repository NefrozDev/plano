import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { NotificationsResponse } from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  MarkAllNotificationsReadDto,
  MarkNotificationsReadDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string): Promise<NotificationsResponse> {
    return this.notifications.list(userId);
  }

  /** Everything unread in an area, or about one of its lists, objectives or people. */
  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser('id') userId: string,
    @Body() details: MarkNotificationsReadDto,
  ): Promise<void> {
    return this.notifications.markRead(userId, details);
  }

  /** What the bell showed, once closed without opening any of it. */
  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(
    @CurrentUser('id') userId: string,
    @Body() details: MarkAllNotificationsReadDto,
  ): Promise<void> {
    return this.notifications.markAllRead(userId, details);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markOneRead(
    @CurrentUser('id') userId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<void> {
    return this.notifications.markOneRead(userId, notificationId);
  }
}
