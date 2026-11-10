import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AvatarType } from '@plano/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { detectImageType, type UploadedImage } from './avatar-image';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './user.entity';
import { toAuthUser } from './user.mapper';
import { errorCode } from '../errors/error-code';

export interface StoredAvatar {
  data: Buffer;
  type: AvatarType;
}

/** The signed-in user's own Plano settings: language, profile picture, terms. */
@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  /** The language: the name, username and e-mail address follow the Synapse account. */
  async updateProfile(
    userId: string,
    { locale }: UpdateProfileDto,
  ): Promise<AuthUser> {
    return this.updateUser(userId, (user) => {
      if (locale) user.locale = locale;
    });
  }

  /** Plano's own terms, once; accepting again keeps the first date. */
  async acceptTerms(userId: string): Promise<AuthUser> {
    return this.updateUser(userId, (user) => {
      user.termsAcceptedAt ??= new Date();
    });
  }

  async setAvatar(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<AuthUser> {
    if (!file?.size) {
      throw new BadRequestException(
        'Choose an image.',
        errorCode('users.imageRequired'),
      );
    }
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new BadRequestException(
        'Choose a JPEG, PNG or WebP image.',
        errorCode('users.imageType'),
      );
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
      throw new NotFoundException(
        'No profile picture.',
        errorCode('users.noAvatar'),
      );
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
        if (!user)
          throw new NotFoundException(
            'User not found.',
            errorCode('users.notFound'),
          );
        await change(user, manager);
        return toAuthUser(await manager.save(user));
      }),
    );
  }
}
