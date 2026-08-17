import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AllowedOriginGuard } from './allowed-origin.guard';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionSettingsService } from './session-settings.service';

@Controller('auth')
@UseGuards(AllowedOriginGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionSettings: SessionSettingsService,
  ) {}

  @Post('register')
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

  @Get('session')
  @UseGuards(SessionAuthGuard)
  getSession(@Req() request: AuthenticatedRequest): AuthUser {
    if (!request.authUser) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    return request.authUser;
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
