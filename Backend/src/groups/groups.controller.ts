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

  @Get('me')
  getMine(@CurrentUser('id') userId: string): Promise<GroupDetails | null> {
    return this.groupsService.findForUser(userId);
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

  @Patch('me')
  update(
    @CurrentUser('id') userId: string,
    @Body() details: UpdateGroupDto,
  ): Promise<GroupDetails> {
    return this.groupsService.update(userId, details);
  }

  @Post('me/invite-code')
  @HttpCode(HttpStatus.OK)
  rotateInviteCode(@CurrentUser('id') userId: string): Promise<GroupDetails> {
    return this.groupsService.rotateInviteCode(userId);
  }

  @Patch('me/owner')
  transferOwnership(
    @CurrentUser('id') userId: string,
    @Body() details: TransferOwnershipDto,
  ): Promise<GroupDetails> {
    return this.groupsService.transferOwnership(userId, details.userId);
  }

  @Delete('me/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser('id') userId: string,
    @Param('userId', ParseUUIDPipe) memberUserId: string,
  ): Promise<void> {
    return this.groupsService.removeMember(userId, memberUserId);
  }

  @Post('me/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@CurrentUser('id') userId: string): Promise<void> {
    return this.groupsService.leave(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser('id') userId: string): Promise<void> {
    return this.groupsService.delete(userId);
  }
}
