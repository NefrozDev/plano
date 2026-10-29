import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AvatarType } from '@plano/common';
import { DataSource, type EntityManager, Not } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { detectImageType, type UploadedImage } from './avatar-image';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './user.entity';
import { toAuthUser } from './user.mapper';
import {
  isUniqueConstraintError,
  normalizeIdentifier,
  USERNAME_TAKEN_MESSAGE,
} from './username';

export interface StoredAvatar {
  data: Buffer;
  type: AvatarType;
}

/** The signed-in user's own account settings: username, language and profile picture. */
@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  async updateProfile(
    userId: string,
    { locale, username }: UpdateProfileDto,
  ): Promise<AuthUser> {
    try {
      return await this.updateUser(userId, async (user, manager) => {
        if (locale) user.locale = locale;
        if (username === undefined) return;
        const normalized = normalizeIdentifier(username);
        // normalizedUsername is not selected; username is stored normalized.
        if (normalized === normalizeIdentifier(user.username)) return;
        const taken = await manager.exists(User, {
          where: { normalizedUsername: normalized, id: Not(userId) },
        });
        if (taken) throw new ConflictException(USERNAME_TAKEN_MESSAGE);
        // Stored lower case, as at registration.
        user.username = normalized;
        user.normalizedUsername = normalized;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(USERNAME_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  /** Whether `username` is free for this user (their own current name counts as free). */
  async isUsernameAvailable(
    userId: string,
    username: string,
  ): Promise<boolean> {
    const taken = await this.dataSource.getRepository(User).exists({
      where: {
        normalizedUsername: normalizeIdentifier(username),
        id: Not(userId),
      },
    });
    return !taken;
  }

  async setAvatar(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<AuthUser> {
    if (!file?.size) {
      throw new BadRequestException('Choisissez une image.');
    }
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new BadRequestException('Choisissez une image JPEG, PNG ou WebP.');
    }
    return this.updateUser(userId, (user) => {
      user.avatar = file.buffer;
      user.avatarType = type;
      user.avatarUpdatedAt = new Date();
    });
  }

  async removeAvatar(userId: string): Promise<AuthUser> {
    return this.updateUser(userId, (user) => {
      user.avatar = null;
      user.avatarType = null;
      user.avatarUpdatedAt = null;
    });
  }

  async findAvatar(userId: string): Promise<StoredAvatar> {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.avatar')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user?.avatar || !user.avatarType) {
      throw new NotFoundException('Aucune photo de profil.');
    }
    return { data: user.avatar, type: user.avatarType };
  }

  private async updateUser(
    userId: string,
    change: (user: User, manager: EntityManager) => void | Promise<void>,
  ): Promise<AuthUser> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: userId } });
        if (!user) throw new NotFoundException('Utilisateur introuvable.');
        await change(user, manager);
        return toAuthUser(await manager.save(user));
      }),
    );
  }
}
