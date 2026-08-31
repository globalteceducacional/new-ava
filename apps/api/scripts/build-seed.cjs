const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const outDir = path.join(__dirname, '../dist/prisma');
const outfile = path.join(outDir, 'seed.js');

fs.mkdirSync(outDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../prisma/seed.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  external: ['@prisma/client', 'argon2'],
});

console.log('[build-seed] wrote', outfile);
