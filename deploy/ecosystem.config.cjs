/**
 * PM2 apps of the checkout product on the VPS. They run as the Linux user `checkout` with that
 * user's own PM2 (not ShipTrack's), listen on 127.0.0.1 only, and read secrets from
 * /etc/checkout/checkout.env. Started by deploy/install.sh and deploy/update.sh.
 */
const APP = '/srv/checkout/app';
const ENV_FILE = '/etc/checkout/checkout.env';

function readEnv() {
  const out = {};
  try {
    for (const line of require('fs').readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* install.sh writes it first */
  }
  return out;
}
const env = readEnv();
const demo = env.CHECKOUT_MODE === 'demo';

const apps = [
  {
    name: 'checkout-api',
    cwd: `${APP}/apps/server`,
    script: 'src/main.ts',
    interpreter: 'node', // PM2 would guess bun for .ts
    node_args: `--env-file=${ENV_FILE} --import tsx`,
    max_memory_restart: '600M',
  },
  {
    name: 'checkout-dashboard',
    cwd: `${APP}/apps/dashboard`,
    script: `${APP}/node_modules/next/dist/bin/next`,
    args: `start -p ${env.DASHBOARD_PORT || 5203} -H 127.0.0.1`,
    env: { NODE_ENV: 'production', API_URL: `http://127.0.0.1:${env.PORT || 5202}` },
    max_memory_restart: '500M',
  },
];
if (demo) {
  apps.push({
    name: 'checkout-demo-store',
    cwd: `${APP}/apps/devstore`,
    script: 'server.ts',
    interpreter: 'node',
    node_args: '--import tsx',
    env: { PORT: env.DEMO_STORE_PORT || '5204', API_URL: env.PUBLIC_URL, WIDGET_KEY: 'dev-widget-key' },
    max_memory_restart: '200M',
  });
}
module.exports = { apps };
