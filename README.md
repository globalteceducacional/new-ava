# AVA Globaltec

Ambiente Virtual de Aprendizagem self-hosted — monorepo TypeScript.

## Stack

| Camada | Tecnologia                              |
| ------ | --------------------------------------- |
| API    | NestJS 11 + Prisma + PostgreSQL         |
| Web    | Next.js 15 (App Router) + React 19      |
| Shared | `@ava/shared` (tipos/enums)             |
| Infra  | Docker Compose (Postgres, Redis, MinIO) |

## Estrutura

```
apps/
  api/          # NestJS — API REST
  web/          # Next.js — painéis por perfil
packages/
  shared/       # Tipos e enums compartilhados
design/         # Mockups HTML (referência visual)
```

## Pré-requisitos

- Node.js >= 20
- Docker + Docker Compose

## Começar

```bash
# 1. Dependências
npm install
npm run build -w @ava/shared

# 2. Infra (Postgres, Redis, MinIO)
copy .env.example .env
docker compose up -d postgres redis minio
npm run smoke:infra

# 3. Prisma
cd apps/api
npx prisma migrate dev
cd ../..

# 4. Apps
npm run dev:api    # http://localhost:3000  — GET /health
npm run dev:web    # http://localhost:3001
```

Documentação de planejamento: [`ava-roadmap.md`](./ava-roadmap.md) · [`ava-mvp-implementation-plan.md`](./ava-mvp-implementation-plan.md)

## Scripts raiz

| Comando                       | Descrição                             |
| ----------------------------- | ------------------------------------- |
| `npm run lint`                | ESLint em todos os workspaces         |
| `npm run typecheck`           | `tsc --noEmit` em todos os workspaces |
| `npm run test`                | Testes unitários                      |
| `npm run build`               | Build de todos os workspaces          |
| `npm run test:e2e:api`        | E2E da API (Supertest)                |
| `npm run smoke:infra`         | Checa Postgres, Redis e MinIO         |
| `npm run dev:api` / `dev:web` | Sobe API ou Web em modo watch         |
