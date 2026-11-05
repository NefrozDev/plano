import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { AgendaUserSettings } from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AgendaSettingsService } from './agenda-settings.service';
import { UpdateAgendaSettingsDto } from './dto/agenda-settings.dto';

@Controller('settings/agenda')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class AgendaSettingsController {
  constructor(private readonly settings: AgendaSettingsService) {}

  @Get()
  find(@CurrentUser('id') userId: string): Promise<AgendaUserSettings> {
    return this.settings.find(userId);
  }

  @Patch()
  update(
    @CurrentUser('id') userId: string,
    @Body() changes: UpdateAgendaSettingsDto,
  ): Promise<AgendaUserSettings> {
    return this.settings.update(userId, changes);
  }
}
