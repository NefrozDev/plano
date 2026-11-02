import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  ImportObjectivesResponse,
  ObjectiveActivityEntry,
  ObjectiveAgendaItem,
  ObjectiveCommentEntry,
  ObjectiveDetail,
  ObjectiveSummary,
  ObjectiveTemplateSummary,
} from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ImportObjectivesDto } from './dto/import-objectives.dto';
import {
  RemoveObjectiveQueryDto,
  LinkObjectiveListDto,
  AddObjectiveCommentDto,
  AddObjectiveMemberDto,
  AddObjectiveSessionDto,
  CreateObjectiveDto,
  ReorderChildObjectivesDto,
  ReorderObjectivesDto,
  SaveObjectiveTemplateDto,
  SetObjectiveCompletedDto,
  SetObjectiveProgressDto,
  UpdateObjectiveDto,
  UpdateObjectiveMemberDto,
  UpdateObjectivePreferencesDto,
  UseObjectiveTemplateDto,
} from './dto/objective.dto';
import { CreateListDto } from '../lists/dto/list.dto';
import { ObjectiveActivityService } from './objective-activity.service';
import { ObjectiveAgendaService } from './objective-agenda.service';
import { ObjectiveDateParamPipe } from './objective-date-param.pipe';
import { ObjectiveImportService } from './objective-import.service';
import { ObjectiveListsService } from './objective-lists.service';
import { ObjectiveMembersService } from './objective-members.service';
import { ObjectivePreferencesService } from './objective-preferences.service';
import { ObjectiveRecurrenceService } from './objective-recurrence.service';
import { ObjectiveTemplatesService } from './objective-templates.service';
import { ObjectiveTrackingService } from './objective-tracking.service';
import { ObjectivesService } from './objectives.service';

const ObjectiveId = () => Param('objectiveId', ParseUUIDPipe);

@Controller('objectives')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class ObjectivesController {
  constructor(
    private readonly objectives: ObjectivesService,
    private readonly tracking: ObjectiveTrackingService,
    private readonly preferences: ObjectivePreferencesService,
    private readonly importer: ObjectiveImportService,
    private readonly agenda: ObjectiveAgendaService,
    private readonly members: ObjectiveMembersService,
    private readonly activity: ObjectiveActivityService,
    private readonly templates: ObjectiveTemplatesService,
    private readonly lists: ObjectiveListsService,
    private readonly recurrence: ObjectiveRecurrenceService,
  ) {}

  @Get()
  findAll(@CurrentUser('id') userId: string): Promise<ObjectiveSummary[]> {
    return this.objectives.findAll(userId);
  }

  // Declared before ':objectiveId' so "agenda" is not taken for an objective id.
  @Get('agenda')
  findAgenda(
    @CurrentUser('id') userId: string,
  ): Promise<ObjectiveAgendaItem[]> {
    return this.agenda.find(userId);
  }

  /** What the user pinned to their home page, in their order. */
  @Get('home')
  findHome(@CurrentUser('id') userId: string): Promise<ObjectiveSummary[]> {
    return this.preferences.home(userId);
  }

  /** The structures the user saved to reuse. */
  @Get('templates')
  findTemplates(
    @CurrentUser('id') userId: string,
  ): Promise<ObjectiveTemplateSummary[]> {
    return this.templates.findAll(userId);
  }

  /** A new objective with this structure. */
  @Post('templates/:templateId/use')
  useTemplate(
    @CurrentUser('id') userId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() details: UseObjectiveTemplateDto,
  ): Promise<ObjectiveDetail> {
    return this.templates.use(templateId, userId, details);
  }

  @Delete('templates/:templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTemplate(
    @CurrentUser('id') userId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<void> {
    return this.templates.remove(templateId, userId);
  }

  /** The user's own order; it changes nothing for anyone else. */
  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(
    @CurrentUser('id') userId: string,
    @Body() { objectiveIds }: ReorderObjectivesDto,
  ): Promise<void> {
    return this.preferences.reorder(userId, objectiveIds);
  }

  /** What this browser stored before objectives moved to the API. */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import(
    @CurrentUser('id') userId: string,
    @Body() details: ImportObjectivesDto,
  ): Promise<ImportObjectivesResponse> {
    return this.importer.import(userId, details);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() details: CreateObjectiveDto,
  ): Promise<ObjectiveDetail> {
    return this.objectives.create(userId, details);
  }

  @Get(':objectiveId')
  findOne(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
  ): Promise<ObjectiveDetail> {
    return this.objectives.findOne(objectiveId, userId);
  }

  @Patch(':objectiveId')
  update(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() changes: UpdateObjectiveDto,
  ): Promise<ObjectiveDetail> {
    return this.objectives.update(objectiveId, userId, changes);
  }

  @Delete(':objectiveId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Query() { deleteLists }: RemoveObjectiveQueryDto,
  ): Promise<void> {
    return this.lists.removeObjective(
      objectiveId,
      userId,
      deleteLists === 'true',
    );
  }

  /** Starts a finished top-level objective again from today, its history kept. */
  @Post(':objectiveId/restart')
  async restart(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
  ): Promise<ObjectiveDetail> {
    await this.recurrence.restartNow(objectiveId, userId);
    return this.objectives.findOne(objectiveId, userId);
  }

  @Put(':objectiveId/children/order')
  reorderChildren(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() order: ReorderChildObjectivesDto,
  ): Promise<ObjectiveDetail> {
    return this.objectives.reorderChildren(objectiveId, userId, order);
  }

  /** The user's own home pin and reminders. */
  @Patch(':objectiveId/preferences')
  updatePreferences(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() changes: UpdateObjectivePreferencesDto,
  ): Promise<ObjectiveDetail> {
    return this.preferences.update(objectiveId, userId, changes);
  }

  /** Saves this objective's structure, for this user only. */
  @Post(':objectiveId/template')
  saveTemplate(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() details: SaveObjectiveTemplateDto,
  ): Promise<ObjectiveTemplateSummary> {
    return this.templates.save(objectiveId, userId, details);
  }

  @Get(':objectiveId/activity')
  findActivity(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
  ): Promise<ObjectiveActivityEntry[]> {
    return this.activity.history(objectiveId, userId);
  }

  @Get(':objectiveId/comments')
  findComments(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
  ): Promise<ObjectiveCommentEntry[]> {
    return this.activity.comments(objectiveId, userId);
  }

  @Post(':objectiveId/comments')
  addComment(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() details: AddObjectiveCommentDto,
  ): Promise<ObjectiveCommentEntry> {
    return this.activity.addComment(objectiveId, userId, details);
  }

  @Delete(':objectiveId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeComment(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    return this.activity.removeComment(objectiveId, commentId, userId);
  }

  @Post(':objectiveId/members')
  addMember(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() details: AddObjectiveMemberDto,
  ): Promise<ObjectiveDetail> {
    return this.members.add(objectiveId, userId, details);
  }

  /** Leaves: everything the user was invited to in this objective's tree. */
  @Delete(':objectiveId/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
  ): Promise<void> {
    return this.members.leave(objectiveId, userId);
  }

  @Patch(':objectiveId/members/:userId')
  updateMember(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Param('userId', ParseUUIDPipe) memberUserId: string,
    @Body() { role }: UpdateObjectiveMemberDto,
  ): Promise<ObjectiveDetail> {
    return this.members.updateRole(objectiveId, memberUserId, userId, role);
  }

  @Delete(':objectiveId/members/:userId')
  removeMember(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Param('userId', ParseUUIDPipe) memberUserId: string,
  ): Promise<ObjectiveDetail> {
    return this.members.remove(objectiveId, memberUserId, userId);
  }

  @Post(':objectiveId/sessions')
  addSession(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() details: AddObjectiveSessionDto,
  ): Promise<ObjectiveDetail> {
    return this.tracking.addSession(objectiveId, userId, details);
  }

  @Delete(':objectiveId/sessions/:sessionId')
  removeSession(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<ObjectiveDetail> {
    return this.tracking.removeSession(objectiveId, sessionId, userId);
  }

  @Put(':objectiveId/check-ins/:date')
  checkIn(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Param('date', ObjectiveDateParamPipe) date: string,
  ): Promise<ObjectiveDetail> {
    return this.tracking.setCheckIn(objectiveId, date, userId, true);
  }

  @Delete(':objectiveId/check-ins/:date')
  uncheckIn(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Param('date', ObjectiveDateParamPipe) date: string,
  ): Promise<ObjectiveDetail> {
    return this.tracking.setCheckIn(objectiveId, date, userId, false);
  }

  @Put(':objectiveId/progress')
  setProgress(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() details: SetObjectiveProgressDto,
  ): Promise<ObjectiveDetail> {
    return this.tracking.setProgress(objectiveId, userId, details);
  }

  @Put(':objectiveId/completed')
  setCompleted(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() details: SetObjectiveCompletedDto,
  ): Promise<ObjectiveDetail> {
    return this.tracking.setCompleted(objectiveId, userId, details);
  }

  /** Links one of the owner's own lists: its items can make the bar. */
  @Post(':objectiveId/lists')
  linkList(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() { listId }: LinkObjectiveListDto,
  ): Promise<ObjectiveDetail> {
    return this.lists.link(objectiveId, userId, listId);
  }

  /** A new list of the owner's, linked at once. */
  @Post(':objectiveId/lists/new')
  createList(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Body() details: CreateListDto,
  ): Promise<ObjectiveDetail> {
    return this.lists.createList(objectiveId, userId, details);
  }

  @Delete(':objectiveId/lists/:listId')
  unlinkList(
    @CurrentUser('id') userId: string,
    @ObjectiveId() objectiveId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<ObjectiveDetail> {
    return this.lists.unlink(objectiveId, userId, listId);
  }
}
