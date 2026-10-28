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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  Friend,
  FriendRequests,
  SendFriendRequestResult,
  UserSearchResult,
} from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SearchUsersDto, SendFriendRequestDto } from './dto/friends.dto';
import { FriendsService } from './friends.service';

/** Searching usernames is the one way to discover accounts: rate limit it tighter. */
export const SEARCH_THROTTLE = { default: { limit: 30, ttl: 60 * 1000 } };

@Controller('friends')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string): Promise<Friend[]> {
    return this.friends.listFriends(userId);
  }

  @Get('search')
  @Throttle(SEARCH_THROTTLE)
  search(
    @CurrentUser('id') userId: string,
    @Query() { q }: SearchUsersDto,
  ): Promise<UserSearchResult[]> {
    return this.friends.search(userId, q);
  }

  @Get('requests')
  findRequests(@CurrentUser('id') userId: string): Promise<FriendRequests> {
    return this.friends.listRequests(userId);
  }

  @Post('requests')
  sendRequest(
    @CurrentUser('id') userId: string,
    @Body() { userId: targetUserId }: SendFriendRequestDto,
  ): Promise<SendFriendRequestResult> {
    return this.friends.sendRequest(userId, targetUserId);
  }

  @Post('requests/:requestId/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser('id') userId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<Friend> {
    return this.friends.accept(userId, requestId);
  }

  @Delete('requests/:requestId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRequest(
    @CurrentUser('id') userId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<void> {
    return this.friends.removeRequest(userId, requestId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFriend(
    @CurrentUser('id') userId: string,
    @Param('userId', ParseUUIDPipe) friendId: string,
  ): Promise<void> {
    return this.friends.removeFriend(userId, friendId);
  }
}
