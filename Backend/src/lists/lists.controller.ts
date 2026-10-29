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
  UseGuards,
} from '@nestjs/common';
import type {
  HomeList,
  ListDetail,
  ListEntry,
  ListMember,
  ListReminder,
  ListSection,
  ListSummary,
} from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateListDto, UpdateListDto } from './dto/list.dto';
import {
  ReorderListsDto,
  UpdateListPreferencesDto,
} from './dto/list-preferences.dto';
import {
  AddListMemberDto,
  UpdateListMemberDto,
} from './dto/member-settings.dto';
import {
  CreateEntryDto,
  CreateSectionDto,
  ReorderEntriesDto,
  ReorderSectionsDto,
  UpdateEntryDto,
  UpdateSectionDto,
} from './dto/section-entry.dto';
import { ListContentService } from './list-content.service';
import { ListPreferencesService } from './list-preferences.service';
import { ListsService } from './lists.service';

const ListId = () => Param('listId', ParseUUIDPipe);

@Controller('lists')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class ListsController {
  constructor(
    private readonly lists: ListsService,
    private readonly content: ListContentService,
    private readonly preferences: ListPreferencesService,
  ) {}

  @Get()
  findAll(@CurrentUser('id') userId: string): Promise<ListSummary[]> {
    return this.lists.findAll(userId);
  }

  // Declared before ':listId' so "reminders" is not taken for a list id.
  @Get('reminders')
  findReminders(@CurrentUser('id') userId: string): Promise<ListReminder[]> {
    return this.lists.findReminders(userId);
  }

  /** The lists the user pinned to their home page, in their order. */
  @Get('home')
  findHome(@CurrentUser('id') userId: string): Promise<HomeList[]> {
    return this.preferences.home(userId);
  }

  /** The user's own order; it changes nothing for the other members. */
  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(
    @CurrentUser('id') userId: string,
    @Body() { listIds }: ReorderListsDto,
  ): Promise<void> {
    return this.preferences.reorder(userId, listIds);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() details: CreateListDto,
  ): Promise<ListDetail> {
    return this.lists.create(userId, details);
  }

  @Get(':listId')
  findOne(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
  ): Promise<ListDetail> {
    return this.lists.findOne(listId, userId);
  }

  @Patch(':listId')
  update(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Body() changes: UpdateListDto,
  ): Promise<ListDetail> {
    return this.lists.update(listId, userId, changes);
  }

  @Delete(':listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
  ): Promise<void> {
    return this.lists.remove(listId, userId);
  }

  /** Pins the list to (or unpins it from) the user's own home page. */
  @Patch(':listId/preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  updatePreferences(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Body() { onHome }: UpdateListPreferencesDto,
  ): Promise<void> {
    return this.preferences.setOnHome(userId, listId, onHome);
  }

  @Post(':listId/sections')
  addSection(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Body() details: CreateSectionDto,
  ): Promise<ListSection> {
    return this.content.addSection(listId, userId, details);
  }

  @Put(':listId/sections/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderSections(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Body() order: ReorderSectionsDto,
  ): Promise<void> {
    return this.content.reorderSections(listId, userId, order);
  }

  @Patch(':listId/sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  renameSection(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() details: UpdateSectionDto,
  ): Promise<void> {
    return this.content.renameSection(listId, sectionId, userId, details);
  }

  @Delete(':listId/sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSection(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ): Promise<void> {
    return this.content.removeSection(listId, sectionId, userId);
  }

  @Post(':listId/sections/:sectionId/entries')
  addEntry(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() details: CreateEntryDto,
  ): Promise<ListEntry> {
    return this.content.addEntry(listId, sectionId, userId, details);
  }

  @Put(':listId/sections/:sectionId/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderEntries(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() order: ReorderEntriesDto,
  ): Promise<void> {
    return this.content.reorderEntries(listId, sectionId, userId, order);
  }

  @Patch(':listId/entries/:entryId')
  updateEntry(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() changes: UpdateEntryDto,
  ): Promise<ListEntry> {
    return this.content.updateEntry(listId, entryId, userId, changes);
  }

  @Delete(':listId/entries/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEntry(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ): Promise<void> {
    return this.content.removeEntry(listId, entryId, userId);
  }

  @Post(':listId/members')
  addMember(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Body() details: AddListMemberDto,
  ): Promise<ListMember> {
    return this.lists.addMember(listId, userId, details);
  }

  /** Stops sharing the list. */
  @Delete(':listId/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAllMembers(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
  ): Promise<void> {
    return this.lists.removeAllMembers(listId, userId);
  }

  @Patch(':listId/members/:userId')
  updateMember(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('userId', ParseUUIDPipe) memberUserId: string,
    @Body() changes: UpdateListMemberDto,
  ): Promise<ListMember> {
    return this.lists.updateMember(listId, memberUserId, userId, changes);
  }

  @Delete(':listId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser('id') userId: string,
    @ListId() listId: string,
    @Param('userId', ParseUUIDPipe) memberUserId: string,
  ): Promise<void> {
    return this.lists.removeMember(listId, memberUserId, userId);
  }
}
