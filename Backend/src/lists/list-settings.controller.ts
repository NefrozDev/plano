import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { ListSettings } from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UpdateListSettingsDto } from './dto/member-settings.dto';
import { ListSettingsService } from './list-settings.service';

@Controller('settings/lists')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class ListSettingsController {
  constructor(private readonly settings: ListSettingsService) {}

  @Get()
  find(@CurrentUser('id') userId: string): Promise<ListSettings> {
    return this.settings.find(userId);
  }

  @Patch()
  update(
    @CurrentUser('id') userId: string,
    @Body() changes: UpdateListSettingsDto,
  ): Promise<ListSettings> {
    return this.settings.update(userId, changes);
  }
}
