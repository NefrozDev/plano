import { Injectable } from '@nestjs/common';
import type { ListSettings as ListSettingsResponse } from '@plano/common';
import { DataSource } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { ensureUserSettings } from '../database/user-settings';
import type { UpdateListSettingsDto } from './dto/member-settings.dto';
import { sentFields } from './dto/validation';
import { ListSettings } from './entities/list-settings.entity';

/** Per-user display preferences of the lists screens. */
@Injectable()
export class ListSettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  find(userId: string): Promise<ListSettingsResponse> {
    return this.writeLock.runExclusive(async () =>
      toResponse(
        await ensureUserSettings(this.dataSource.manager, ListSettings, userId),
      ),
    );
  }

  update(
    userId: string,
    changes: UpdateListSettingsDto,
  ): Promise<ListSettingsResponse> {
    return this.writeLock.runExclusive(async () => {
      const manager = this.dataSource.manager;
      const settings = await ensureUserSettings(manager, ListSettings, userId);
      Object.assign(settings, sentFields(changes));
      return toResponse(await manager.save(settings));
    });
  }
}

function toResponse(settings: ListSettings): ListSettingsResponse {
  return {
    defaultView: settings.defaultView,
    showCounts: settings.showCounts,
    showCompleted: settings.showCompleted,
    completedLast: settings.completedLast,
    defaultReminder: settings.defaultReminder,
    notifyScope: settings.notifyScope,
    archiveCompleted: settings.archiveCompleted,
    confirmDelete: settings.confirmDelete,
  };
}
