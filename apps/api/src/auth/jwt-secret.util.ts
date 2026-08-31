import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const INSECURE_DEFAULT = 'change-me-in-production-dev-only';

/**
 * Resolve JWT_SECRET. Em produção recusa fallback/ausência.
 * Em desenvolvimento permite o default com aviso no log.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  const isProd = config.get<string>('NODE_ENV') === 'production';

  if (!secret || secret === INSECURE_DEFAULT) {
    if (isProd) {
      throw new Error(
        'JWT_SECRET obrigatório em produção (não use o valor de desenvolvimento)',
      );
    }
    Logger.warn(
      `JWT_SECRET ausente ou inseguro — usando default de desenvolvimento`,
      'JwtSecret',
    );
    return INSECURE_DEFAULT;
  }

  if (isProd && secret.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres em produção');
  }

  return secret;
}

export function accessTokenMaxAgeMs(config: ConfigService): number {
  const raw = config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
  const match = /^(\d+)([smhd])$/i.exec(raw.trim());
  if (!match) return 15 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
}
