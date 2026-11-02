import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FriendsModule } from '../friends/friends.module';
import { LiveModule } from '../live/live.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObjectiveActivity } from './entities/objective-activity.entity';
import { ObjectiveComment } from './entities/objective-comment.entity';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectiveMember } from './entities/objective-member.entity';
import { ObjectivePeriod } from './entities/objective-period.entity';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { ObjectiveTemplate } from './entities/objective-template.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import { Objective } from './entities/objective.entity';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveActivityService } from './objective-activity.service';
import { ObjectiveAgendaService } from './objective-agenda.service';
import { ObjectiveChangesService } from './objective-changes.service';
import { ObjectiveImportService } from './objective-import.service';
import { ObjectiveMembersService } from './objective-members.service';
import { ObjectivePreferencesService } from './objective-preferences.service';
import { ObjectiveRecurrenceService } from './objective-recurrence.service';
import { ObjectiveTemplatesService } from './objective-templates.service';
import { ObjectiveTrackingService } from './objective-tracking.service';
import { ObjectiveViewService } from './objective-view.service';
import { ObjectiveWriterService } from './objective-writer.service';
import { ObjectivesController } from './objectives.controller';
import { ObjectivesService } from './objectives.service';

/** Objectives as trees of sub-objectives, with their progress. */
@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    FriendsModule,
    LiveModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Objective,
      ObjectiveSession,
      ObjectiveCheckInRow,
      ObjectivePreference,
      ObjectiveMember,
      ObjectiveActivity,
      ObjectiveComment,
      ObjectivePeriod,
      ObjectiveTemplate,
    ]),
  ],
  controllers: [ObjectivesController],
  providers: [
    ObjectiveAccessService,
    ObjectiveChangesService,
    ObjectiveWriterService,
    ObjectiveViewService,
    ObjectivePreferencesService,
    ObjectivesService,
    ObjectiveTrackingService,
    ObjectiveImportService,
    ObjectiveAgendaService,
    ObjectiveMembersService,
    ObjectiveActivityService,
    ObjectiveRecurrenceService,
    ObjectiveTemplatesService,
  ],
})
export class ObjectivesModule {}
