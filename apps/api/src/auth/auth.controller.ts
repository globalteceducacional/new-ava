import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthUser } from './auth.types';
import { accessTokenMaxAgeMs } from './jwt-secret.util';
import { ACCESS_COOKIE } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto.login, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    this.setRefreshCookie(res, result.refreshToken);
    this.setAccessCookie(res, result.accessToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[this.authService.refreshCookieName] as
      string | undefined;
    const result = await this.authService.refresh(raw, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, result.refreshToken);
    this.setAccessCookie(res, result.accessToken);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[this.authService.refreshCookieName] as
      string | undefined;
    await this.authService.logout(raw);
    this.clearRefreshCookie(res);
    this.clearAccessCookie(res);
    return { ok: true };
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  me(@CurrentUser() user: AuthUser) {
    if (!user) throw new UnauthorizedException();
    return { user };
  }

  private setRefreshCookie(res: Response, token: string): void {
    const isProd = this.config.get('NODE_ENV') === 'production';
    const days = Number(this.config.get('JWT_REFRESH_DAYS') ?? 7);
    res.cookie(this.authService.refreshCookieName, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/auth',
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }

  private setAccessCookie(res: Response, token: string): void {
    const isProd = this.config.get('NODE_ENV') === 'production';
    res.cookie(ACCESS_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: accessTokenMaxAgeMs(this.config),
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(this.authService.refreshCookieName, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/auth',
    });
  }

  private clearAccessCookie(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
  }
}
