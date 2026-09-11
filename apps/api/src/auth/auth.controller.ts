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
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthUser } from './auth.types';
import { accessTokenMaxAgeMs } from './jwt-secret.util';
import { ACCESS_COOKIE, UI_ROLE_COOKIE, UI_SESSION_COOKIE } from './strategies/jwt.strategy';

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
    this.setUiCookies(res, result.user.role);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    this.setRefreshCookie(res, result.refreshToken);
    this.setAccessCookie(res, result.accessToken);
    this.setUiCookies(res, result.user.role);

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
    this.setUiCookies(res, result.user.role);
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
    this.clearUiCookies(res);
    res.clearCookie('ava_media', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    return { ok: true };
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  me(@CurrentUser() user: AuthUser) {
    if (!user) throw new UnauthorizedException();
    return { user };
  }

  private cookieBase() {
    const isProd = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict' as const,
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    const days = Number(this.config.get('JWT_REFRESH_DAYS') ?? 7);
    // path `/` — atrás do nginx o browser chama `/api/auth/refresh`, não `/auth/...`.
    res.cookie(this.authService.refreshCookieName, token, {
      ...this.cookieBase(),
      path: '/',
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }

  private setAccessCookie(res: Response, token: string): void {
    res.cookie(ACCESS_COOKIE, token, {
      ...this.cookieBase(),
      path: '/',
      maxAge: accessTokenMaxAgeMs(this.config),
    });
  }

  /** Cookies de navegação do Next — mesmos flags do access; o JS não consegue forjar HttpOnly. */
  private setUiCookies(res: Response, role: string): void {
    const days = Number(this.config.get('JWT_REFRESH_DAYS') ?? 7);
    const maxAge = days * 24 * 60 * 60 * 1000;
    const flags = { ...this.cookieBase(), path: '/', maxAge };
    res.cookie(UI_SESSION_COOKIE, '1', flags);
    res.cookie(UI_ROLE_COOKIE, role, flags);
  }

  private clearRefreshCookie(res: Response): void {
    const base = this.cookieBase();
    res.clearCookie(this.authService.refreshCookieName, { ...base, path: '/' });
    res.clearCookie(this.authService.refreshCookieName, { ...base, path: '/auth' });
  }

  private clearAccessCookie(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase(), path: '/' });
  }

  private clearUiCookies(res: Response): void {
    const base = { ...this.cookieBase(), path: '/' };
    res.clearCookie(UI_SESSION_COOKIE, base);
    res.clearCookie(UI_ROLE_COOKIE, base);
  }
}
