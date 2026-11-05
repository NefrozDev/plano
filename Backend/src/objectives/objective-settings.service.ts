import { Injectable } from '@nestjs/common';
import type { ObjectiveUserSettings } from '@plano/common';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { ensureUserSettings } from '../database/user-settings';
import { sentFields } from '../lists/dto/validation';
import type { UpdateObjectiveSettingsDto } from './dto/objective-settings.dto';
import { ObjectiveSettings } from './entities/objective-settings.entity';

/** Per-user display settings of the objectives screens. */
@Injectable()
export class ObjectiveSettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  find(userId: string): Promise<ObjectiveUserSettings> {
    return this.writeLock.runExclusive(async () =>
      toResponse(
        await ensureUserSettings(
          this.dataSource.manager,
          ObjectiveSettings,
          userId,
        ),
      ),
    );
  }

  update(
    userId: string,
    changes: UpdateObjectiveSettingsDto,
  ): Promise<ObjectiveUserSettings> {
    return this.writeLock.runExclusive(async () => {
      const manager = this.dataSource.manager;
      const settings = await ensureUserSettings(
        manager,
        ObjectiveSettings,
        userId,
      );
      Object.assign(settings, sentFields(changes));
      return toResponse(await manager.save(settings));
    });
  }
}

function toResponse(settings: ObjectiveSettings): ObjectiveUserSettings {
  return {
    defaultView: settings.defaultView,
    showArchived: settings.showArchived,
    defaultDueReminder: settings.defaultDueReminder,
    notifications: settings.notifications,
    habitReminders: settings.habitReminders,
    showPercentage: settings.showPercentage,
    categoryColors: settings.categoryColors,
    recentIds: settings.recentIds,
  };
}
