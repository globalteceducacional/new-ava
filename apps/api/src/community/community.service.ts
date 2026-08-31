import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { softDeleteData } from '../common/soft-delete';
import { CourseAccessService } from '../courses/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReplyDto, CreateTopicDto } from './dto/community.dto';

/** Profundidade máxima de comentários aninhados (0 = raiz). */
const MAX_REPLY_DEPTH = 4;

type ReplyAuthor = { id: string; name: string; role: string };

export type ReplyNode = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  author: ReplyAuthor;
  children: ReplyNode[];
};

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async listTopics(courseId: string, user: AuthUser, moduleVideoId?: string) {
    await this.access.assertCanView(courseId, user);
    return this.prisma.communityTopic.findMany({
      where: {
        courseId,
        deletedAt: null,
        ...(moduleVideoId ? { moduleVideoId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: { select: { code: true } },
          },
        },
        moduleVideo: { select: { id: true, title: true } },
        module: { select: { id: true, title: true } },
        _count: {
          select: { replies: { where: { deletedAt: null } } },
        },
      },
    });
  }

  async getTopic(topicId: string, user: AuthUser) {
    const topic = await this.prisma.communityTopic.findFirst({
      where: { id: topicId, deletedAt: null },
      include: {
        author: {
          select: { id: true, name: true, role: { select: { code: true } } },
        },
        moduleVideo: { select: { id: true, title: true } },
        module: { select: { id: true, title: true } },
        course: { select: { id: true, title: true } },
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: { select: { code: true } },
              },
            },
          },
        },
      },
    });
    if (!topic) throw new NotFoundException('Publicação não encontrada');
    await this.access.assertCanView(topic.courseId, user);

    const flat = topic.replies.map((r) => ({
      id: r.id,
      body: r.body,
      parentId: r.parentId,
      createdAt: r.createdAt,
      author: {
        id: r.author.id,
        name: r.author.name,
        role: r.author.role.code,
      },
    }));

    return {
      id: topic.id,
      courseId: topic.courseId,
      course: topic.course,
      title: topic.title,
      body: topic.body,
      createdAt: topic.createdAt,
      moduleVideo: topic.moduleVideo,
      module: topic.module,
      author: {
        id: topic.author.id,
        name: topic.author.name,
        role: topic.author.role.code,
      },
      replies: this.buildReplyTree(flat),
    };
  }

  async createTopic(courseId: string, dto: CreateTopicDto, user: AuthUser) {
    await this.assertCanPost(courseId, user);

    return this.prisma.communityTopic.create({
      data: {
        courseId,
        authorId: user.id,
        title: dto.title.trim(),
        body: dto.body.trim(),
        moduleId: dto.moduleId,
        moduleVideoId: dto.moduleVideoId,
        contentItemId: dto.contentItemId,
        createdBy: user.id,
      },
    });
  }

  async reply(topicId: string, dto: CreateReplyDto, user: AuthUser) {
    const topic = await this.prisma.communityTopic.findFirst({
      where: { id: topicId, deletedAt: null },
    });
    if (!topic) throw new NotFoundException('Publicação não encontrada');
    await this.assertCanPost(topic.courseId, user);

    let parentId: string | null = dto.parentId?.trim() || null;
    if (parentId) {
      const parent = await this.prisma.communityReply.findFirst({
        where: { id: parentId, topicId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!parent) {
        throw new BadRequestException('Comentário pai inválido');
      }
      const depth = await this.replyDepth(parent.id);
      if (depth + 1 > MAX_REPLY_DEPTH) {
        throw new BadRequestException(
          `Máximo de ${MAX_REPLY_DEPTH + 1} níveis de resposta`,
        );
      }
    } else {
      parentId = null;
    }

    const reply = await this.prisma.communityReply.create({
      data: {
        topicId,
        authorId: user.id,
        parentId,
        body: dto.body.trim(),
        createdBy: user.id,
      },
      include: {
        author: {
          select: { id: true, name: true, role: { select: { code: true } } },
        },
      },
    });

    return {
      id: reply.id,
      body: reply.body,
      parentId: reply.parentId,
      createdAt: reply.createdAt,
      author: {
        id: reply.author.id,
        name: reply.author.name,
        role: reply.author.role.code,
      },
      children: [] as ReplyNode[],
    };
  }

  async softDeleteTopic(topicId: string, user: AuthUser) {
    const topic = await this.prisma.communityTopic.findFirst({
      where: { id: topicId, deletedAt: null },
    });
    if (!topic) throw new NotFoundException('Publicação não encontrada');
    await this.assertCanModerate(topic.courseId, user, topic.authorId);
    return this.prisma.communityTopic.update({
      where: { id: topicId },
      data: softDeleteData(user.id),
    });
  }

  async softDeleteReply(replyId: string, user: AuthUser) {
    const reply = await this.prisma.communityReply.findFirst({
      where: { id: replyId, deletedAt: null },
      include: { topic: { select: { courseId: true } } },
    });
    if (!reply) throw new NotFoundException('Comentário não encontrado');
    await this.assertCanModerate(reply.topic.courseId, user, reply.authorId);

    // Remove o comentário e toda a subárvore (moderação limpa).
    const ids = await this.collectReplySubtreeIds(replyId, reply.topicId);
    await this.prisma.communityReply.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: softDeleteData(user.id),
    });
    return { ok: true, deleted: ids.length };
  }

  /** IDs do comentário e de todos os descendentes no mesmo post. */
  private async collectReplySubtreeIds(
    rootId: string,
    topicId: string,
  ): Promise<string[]> {
    const inTopic = await this.prisma.communityReply.findMany({
      where: { topicId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    const childrenByParent = new Map<string, string[]>();
    for (const r of inTopic) {
      if (!r.parentId) continue;
      const list = childrenByParent.get(r.parentId) ?? [];
      list.push(r.id);
      childrenByParent.set(r.parentId, list);
    }
    const out: string[] = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      out.push(id);
      for (const child of childrenByParent.get(id) ?? []) stack.push(child);
    }
    return out;
  }

  /** Aluno matriculado ou professor/admin que gerencia o curso. */
  private async assertCanPost(courseId: string, user: AuthUser) {
    await this.access.assertCanView(courseId, user);
    if (user.role === RoleCode.ALUNO) {
      await this.access.assertEnrolled(courseId, user.id);
      return;
    }
    if (user.role === RoleCode.ADM_MASTER) return;
    await this.access.assertCanManage(courseId, user);
  }

  private async assertCanModerate(
    courseId: string,
    user: AuthUser,
    authorId: string,
  ) {
    if (user.id === authorId) return;
    if (user.role === RoleCode.ADM_MASTER) return;
    try {
      await this.access.assertCanManage(courseId, user);
    } catch {
      throw new ForbiddenException('Sem permissão para moderar');
    }
  }

  /** Profundidade do comentário (0 = raiz). */
  private async replyDepth(replyId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = replyId;
    while (currentId && depth <= MAX_REPLY_DEPTH + 1) {
      const row: { parentId: string | null } | null =
        await this.prisma.communityReply.findFirst({
          where: { id: currentId },
          select: { parentId: true },
        });
      if (!row?.parentId) break;
      depth += 1;
      currentId = row.parentId;
    }
    return depth;
  }

  private buildReplyTree(
    flat: Array<{
      id: string;
      body: string;
      parentId: string | null;
      createdAt: Date;
      author: ReplyAuthor;
    }>,
  ): ReplyNode[] {
    const byId = new Map<string, ReplyNode>();
    for (const r of flat) {
      byId.set(r.id, { ...r, children: [] });
    }
    const roots: ReplyNode[] = [];
    for (const r of flat) {
      const node = byId.get(r.id)!;
      if (r.parentId && byId.has(r.parentId)) {
        byId.get(r.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}
