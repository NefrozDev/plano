import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MAX_AVATAR_BYTES, type UploadedImage } from './avatar-image';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() details: UpdateProfileDto,
  ): Promise<AuthUser> {
    return this.users.updateProfile(userId, details);
  }

  /**
   * Multipart upload, field `avatar`. Multer keeps the file in memory and
   * answers 413 past the size limit before the handler even runs.
   */
  @Put('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 },
    }),
  )
  setAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<AuthUser> {
    return this.users.setAvatar(userId, file);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser('id') userId: string): Promise<AuthUser> {
    return this.users.removeAvatar(userId);
  }

  /** Any signed-in user may see a profile picture, as they see names. */
  @Get(':userId/avatar')
  async avatar(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const avatar = await this.users.findAvatar(userId);
    response.set({
      // URLs carry ?v=avatarVersion: a new picture gets a new URL.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(avatar.data, { type: avatar.type });
  }
}
