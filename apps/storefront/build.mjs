import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: { loader: 'src/index.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: ['es2019', 'safari13'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
  const size = gzipSync(readFileSync('dist/loader.js')).length;
  console.log(`loader.js gzip: ${(size / 1024).toFixed(1)} KB (budget 25 KB)`);
  if (size > 25 * 1024) {
    console.error('storefront bundle is over its 25 KB gzip budget');
    process.exit(1);
  }
}
