import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(HealthService);
  });

  it('retorna degraded/503-ready quando o Postgres falha', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));

    const result = await service.check();

    expect(result.db).toBe('error');
    expect(result.status).toBe('degraded');
  });
});
