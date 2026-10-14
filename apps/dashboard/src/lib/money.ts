import { formatINR } from '@checkout/core';

export const inr = (paise: number) => formatINR(paise);
/** "199" or "199.5" typed by the merchant -> paise (never floats in maths). */
export function toPaise(rupees: string): number | null {
  const t = rupees.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  return Number(w) * 100 + Number(f.padEnd(2, '0'));
}
export const toRupeesText = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));
