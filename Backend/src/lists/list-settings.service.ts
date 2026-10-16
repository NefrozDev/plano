import { Injectable } from '@nestjs/common';
import type { ListSettings as ListSettingsResponse } from '@plano/common';
import { DataSource, EntityManager } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
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
      toResponse(await this.ensure(this.dataSource.manager, userId)),
    );
  }

  update(
    userId: string,
    changes: UpdateListSettingsDto,
  ): Promise<ListSettingsResponse> {
    return this.writeLock.runExclusive(async () => {
      const manager = this.dataSource.manager;
      const settings = await this.ensure(manager, userId);
      Object.assign(settings, sentFields(changes));
      return toResponse(await manager.save(settings));
    });
  }

  /**
   * The row is created on first use, so the defaults live in one place: the
   * column defaults of the migration.
   */
  private async ensure(
    manager: EntityManager,
    userId: string,
  ): Promise<ListSettings> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(ListSettings)
      .values({ userId })
      .orIgnore()
      .execute();
    return manager.findOneByOrFail(ListSettings, { userId });
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
