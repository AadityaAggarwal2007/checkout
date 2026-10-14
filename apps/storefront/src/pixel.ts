/**
 * Meta Pixel (Dashboard > Integrations): AddToCart, InitiateCheckout and Purchase from the store page.
 * Uses the theme's fbq when it is there, else loads Meta's script once. Events go only to the merchant's
 * pixel id (trackSingle). No personal data is sent: only values, item counts and the order number.
 */
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[][]; loaded?: boolean; version?: string; push?: unknown };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let pixelId: string | undefined;

export function initPixel(id: string | undefined): void {
  if (!id || !/^\d{6,20}$/.test(id) || pixelId) return;
  pixelId = id;
  if (!window.fbq) {
    // Meta's standard stub: queues calls until fbevents.js has loaded.
    const f: Fbq = function (...args: unknown[]) {
      if (f.callMethod) f.callMethod(...args);
      else f.queue!.push(args);
    } as Fbq;
    f.push = f;
    f.loaded = true;
    f.version = '2.0';
    f.queue = [];
    window.fbq = f;
    window._fbq = window._fbq ?? f;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq!('init', id);
}

export function pixel(event: 'AddToCart' | 'InitiateCheckout' | 'Purchase', data: Record<string, unknown> = {}, eventId?: string): void {
  if (!pixelId || !window.fbq) return;
  try {
    window.fbq('trackSingle', pixelId, event, { currency: 'INR', ...data }, eventId ? { eventID: eventId } : undefined);
  } catch {
    /* never break the store page */
  }
}

/** #ck_done=<order>.<total in paise> (phone return) or the checkout's ck:done message. */
export function purchase(order: { number?: unknown; total?: unknown } | undefined): void {
  const number = typeof order?.number === 'string' && /^[\w-]{1,30}$/.test(order.number) ? order.number : undefined;
  const total = typeof order?.total === 'number' && Number.isFinite(order.total) ? order.total : undefined;
  if (!number || total === undefined) return;
  pixel('Purchase', { value: total / 100, content_type: 'product' }, `order-${number}`);
}
