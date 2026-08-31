import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { FfmpegService } from './ffmpeg.service';
import { MediaController } from './media.controller';
import { MEDIA_TRANSCODE_QUEUE, MediaProcessor } from './media.processor';
import { MediaService } from './media.service';
import { MinioService } from './minio.service';
import { ModuleVideosController } from './module-videos.controller';
import { ModuleVideosService } from './module-videos.service';

function redisConnection(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: Number(u.port || 6379),
      password: u.password || undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

@Module({
  imports: [
    AuthModule,
    CoursesModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        ),
      }),
    }),
    BullModule.registerQueue({ name: MEDIA_TRANSCODE_QUEUE }),
  ],
  controllers: [MediaController, ModuleVideosController],
  providers: [
    MinioService,
    FfmpegService,
    MediaService,
    MediaProcessor,
    ModuleVideosService,
  ],
  exports: [MediaService, MinioService],
})
export class MediaModule {}
