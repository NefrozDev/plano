import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FriendsModule } from '../friends/friends.module';
import { LiveModule } from '../live/live.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgendaController } from './agenda.controller';
import { AgendaEventsService } from './agenda-events.service';
import { AgendaSettingsController } from './agenda-settings.controller';
import { AgendaSettingsService } from './agenda-settings.service';
import { AgendaEvent } from './entities/agenda-event.entity';
import { AgendaGuest } from './entities/agenda-guest.entity';
import { AgendaSettings } from './entities/agenda-settings.entity';

/** Agenda events, shareable with the organiser's friends and group mates, and each person's agenda settings. */
@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    FriendsModule,
    LiveModule,
    NotificationsModule,
    TypeOrmModule.forFeature([AgendaEvent, AgendaGuest, AgendaSettings]),
  ],
  controllers: [AgendaController, AgendaSettingsController],
  providers: [AgendaEventsService, AgendaSettingsService],
})
export class AgendaModule {}
