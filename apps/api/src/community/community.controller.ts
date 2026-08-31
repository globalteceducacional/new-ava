import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CommunityService } from './community.service';
import { CreateReplyDto, CreateTopicDto } from './dto/community.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('courses/:courseId/topics')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  list(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
    @Query('moduleVideoId') moduleVideoId?: string,
  ) {
    return this.community.listTopics(courseId, user, moduleVideoId);
  }

  @Post('courses/:courseId/topics')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateTopicDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.community.createTopic(courseId, dto, user);
  }

  @Get('topics/:topicId')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  get(@Param('topicId') topicId: string, @CurrentUser() user: AuthUser) {
    return this.community.getTopic(topicId, user);
  }

  @Post('topics/:topicId/replies')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  reply(
    @Param('topicId') topicId: string,
    @Body() dto: CreateReplyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.community.reply(topicId, dto, user);
  }

  @Delete('topics/:topicId')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  remove(@Param('topicId') topicId: string, @CurrentUser() user: AuthUser) {
    return this.community.softDeleteTopic(topicId, user);
  }

  @Delete('replies/:replyId')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  removeReply(
    @Param('replyId') replyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.community.softDeleteReply(replyId, user);
  }
}
