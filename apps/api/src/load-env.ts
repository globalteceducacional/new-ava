import { existsSync } from 'fs';
import { join } from 'path';
import { config as loadDotenv } from 'dotenv';

/** Side-effect: carrega .env da raiz do monorepo antes do Prisma. */
const candidates = [
  join(__dirname, '..', '..', '..', '.env'),
  join(__dirname, '..', '.env'),
  join(process.cwd(), '.env'),
  join(process.cwd(), '..', '..', '.env'),
];

for (const file of candidates) {
  if (existsSync(file)) {
    loadDotenv({ path: file, override: false });
  }
}
