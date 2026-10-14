/** Stroke icons on a 24 grid, currentColor. Static strings only (see dom.ts svg()). */
const wrap = (paths: string, size = 20, stroke = 1.75) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

const P = {
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".75" fill="currentColor"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
} as const;

export type IconName = keyof typeof P;
export const icon = (name: IconName, size = 20, stroke = 1.75): string => wrap(P[name], size, stroke);

/** Payment / trust marks for the badge row (brand colours, 34x22). */
const t = (body: string) => `<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true">${body}</svg>`;
const txt = (s: string, size: number, fill: string, extra = '') =>
  `<text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="700" fill="${fill}" ${extra}>${s}</text>`;
export const BADGES: Record<string, string> = {
  upi: t('<path d="M27.5 5.5 32 13l-4.5 7.5-1.9-1.1L29.6 13l-4-6.4z" fill="#0A8A3F"/><path d="M31 5.5 35.5 13 31 20.5l-1.9-1.1L33.1 13l-4-6.4z" fill="#ED752E"/>' + txt('UPI', 9.5, '#3B3B3B', 'x="14"')),
  gpay: t(`<text x="20" y="17" text-anchor="middle" font-family="Arial" font-size="10" font-weight="600"><tspan fill="#4285F4">G</tspan><tspan fill="#5F6368">Pay</tspan></text>`),
  phonepe: t('<circle cx="20" cy="13" r="9" fill="#5F259F"/>' + txt('Pe', 9, '#fff')),
  paytm: t(`<text x="20" y="17" text-anchor="middle" font-family="Arial" font-size="9.5" font-weight="700"><tspan fill="#00BAF2">Pay</tspan><tspan fill="#012970">tm</tspan></text>`),
  bhim: t(txt('BHIM', 9, '#F47920')),
  amazonpay: t(txt('amazon', 7.5, '#232F3E') + '<path d="M13 20q7 3 14 0" stroke="#FF9900" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  visa: t(txt('VISA', 11, '#1434CB', 'font-style="italic"')),
  mastercard: t('<circle cx="16" cy="13" r="7.5" fill="#EB001B"/><circle cx="24" cy="13" r="7.5" fill="#F79E1B"/><path d="M20 7.2a7.49 7.49 0 0 0 0 11.6 7.49 7.49 0 0 0 0-11.6z" fill="#FF5F00"/>'),
  rupay: t(`<text x="20" y="17" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700" font-style="italic"><tspan fill="#097DC6">Ru</tspan><tspan fill="#0A8A3F">Pay</tspan></text>`),
  amex: t('<rect x="2" y="4" width="36" height="18" rx="2.5" fill="#006FCF"/>' + txt('AMEX', 8, '#fff')),
  netbanking: t(txt('NetBank', 7.5, '#52525B')),
  cod: t(txt('COD', 9.5, '#52525B')),
  secure: t(txt('SECURE', 7, '#0F9D58')),
  easy_returns: t(txt('RETURNS', 6.5, '#52525B')),
  fast_delivery: t(txt('FAST', 8, '#52525B')),
  authentic: t(txt('100%', 8, '#52525B')),
};
