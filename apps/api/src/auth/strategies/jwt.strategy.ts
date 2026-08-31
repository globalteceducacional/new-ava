import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import type { AuthUser, JwtPayload } from '../auth.types';
import { resolveJwtSecret } from '../jwt-secret.util';

export const ACCESS_COOKIE = 'ava_access';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          const raw: unknown = req.cookies?.[ACCESS_COOKIE];
          return typeof raw === 'string' && raw.length ? raw : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    return this.authService.validateUserById(payload.sub);
  }
}
