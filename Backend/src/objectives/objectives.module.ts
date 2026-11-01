import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FriendsModule } from '../friends/friends.module';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectiveMember } from './entities/objective-member.entity';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import { Objective } from './entities/objective.entity';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveAgendaService } from './objective-agenda.service';
import { ObjectiveImportService } from './objective-import.service';
import { ObjectiveMembersService } from './objective-members.service';
import { ObjectivePreferencesService } from './objective-preferences.service';
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
    TypeOrmModule.forFeature([
      Objective,
      ObjectiveSession,
      ObjectiveCheckInRow,
      ObjectivePreference,
      ObjectiveMember,
    ]),
  ],
  controllers: [ObjectivesController],
  providers: [
    ObjectiveAccessService,
    ObjectiveWriterService,
    ObjectiveViewService,
    ObjectivePreferencesService,
    ObjectivesService,
    ObjectiveTrackingService,
    ObjectiveImportService,
    ObjectiveAgendaService,
    ObjectiveMembersService,
  ],
})
export class ObjectivesModule {}
