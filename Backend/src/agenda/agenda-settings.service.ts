import { Injectable } from '@nestjs/common';
import type { AgendaUserSettings } from '@plano/common';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { ensureUserSettings } from '../database/user-settings';
import { sentFields } from '../lists/dto/validation';
import type { UpdateAgendaSettingsDto } from './dto/agenda-settings.dto';
import { AgendaSettings } from './entities/agenda-settings.entity';

/** Per-user settings, filters and calendar colours of the agenda screens. */
@Injectable()
export class AgendaSettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  find(userId: string): Promise<AgendaUserSettings> {
    return this.writeLock.runExclusive(async () =>
      toResponse(
        await ensureUserSettings(
          this.dataSource.manager,
          AgendaSettings,
          userId,
        ),
      ),
    );
  }

  update(
    userId: string,
    changes: UpdateAgendaSettingsDto,
  ): Promise<AgendaUserSettings> {
    return this.writeLock.runExclusive(async () => {
      const manager = this.dataSource.manager;
      const settings = await ensureUserSettings(
        manager,
        AgendaSettings,
        userId,
      );
      Object.assign(settings, sentFields(changes));
      return toResponse(await manager.save(settings));
    });
  }
}

function toResponse(settings: AgendaSettings): AgendaUserSettings {
  return {
    weekStartsOn: settings.weekStartsOn,
    defaultDurationMinutes: settings.defaultDurationMinutes,
    timeZone: settings.timeZone,
    defaultReminderMinutes: settings.defaultReminderMinutes,
    eventNotifications: settings.eventNotifications,
    invitationNotifications: settings.invitationNotifications,
    showWeekNumbers: settings.showWeekNumbers,
    hourFormat: settings.hourFormat,
    hiddenCalendarIds: settings.hiddenCalendarIds,
    showEvents: settings.showEvents,
    showTasks: settings.showTasks,
    showPastEvents: settings.showPastEvents,
    calendarColors: settings.calendarColors,
    recentIds: settings.recentIds,
  };
}
