import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: { app: 'src/main.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: ['es2019', 'safari13'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  // zod (via @checkout/shared) is not needed in the page: only types and small helpers are used.
  treeShaking: true,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
  const size = gzipSync(readFileSync('dist/app.js')).length + gzipSync(readFileSync('dist/app.css')).length;
  console.log(`checkout app gzip: ${(size / 1024).toFixed(1)} KB (budget 45 KB)`);
  if (size > 45 * 1024) {
    console.error('checkout bundle is over its 45 KB gzip budget');
    process.exit(1);
  }
}
