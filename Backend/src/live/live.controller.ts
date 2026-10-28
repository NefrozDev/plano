import { Controller, type MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { LiveEventsService } from './live-events.service';

@Controller('live')
@UseGuards(SessionAuthGuard)
export class LiveController {
  constructor(private readonly live: LiveEventsService) {}

  /**
   * One long-lived response per open app (EventSource reconnects on its own).
   * Nest sets the event-stream headers, including `X-Accel-Buffering: no` so
   * nginx forwards each event at once.
   */
  @Sse('stream')
  @SkipThrottle()
  stream(@CurrentUser('id') userId: string): Observable<MessageEvent> {
    return this.live.streamFor(userId);
  }
}
