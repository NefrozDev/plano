import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import type { GroupSummary } from './group.types';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get('me')
  getMine(@Req() request: AuthenticatedRequest): Promise<GroupSummary | null> {
    return this.groupsService.findForUser(this.userId(request));
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() details: CreateGroupDto,
  ): Promise<GroupSummary> {
    return this.groupsService.create(this.userId(request), details);
  }

  private userId(request: AuthenticatedRequest): string {
    if (!request.authUser) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }
    return request.authUser.id;
  }
}
