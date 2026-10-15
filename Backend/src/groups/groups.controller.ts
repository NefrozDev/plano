import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
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
  getMine(@Req() request: AuthenticatedRequest): Promise<GroupDetails | null> {
    return this.groupsService.findForUser(this.userId(request));
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() details: CreateGroupDto,
  ): Promise<GroupDetails> {
    return this.groupsService.create(this.userId(request), details);
  }

  @Post('join')
  join(
    @Req() request: AuthenticatedRequest,
    @Body() details: JoinGroupDto,
  ): Promise<GroupDetails> {
    return this.groupsService.join(this.userId(request), details);
  }

  @Patch('me')
  update(
    @Req() request: AuthenticatedRequest,
    @Body() details: UpdateGroupDto,
  ): Promise<GroupDetails> {
    return this.groupsService.update(this.userId(request), details);
  }

  @Post('me/invite-code')
  @HttpCode(HttpStatus.OK)
  rotateInviteCode(
    @Req() request: AuthenticatedRequest,
  ): Promise<GroupDetails> {
    return this.groupsService.rotateInviteCode(this.userId(request));
  }

  @Patch('me/owner')
  transferOwnership(
    @Req() request: AuthenticatedRequest,
    @Body() details: TransferOwnershipDto,
  ): Promise<GroupDetails> {
    return this.groupsService.transferOwnership(
      this.userId(request),
      details.userId,
    );
  }

  @Delete('me/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('userId') memberUserId: string,
  ): Promise<void> {
    return this.groupsService.removeMember(this.userId(request), memberUserId);
  }

  @Post('me/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Req() request: AuthenticatedRequest): Promise<void> {
    return this.groupsService.leave(this.userId(request));
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Req() request: AuthenticatedRequest): Promise<void> {
    return this.groupsService.delete(this.userId(request));
  }

  private userId(request: AuthenticatedRequest): string {
    if (!request.authUser) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }
    return request.authUser.id;
  }
}
