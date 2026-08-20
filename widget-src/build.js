const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  format: 'iife',
  minify: !isWatch,
  target: ['es2018'],
};

const builds = [
  {
    ...shared,
    entryPoints: [path.join(__dirname, 'src/index.js')],
    outfile: path.join(__dirname, '../server/public/widget.js'),
    globalName: 'ShopDrawer',
  },
  // Dashboard preview — same components, mocked cart. Kept a separate entry so
  // the storefront bundle never ships the sample data or the fetch stub.
  {
    ...shared,
    entryPoints: [path.join(__dirname, 'src/preview.js')],
    outfile: path.join(__dirname, '../server/public/preview.js'),
    globalName: 'ShopDrawerPreviewBundle',
  },
];

if (isWatch) {
  Promise.all(builds.map(cfg => esbuild.context(cfg).then(ctx => ctx.watch())))
    .then(() => console.log('Watching for widget changes...'));
} else {
  Promise.all(builds.map(cfg => esbuild.build(cfg)))
    .then(() => console.log('Widget + preview built successfully'));
}
