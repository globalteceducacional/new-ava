import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

type ReqWithId = Request & { requestId?: string };

/**
 * Request-id + log estruturado de latência/status (JSON em produção).
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: ReqWithId, res: Response, next: NextFunction) {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const started = Date.now();
    res.on('finish', () => {
      const entry = {
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: res.statusCode,
        latencyMs: Date.now() - started,
      };
      if (process.env.NODE_ENV === 'production') {
        this.logger.log(JSON.stringify(entry));
      } else {
        this.logger.log(
          `${entry.method} ${entry.path} ${entry.status} ${entry.latencyMs}ms`,
        );
      }
    });
    next();
  }
}
