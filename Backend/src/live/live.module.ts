import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveController } from './live.controller';
import { LiveEventsService } from './live-events.service';

/** Server-Sent Events: tells open apps what changed so they reload it. */
@Module({
  imports: [AuthModule],
  controllers: [LiveController],
  providers: [LiveEventsService],
  exports: [LiveEventsService],
})
export class LiveModule {}
