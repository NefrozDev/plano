import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import { Objective } from './entities/objective.entity';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveImportService } from './objective-import.service';
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
    TypeOrmModule.forFeature([
      Objective,
      ObjectiveSession,
      ObjectiveCheckInRow,
      ObjectivePreference,
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
  ],
})
export class ObjectivesModule {}
