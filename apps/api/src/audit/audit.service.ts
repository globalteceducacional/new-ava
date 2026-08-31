import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    action: AuditAction;
    actorId?: string | null;
    institutionId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        institutionId: input.institutionId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }
}
