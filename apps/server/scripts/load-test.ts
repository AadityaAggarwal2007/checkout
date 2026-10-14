/**
 * Load test for the shopper-facing API (storefront config, drawer price, checkout start + page state).
 *
 *   npx tsx scripts/load-test.ts --url http://127.0.0.1:5202 --key dev-widget-key --variant 2021 --seconds 20 --users 50
 *
 * Run it against the API port directly (local or the demo server's 127.0.0.1:5202), never against a live
 * store's public URL. Each simulated shopper sends its own X-Forwarded-For so per-shopper rate limits act
 * like they do for real shoppers; that header is only trusted from this machine (see app.ts trustProxy).
 */
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const URL_ = args.get('url') ?? 'http://127.0.0.1:5102';
const KEY = args.get('key') ?? 'dev-widget-key';
const VARIANT = args.get('variant') ?? '2021';
const SECONDS = Number(args.get('seconds') ?? 20);
const USERS = Number(args.get('users') ?? 50);

type Stat = { ms: number[]; errors: Map<string, number> };
const stats = new Map<string, Stat>();
const stat = (name: string) => stats.get(name) ?? (stats.set(name, { ms: [], errors: new Map() }), stats.get(name)!);

async function timed(name: string, ip: string, path: string, init: RequestInit = {}): Promise<string | null> {
  const s = stat(name);
  const t = performance.now();
  try {
    const res = await fetch(`${URL_}${path}`, { ...init, headers: { 'x-forwarded-for': ip, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) } });
    const text = await res.text().catch(() => '');
    if (res.ok) s.ms.push(performance.now() - t);
    else s.errors.set(String(res.status), (s.errors.get(String(res.status)) ?? 0) + 1);
    return res.ok ? text : null;
  } catch (e) {
    s.errors.set((e as Error).message.slice(0, 40), (s.errors.get((e as Error).message.slice(0, 40)) ?? 0) + 1);
    return null;
  }
}

/** One shopper: opens the store, changes the cart a few times, starts a checkout and reads it. */
async function shopper(n: number, until: number): Promise<void> {
  const ip = `10.${(n >> 8) & 255}.${n & 255}.${1 + (n % 250)}`;
  while (Date.now() < until) {
    await timed('GET  /storefront/config', ip, `/storefront/config?key=${KEY}`);
    for (let q = 1; q <= 3; q++) {
      await timed('POST /storefront/price', ip, `/storefront/price?key=${KEY}`, { method: 'POST', body: JSON.stringify({ lines: [{ lineId: 'l1', variantId: VARIANT, quantity: q }], codes: [] }) });
    }
    const start = await timed('POST /storefront/checkout', ip, `/storefront/checkout?key=${KEY}`, { method: 'POST', body: JSON.stringify({ lines: [{ variantId: VARIANT, quantity: 1 }] }) });
    const token = start ? (JSON.parse(start) as { token?: string }).token : undefined;
    if (token) await timed('GET  /checkout/api/session', ip, '/checkout/api/session', { headers: { authorization: `Bearer ${token}` } });
  }
}

const pct = (xs: number[], p: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!.toFixed(0) : '-');
const until = Date.now() + SECONDS * 1000;
console.log(`${USERS} shoppers for ${SECONDS}s against ${URL_}`);
await Promise.all(Array.from({ length: USERS }, (_, i) => shopper(i, until)));
console.log('\nrequest                       ok/s   p50   p95   p99 (ms)  errors');
for (const [name, s] of stats) {
  const errs = [...s.errors].map(([k, v]) => `${k}×${v}`).join(' ');
  console.log(`${name.padEnd(28)} ${(s.ms.length / SECONDS).toFixed(1).padStart(6)} ${pct(s.ms, 50).padStart(5)} ${pct(s.ms, 95).padStart(5)} ${pct(s.ms, 99).padStart(5)}      ${errs || '0'}`);
}

export {};
