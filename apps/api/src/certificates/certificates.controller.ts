import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.certificates.verifyByCode(code);
  }

  @Get('verify/:code/pdf')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  downloadPublic(@Param('code') code: string) {
    return this.certificates.downloadByCode(code);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  mine(@CurrentUser() user: AuthUser) {
    return this.certificates.listMine(user);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  download(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.certificates.downloadForOwner(id, user);
  }
}

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseCertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Post(':courseId/certificates')
  @Roles(RoleCode.ALUNO, RoleCode.ADM_MASTER)
  issue(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.certificates.issueForCourse(courseId, user);
  }
}
