import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { User } from '../users/user.entity';
import { AllowedOriginGuard } from './allowed-origin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PasswordReset } from './password-reset.entity';
import { PasswordResetService } from './password-reset.service';
import { Session } from './session.entity';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionSettingsService } from './session-settings.service';

@Module({
  imports: [
    DatabaseModule,
    MailModule,
    TypeOrmModule.forFeature([User, Session, PasswordReset]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AllowedOriginGuard,
    PasswordService,
    PasswordResetService,
    SessionAuthGuard,
    SessionSettingsService,
  ],
  exports: [AllowedOriginGuard, AuthService, SessionAuthGuard],
})
export class AuthModule {}
