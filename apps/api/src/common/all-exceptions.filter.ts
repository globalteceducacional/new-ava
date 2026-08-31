import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Evita vazamento de stack/estrutura interna em respostas HTTP.
 * Em produção, 500 genérico; em dev, mensagem sem stack na resposta.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const isProd = process.env.NODE_ENV === 'production';

    let clientMessage: string | string[] = 'Erro interno do servidor';
    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') clientMessage = body;
      else if (typeof body === 'object' && body !== null && 'message' in body) {
        clientMessage = (body as { message: string | string[] }).message;
      }
    }

    if (!isHttp || status >= 500) {
      this.logger.error(
        {
          path: req.url,
          method: req.method,
          status,
          err:
            exception instanceof Error
              ? {
                  name: exception.name,
                  message: exception.message,
                  stack: exception.stack,
                }
              : exception,
        },
        'Unhandled error',
      );
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      message:
        !isHttp && isProd
          ? 'Erro interno do servidor'
          : !isHttp
            ? 'Erro interno do servidor'
            : clientMessage,
      timestamp: new Date().toISOString(),
    };

    // Nunca incluir stack na resposta HTTP
    res.status(status).json(payload);
  }
}
