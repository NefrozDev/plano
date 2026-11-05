import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FriendsModule } from '../friends/friends.module';
import { LiveModule } from '../live/live.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgendaController } from './agenda.controller';
import { AgendaEventsService } from './agenda-events.service';
import { AgendaEvent } from './entities/agenda-event.entity';
import { AgendaGuest } from './entities/agenda-guest.entity';

/** Agenda events, shareable with the organiser's friends and group mates. */
@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    FriendsModule,
    LiveModule,
    NotificationsModule,
    TypeOrmModule.forFeature([AgendaEvent, AgendaGuest]),
  ],
  controllers: [AgendaController],
  providers: [AgendaEventsService],
})
export class AgendaModule {}
