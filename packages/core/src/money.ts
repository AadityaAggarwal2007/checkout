/**
 * Money is always an integer number of paise. Never use floats for amounts.
 * ₹1 = 100 paise. Helpers here are the only place that converts or rounds.
 */
export type Paise = number;

export function assertPaise(value: number, what = 'amount'): Paise {
  if (!Number.isInteger(value)) throw new RangeError(`${what} must be whole paise, got ${value}`);
  return value;
}

/** "199.99" or 199.99 (rupees, as Shopify sends them) -> 19999 paise. */
export function rupeesToPaise(rupees: string | number): Paise {
  const text = typeof rupees === 'number' ? rupees.toFixed(2) : String(rupees).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new RangeError(`not a rupee amount: ${rupees}`);
  const negative = text.startsWith('-');
  const [whole, frac = ''] = text.replace('-', '').split('.');
  const value = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -value : value;
}

/** 19999 -> "199.99" (for gateways and the Shopify API). */
export function paiseToRupeesString(paise: Paise): string {
  assertPaise(paise);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** ₹1,23,456.50 style (Indian grouping). Whole rupees drop the ".00". */
export function formatINR(paise: Paise, opts: { keepZeroPaise?: boolean } = {}): string {
  assertPaise(paise);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = groupIndian(String(rupees));
  const decimals = rest === 0 && !opts.keepZeroPaise ? '' : `.${String(rest).padStart(2, '0')}`;
  return `${negative ? '−' : ''}₹${grouped}${decimals}`;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${last3}`;
}

/** percent of an amount, rounded half up to the paisa. percent may be fractional (e.g. 2.5). */
export function percentOf(amount: Paise, percent: number): Paise {
  if (percent < 0 || percent > 100) throw new RangeError(`percent out of range: ${percent}`);
  // Work in basis points of a percent to avoid float drift: 12.5% -> 1250.
  const bp = Math.round(percent * 100);
  return Math.floor((amount * bp + 5000) / 10000);
}

/**
 * Split `total` across `weights` so the parts are whole paise and add up exactly to `total`
 * (largest-remainder method). Used to spread an order discount over the lines.
 */
export function allocate(total: Paise, weights: number[]): Paise[] {
  assertPaise(total, 'total');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((x) => Math.floor(x));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

export function clamp(value: Paise, min: Paise, max: Paise): Paise {
  return Math.min(Math.max(value, min), max);
}

export function sum(values: Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0);
}
