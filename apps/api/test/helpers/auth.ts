import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SEED_PASSWORD } from '../../prisma/seed';

export async function loginAs(
  app: INestApplication,
  login: string,
): Promise<{ token: string; user: { id: string; role: string } }> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ login, password: SEED_PASSWORD })
    .expect(200);
  const body = res.body as {
    accessToken: string;
    user: { id: string; role: string };
  };
  return { token: body.accessToken, user: body.user };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
