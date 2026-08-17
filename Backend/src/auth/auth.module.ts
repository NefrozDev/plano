import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../database/database.module';
import { User } from '../users/user.entity';
import { AllowedOriginGuard } from './allowed-origin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { Session } from './session.entity';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionSettingsService } from './session-settings.service';

@Module({
  imports: [DatabaseModule, TypeOrmModule.forFeature([User, Session])],
  controllers: [AuthController],
  providers: [
    AuthService,
    AllowedOriginGuard,
    PasswordService,
    SessionAuthGuard,
    SessionSettingsService,
  ],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
