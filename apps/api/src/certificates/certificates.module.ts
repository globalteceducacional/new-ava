import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import {
  CertificatesController,
  CourseCertificatesController,
} from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [CertificatesController, CourseCertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
