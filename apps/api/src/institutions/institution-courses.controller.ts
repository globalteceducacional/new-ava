import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InstitutionScopeGuard } from '../auth/guards/institution-scope.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CoursesService } from '../courses/courses.service';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

class LinkCoursesBody {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  courseIds!: string[];
}

@Controller('institutions/:institutionId/courses')
@UseGuards(JwtAuthGuard, RolesGuard, InstitutionScopeGuard)
export class InstitutionCoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  list(
    @Param('institutionId') institutionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.listInstitutionCourses(institutionId, user);
  }

  @Post()
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  link(
    @Param('institutionId') institutionId: string,
    @Body() body: LinkCoursesBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.linkCoursesToInstitution(
      institutionId,
      body.courseIds,
      user,
    );
  }

  @Delete(':courseId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  unlink(
    @Param('institutionId') institutionId: string,
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.unlinkCourseFromInstitution(
      institutionId,
      courseId,
      user,
    );
  }
}
