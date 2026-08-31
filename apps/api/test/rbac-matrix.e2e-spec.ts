import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { RoleCode } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PermissionCode,
  ROLE_PERMISSION_MATRIX,
} from '../src/auth/permissions.constants';
import { runSeed } from '../prisma/seed';

describe('RBAC matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await runSeed();
  });

  afterAll(async () => {
    await app.close();
  });

  const allPermissions = Object.values(PermissionCode);
  const roles = Object.keys(ROLE_PERMISSION_MATRIX);

  it.each(
    roles.flatMap((role) =>
      allPermissions.map((permission) => ({
        role,
        permission,
        expected: ROLE_PERMISSION_MATRIX[role].includes(permission),
      })),
    ),
  )(
    '$role × $permission → $expected',
    async ({ role, permission, expected }) => {
      const row = await prisma.rolePermission.findFirst({
        where: {
          role: { code: role as RoleCode },
          permission: { code: permission },
        },
      });
      expect(Boolean(row)).toBe(expected);
    },
  );
});
