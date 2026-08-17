import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

@Injectable()
export class AllowedOriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService) {
    this.allowedOrigin =
      originOf(config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200') ??
      'http://localhost:4200';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const requestOrigin = request.get('origin');
    const refererOrigin = originOf(request.get('referer') ?? '');
    const suppliedOrigin = requestOrigin ?? refererOrigin;

    // Non-browser/native clients commonly send neither header. Browsers send an
    // Origin for unsafe cross-site requests, which is the CSRF case we reject.
    if (!suppliedOrigin || suppliedOrigin === this.allowedOrigin) {
      return true;
    }

    throw new ForbiddenException('Origine de requête non autorisée.');
  }
}
