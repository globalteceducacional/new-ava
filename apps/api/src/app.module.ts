import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ActivitiesModule } from './activities/activities.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { CommonModule } from './common/common.module';
import { CommunityModule } from './community/community.module';
import { ContentItemsModule } from './content-items/content-items.module';
import { CoursesModule } from './courses/courses.module';
import { GradesModule } from './grades/grades.module';
import { HealthModule } from './health/health.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { MediaModule } from './media/media.module';
import { ModulesContentModule } from './modules-content/modules-content.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { CertificatesModule } from './certificates/certificates.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { RedisModule } from './redis/redis.module';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '..', '..', '.env'),
        join(__dirname, '..', '.env'),
      ],
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (
        config: ConfigService,
        redisStorage: RedisThrottlerStorage,
      ) => {
        // Local: memória (sem RTT Redis por request). Prod: Redis (multi-réplica).
        // Force Redis: THROTTLE_STORAGE=redis
        const storageMode = (
          config.get<string>('THROTTLE_STORAGE') ?? ''
        ).toLowerCase();
        const useRedis =
          storageMode === 'redis' ||
          (storageMode !== 'memory' &&
            config.get<string>('NODE_ENV') === 'production');

        return {
          storage: useRedis ? redisStorage : undefined,
          throttlers: [
            {
              name: 'default',
              ttl: Number(config.get('THROTTLE_TTL_MS') ?? 60_000),
              limit: Number(config.get('THROTTLE_LIMIT') ?? 120),
            },
          ],
          skipIf: (ctx) => {
            const req = ctx.switchToHttp().getRequest<{ url?: string }>();
            const path = req.url?.split('?')[0] ?? '';
            return (
              path === '/health' ||
              path === '/metrics' ||
              path.startsWith('/health/') ||
              path.startsWith('/metrics/') ||
              path === '/media/cdn-auth' ||
              /\/media\/[^/]+\/hls(\/|$)/.test(path)
            );
          },
        };
      },
    }),
    CommonModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    AdminModule,
    UsersModule,
    CategoriesModule,
    CoursesModule,
    InstitutionsModule,
    ContentItemsModule,
    ModulesContentModule,
    ActivitiesModule,
    QuizzesModule,
    GradesModule,
    CommunityModule,
    NotificationsModule,
    ProgressModule,
    CertificatesModule,
    MediaModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
