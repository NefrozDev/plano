import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  AgendaEventView,
  ImportAgendaEventsResponse,
} from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AgendaEventsService } from './agenda-events.service';
import {
  ImportAgendaEventsDto,
  RespondAgendaEventDto,
  SaveAgendaEventDto,
} from './dto/agenda-event.dto';

const EventId = () => Param('eventId', ParseUUIDPipe);

@Controller('agenda/events')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class AgendaController {
  constructor(private readonly events: AgendaEventsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string): Promise<AgendaEventView[]> {
    return this.events.findAll(userId);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() details: SaveAgendaEventDto,
  ): Promise<AgendaEventView> {
    return this.events.create(userId, details);
  }

  /** What this browser stored before the agenda moved to the API. */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import(
    @CurrentUser('id') userId: string,
    @Body() details: ImportAgendaEventsDto,
  ): Promise<ImportAgendaEventsResponse> {
    return this.events.import(userId, details);
  }

  @Get(':eventId')
  findOne(
    @CurrentUser('id') userId: string,
    @EventId() eventId: string,
  ): Promise<AgendaEventView> {
    return this.events.findOne(eventId, userId);
  }

  @Put(':eventId')
  update(
    @CurrentUser('id') userId: string,
    @EventId() eventId: string,
    @Body() details: SaveAgendaEventDto,
  ): Promise<AgendaEventView> {
    return this.events.update(eventId, userId, details);
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('id') userId: string,
    @EventId() eventId: string,
  ): Promise<void> {
    return this.events.remove(eventId, userId);
  }

  /** A guest's answer to the invitation. */
  @Post(':eventId/response')
  @HttpCode(HttpStatus.OK)
  respond(
    @CurrentUser('id') userId: string,
    @EventId() eventId: string,
    @Body() answer: RespondAgendaEventDto,
  ): Promise<AgendaEventView> {
    return this.events.respond(eventId, userId, answer);
  }
}
