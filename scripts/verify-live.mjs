import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
if (process.env.VERCEL && process.env.DATABASE_URL) {
  const require = createRequire(import.meta.url);
  const viteRequire = createRequire(require.resolve('vite/package.json'));
  const { build } = viteRequire('esbuild');
  await mkdir('.cache', { recursive: true });
  await build({ entryPoints: ['scripts/verify-live.ts'], outfile: '.cache/verify-live.mjs',
    bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  const result = spawnSync(process.execPath, ['.cache/verify-live.mjs'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Verifica dati reali fallita: pubblicazione interrotta');
}
