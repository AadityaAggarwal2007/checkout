const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const config = {
  entryPoints: [path.join(__dirname, 'src/index.js')],
  bundle: true,
  outfile: path.join(__dirname, '../server/public/widget.js'),
  format: 'iife',
  minify: !isWatch,
  target: ['es2018'],
  globalName: 'ShopDrawer',
};

if (isWatch) {
  esbuild.context(config).then(ctx => {
    ctx.watch();
    console.log('Watching for widget changes...');
  });
} else {
  esbuild.build(config).then(() => {
    console.log('Widget built successfully');
  });
}
