import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { RequestLoggingMiddleware } from './request-logging.middleware';

@Module({})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
