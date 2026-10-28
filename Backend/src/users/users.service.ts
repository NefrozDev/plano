import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AvatarType } from '@plano/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import { detectImageType, type UploadedImage } from './avatar-image';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './user.entity';
import { toAuthUser } from './user.mapper';

export interface StoredAvatar {
  data: Buffer;
  type: AvatarType;
}

/** The signed-in user's own account settings: language and profile picture. */
@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
  ) {}

  async updateProfile(
    userId: string,
    { locale }: UpdateProfileDto,
  ): Promise<AuthUser> {
    return this.updateUser(userId, (user) => {
      if (locale) user.locale = locale;
    });
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
    change: (user: User) => void,
  ): Promise<AuthUser> {
    return this.writeLock.runExclusive(() =>
      this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: userId } });
        if (!user) throw new NotFoundException('Utilisateur introuvable.');
        change(user);
        return toAuthUser(await manager.save(user));
      }),
    );
  }
}
