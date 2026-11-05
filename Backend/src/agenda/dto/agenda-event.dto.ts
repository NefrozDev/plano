import type {
  AgendaAttachment,
  EventRecurrence,
  ImportAgendaEventRequest,
  ImportAgendaEventsRequest,
  RespondAgendaEventRequest,
  SaveAgendaEventRequest,
} from '@plano/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../auth/dto/trim-string.transform';
import {
  HEX_COLOR,
  IsOptionalButNotNull,
  LOCAL_DATE_TIME,
} from '../../lists/dto/validation';

/** A `Record`, so a new recurrence cannot be forgotten here: the API would refuse it. */
const KNOWN_RECURRENCES: Record<EventRecurrence, true> = {
  none: true,
  daily: true,
  weekly: true,
  monthly: true,
  yearly: true,
};
const RECURRENCES = Object.keys(KNOWN_RECURRENCES) as EventRecurrence[];

export const MAX_GUESTS = 50;
const MAX_ATTACHMENTS = 5;
/** Four weeks before the start. */
const MAX_REMINDER_MINUTES = 40_320;

class AgendaAttachmentDto implements AgendaAttachment {
  @IsString()
  @Length(1, 40)
  id!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsInt()
  @Min(0)
  size!: number;

  @IsString()
  @MaxLength(100)
  type!: string;
}

/** What every event has, whether it is saved or imported. */
class AgendaEventFieldsDto {
  @IsString()
  @Transform(trimString)
  @Length(1, 120)
  title!: string;

  /** One of the user's calendars, kept in their browser. */
  @IsString()
  @Length(1, 40)
  calendarId!: string;

  @IsBoolean()
  allDay!: boolean;

  @Matches(LOCAL_DATE_TIME)
  start!: string;

  @Matches(LOCAL_DATE_TIME)
  end!: string;

  @IsString()
  @MaxLength(120)
  location!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsIn(RECURRENCES)
  recurrence!: EventRecurrence;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REMINDER_MINUTES)
  reminderMinutes!: number | null;

  @IsOptional()
  @Matches(HEX_COLOR)
  color!: string | null;

  /** Guests open it too: only a web address, never `javascript:` or the like. */
  @IsString()
  @MaxLength(300)
  @ValidateIf((_dto, url) => url !== '')
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    // As the app's own check: an intranet host has no top-level domain.
    require_tld: false,
  })
  conferenceUrl!: string;

  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AgendaAttachmentDto)
  attachments!: AgendaAttachmentDto[];

  @IsString()
  @MaxLength(1000)
  notes!: string;

  @IsIn(['busy', 'free'])
  availability!: 'busy' | 'free';

  @IsIn(['default', 'private'])
  visibility!: 'default' | 'private';
}

export class SaveAgendaEventDto
  extends AgendaEventFieldsDto
  implements SaveAgendaEventRequest
{
  /** The guests: each must be one of the organiser's contacts. */
  @IsArray()
  @ArrayMaxSize(MAX_GUESTS)
  @IsUUID('all', { each: true })
  participantIds!: string[];
}

export class RespondAgendaEventDto implements RespondAgendaEventRequest {
  @IsIn(['accepted', 'declined'])
  status!: 'accepted' | 'declined';

  @IsOptionalButNotNull()
  @IsString()
  @Length(1, 40)
  calendarId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REMINDER_MINUTES)
  reminderMinutes?: number | null;
}

class ImportedAgendaEventDto
  extends AgendaEventFieldsDto
  implements ImportAgendaEventRequest
{
  @IsString()
  @Length(1, 64)
  localId!: string;
}

export class ImportAgendaEventsDto implements ImportAgendaEventsRequest {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportedAgendaEventDto)
  events!: ImportedAgendaEventDto[];
}
