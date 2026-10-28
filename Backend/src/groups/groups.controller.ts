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
  UseGuards,
} from '@nestjs/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { JoinGroupDto } from './dto/join-group.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import type { GroupDetails } from './group.types';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string): Promise<GroupDetails[]> {
    return this.groupsService.findAllForUser(userId);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() details: CreateGroupDto,
  ): Promise<GroupDetails> {
    return this.groupsService.create(userId, details);
  }

  @Post('join')
  join(
    @CurrentUser('id') userId: string,
    @Body() details: JoinGroupDto,
  ): Promise<GroupDetails> {
    return this.groupsService.join(userId, details);
  }

  @Get(':groupId')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<GroupDetails> {
    return this.groupsService.findOneForUser(userId, groupId);
  }

  @Patch(':groupId')
  update(
    @CurrentUser('id') userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() details: UpdateGroupDto,
  ): Promise<GroupDetails> {
    return this.groupsService.update(userId, groupId, details);
  }

  @Post(':groupId/invite-code')
  @HttpCode(HttpStatus.OK)
  rotateInviteCode(
    @CurrentUser('id') userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<GroupDetails> {
    return this.groupsService.rotateInviteCode(userId, groupId);
  }

  @Patch(':groupId/owner')
  transferOwnership(
    @CurrentUser('id') userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() details: TransferOwnershipDto,
  ): Promise<GroupDetails> {
    return this.groupsService.transferOwnership(
      userId,
      groupId,
      details.userId,
    );
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser('id') userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) memberUserId: string,
  ): Promise<void> {
    return this.groupsService.removeMember(userId, groupId, memberUserId);
  }

  @Post(':groupId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @CurrentUser('id') userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    return this.groupsService.leave(userId, groupId);
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser('id') userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    return this.groupsService.delete(userId, groupId);
  }
}
