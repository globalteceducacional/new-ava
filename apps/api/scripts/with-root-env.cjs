/**
 * Carrega o .env da raiz do monorepo (e opcionalmente apps/api/.env)
 * antes de executar um comando (ex.: prisma).
 *
 * Uso: node scripts/with-root-env.cjs npx prisma migrate deploy
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const apiRoot = path.join(__dirname, '..');
const monorepoRoot = path.join(apiRoot, '..', '..');
loadEnvFile(path.join(monorepoRoot, '.env'));
loadEnvFile(path.join(apiRoot, '.env'));

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Uso: node scripts/with-root-env.cjs <comando> [args...]');
  process.exit(1);
}

const [cmd, ...cmdArgs] = args;
const result = spawnSync(cmd, cmdArgs, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
  cwd: apiRoot,
});
process.exit(result.status ?? 1);
