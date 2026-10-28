import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FriendsModule } from '../friends/friends.module';
import { LiveModule } from '../live/live.module';
import { ListEntry } from './entities/list-entry.entity';
import { ListMember } from './entities/list-member.entity';
import { ListSection } from './entities/list-section.entity';
import { ListSettings } from './entities/list-settings.entity';
import { List } from './entities/list.entity';
import { ListAccessService } from './list-access.service';
import { ListChangesService } from './list-changes.service';
import { ListContentService } from './list-content.service';
import { ListSettingsController } from './list-settings.controller';
import { ListSettingsService } from './list-settings.service';
import { ListsController } from './lists.controller';
import { ListsService } from './lists.service';

/** Shared shopping/todo lists, shareable with the owner's friends and group mates. */
@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    FriendsModule,
    LiveModule,
    TypeOrmModule.forFeature([
      List,
      ListMember,
      ListSection,
      ListEntry,
      ListSettings,
    ]),
  ],
  controllers: [ListsController, ListSettingsController],
  providers: [
    ListAccessService,
    ListChangesService,
    ListsService,
    ListContentService,
    ListSettingsService,
  ],
})
export class ListsModule {}
