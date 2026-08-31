import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnrollmentStatus, RoleCode } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AuthUser } from '../auth/auth.types';
import { CourseAccessService } from '../courses/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildCertificatePdf } from './certificate-pdf';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly config: ConfigService,
  ) {}

  private storageDir(): string {
    const configured = this.config.get<string>('CERTIFICATES_DIR');
    const dir =
      configured?.trim() || join(process.cwd(), 'storage', 'certificates');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private absolutePath(fileKey: string): string {
    // Impede path traversal: só o nome do arquivo.
    const safe = fileKey.replace(/[/\\]/g, '');
    return join(this.storageDir(), safe);
  }

  private generateCode(): string {
    const hex = randomBytes(4).toString('hex').toUpperCase();
    return `AVA-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
  }

  async listMine(user: AuthUser) {
    return this.prisma.certificate.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        code: true,
        courseId: true,
        courseTitle: true,
        studentName: true,
        workloadHours: true,
        issuedAt: true,
        course: { select: { id: true, slug: true } },
      },
    });
  }

  async issueForCourse(courseId: string, user: AuthUser) {
    if (user.role !== RoleCode.ALUNO && user.role !== RoleCode.ADM_MASTER) {
      throw new BadRequestException('Apenas o aluno pode emitir certificado');
    }

    await this.access.assertCanView(courseId, user);
    const eligible = await this.isCourseCompleted(courseId, user.id);
    if (!eligible) {
      throw new BadRequestException(
        'Conclua todas as aulas do curso para emitir o certificado',
      );
    }

    const existing = await this.prisma.certificate.findUnique({
      where: {
        userId_courseId: { userId: user.id, courseId },
      },
    });
    if (existing) return this.toDto(existing);

    return this.createCertificate(courseId, user.id);
  }

  /** Chamado após progresso marcar o curso como concluído. */
  async issueIfEligible(courseId: string, userId: string) {
    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) return existing;

    const eligible = await this.isCourseCompleted(courseId, userId);
    if (!eligible) return null;

    try {
      return await this.createCertificate(courseId, userId);
    } catch {
      return null;
    }
  }

  async verifyByCode(code: string) {
    const normalized = code.trim().toUpperCase();
    const cert = await this.prisma.certificate.findUnique({
      where: { code: normalized },
      select: {
        code: true,
        studentName: true,
        courseTitle: true,
        issuedAt: true,
        courseId: true,
        workloadHours: true,
      },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado');
    return {
      valid: true,
      code: cert.code,
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      issuedAt: cert.issuedAt,
      courseId: cert.courseId,
      workloadHours: cert.workloadHours,
    };
  }

  private async pdfStreamable(cert: {
    studentName: string;
    courseTitle: string;
    issuedAt: Date;
    code: string;
    workloadHours: number;
  }) {
    const pdf = await buildCertificatePdf({
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      issuedAt: cert.issuedAt,
      code: cert.code,
      workloadHours: cert.workloadHours,
      publicOrigin: this.publicOrigin(),
    });
    return new StreamableFile(Buffer.from(pdf), {
      type: 'application/pdf',
      disposition: `attachment; filename="certificado-${cert.code}.pdf"`,
    });
  }

  private streamFile(fileKey: string, code: string) {
    const path = this.absolutePath(fileKey);
    if (!existsSync(path)) {
      throw new NotFoundException('Arquivo do certificado indisponível');
    }
    const stream = createReadStream(path);
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="certificado-${code}.pdf"`,
    });
  }

  async downloadByCode(code: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado');
    return this.pdfStreamable(cert);
  }

  async downloadForOwner(certificateId: string, user: AuthUser) {
    const cert = await this.prisma.certificate.findFirst({
      where: { id: certificateId, userId: user.id },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado');
    return this.pdfStreamable(cert);
  }

  private async isCourseCompleted(
    courseId: string,
    userId: string,
  ): Promise<boolean> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        courseId,
        userId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        completedAt: { not: null },
      },
    });
    if (enrollment) return true;

    const [total, watched] = await Promise.all([
      this.prisma.moduleVideo.count({
        where: {
          deletedAt: null,
          module: { courseId, deletedAt: null },
        },
      }),
      this.prisma.lessonProgress.count({
        where: {
          userId,
          courseId,
          completedAt: { not: null },
        },
      }),
    ]);
    return total > 0 && watched >= total;
  }

  private async createCertificate(courseId: string, userId: string) {
    const [user, course] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.course.findFirst({
        where: { id: courseId, deletedAt: null },
        select: { id: true, title: true, workloadHours: true },
      }),
    ]);
    if (!user || !course) {
      throw new NotFoundException('Curso ou usuário não encontrado');
    }

    // Garante completedAt na matrícula, se existir.
    await this.prisma.enrollment.updateMany({
      where: {
        courseId,
        userId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        completedAt: null,
      },
      data: { completedAt: new Date() },
    });

    let code = this.generateCode();
    for (let i = 0; i < 5; i++) {
      const clash = await this.prisma.certificate.findUnique({
        where: { code },
      });
      if (!clash) break;
      code = this.generateCode();
    }

    const issuedAt = new Date();
    const id = createHash('sha256')
      .update(`${userId}:${courseId}:${issuedAt.toISOString()}`)
      .digest('hex')
      .slice(0, 24);
    const fileKey = `${id}.pdf`;
    const workloadHours = Math.max(0, Math.floor(course.workloadHours ?? 0));

    const pdf = await buildCertificatePdf({
      studentName: user.name,
      courseTitle: course.title,
      issuedAt,
      code,
      workloadHours,
      publicOrigin: this.publicOrigin(),
    });
    writeFileSync(this.absolutePath(fileKey), pdf);

    const created = await this.prisma.certificate.create({
      data: {
        id,
        code,
        userId,
        courseId,
        fileKey,
        studentName: user.name,
        courseTitle: course.title,
        workloadHours,
        issuedAt,
      },
    });

    return this.toDto(created);
  }

  /** Regrava o PDF a partir do snapshot do certificado (útil após mudança de template). */
  async rewritePdfFile(cert: {
    fileKey: string;
    studentName: string;
    courseTitle: string;
    issuedAt: Date;
    code: string;
    workloadHours: number;
  }) {
    const pdf = await buildCertificatePdf({
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      issuedAt: cert.issuedAt,
      code: cert.code,
      workloadHours: cert.workloadHours,
      publicOrigin: this.publicOrigin(),
    });
    writeFileSync(this.absolutePath(cert.fileKey), pdf);
  }

  private publicOrigin(): string {
    return (
      this.config.get<string>('PUBLIC_WEB_ORIGIN') ??
      this.config.get<string>('WEB_ORIGIN') ??
      'http://localhost:3001'
    );
  }

  private toDto(cert: {
    id: string;
    code: string;
    courseId: string;
    studentName: string;
    courseTitle: string;
    issuedAt: Date;
    workloadHours?: number;
  }) {
    return {
      id: cert.id,
      code: cert.code,
      courseId: cert.courseId,
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      workloadHours: cert.workloadHours ?? 0,
      issuedAt: cert.issuedAt,
      verifyPath: `/verificar/${cert.code}`,
    };
  }
}
