import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AllowedOriginGuard } from './allowed-origin.guard';
import {
  LOGIN_THROTTLE,
  PASSWORD_RESET_CONFIRM_THROTTLE,
  PASSWORD_RESET_THROTTLE,
  REGISTER_THROTTLE,
  SESSION_COOKIE_NAME,
} from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import {
  ConfirmPasswordResetDto,
  PasswordResetDto,
} from './dto/password-reset.dto';
import { PasswordResetService } from './password-reset.service';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionSettingsService } from './session-settings.service';

@Controller('auth')
@UseGuards(AllowedOriginGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionSettings: SessionSettingsService,
    private readonly passwordResets: PasswordResetService,
  ) {}

  @Post('register')
  @Throttle(REGISTER_THROTTLE)
  async register(
    @Body() details: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const authentication = await this.authService.register(details);
    this.sessionSettings.setCookie(
      response,
      authentication.token,
      authentication.expiresAt,
    );

    return authentication.user;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(LOGIN_THROTTLE)
  async login(
    @Body() credentials: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const authentication = await this.authService.login(credentials);
    this.sessionSettings.setCookie(
      response,
      authentication.token,
      authentication.expiresAt,
    );

    return authentication.user;
  }

  /** Same answer whether or not the address has an account. */
  @Post('password-reset')
  @HttpCode(204)
  @Throttle(PASSWORD_RESET_THROTTLE)
  async requestPasswordReset(
    @Body() { email }: PasswordResetDto,
  ): Promise<void> {
    await this.passwordResets.request(email);
  }

  /** Sets the new password and signs the account out everywhere. */
  @Post('password-reset/confirm')
  @HttpCode(204)
  @Throttle(PASSWORD_RESET_CONFIRM_THROTTLE)
  async confirmPasswordReset(
    @Body() { token, password }: ConfirmPasswordResetDto,
  ): Promise<void> {
    await this.passwordResets.confirm(token, password);
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  getSession(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request.cookies[SESSION_COOKIE_NAME]);
    this.sessionSettings.clearCookie(response);
  }
}
