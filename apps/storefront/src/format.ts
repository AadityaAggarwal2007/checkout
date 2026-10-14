import { formatINR } from '@checkout/core';

/** ₹1,808.87 / ₹124 (no paise when whole). */
export const money = (paise: number): string => formatINR(paise);

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);
