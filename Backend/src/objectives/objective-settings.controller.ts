import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { ObjectiveUserSettings } from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UpdateObjectiveSettingsDto } from './dto/objective-settings.dto';
import { ObjectiveSettingsService } from './objective-settings.service';

@Controller('settings/objectives')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class ObjectiveSettingsController {
  constructor(private readonly settings: ObjectiveSettingsService) {}

  @Get()
  find(@CurrentUser('id') userId: string): Promise<ObjectiveUserSettings> {
    return this.settings.find(userId);
  }

  @Patch()
  update(
    @CurrentUser('id') userId: string,
    @Body() changes: UpdateObjectiveSettingsDto,
  ): Promise<ObjectiveUserSettings> {
    return this.settings.update(userId, changes);
  }
}
