/**
 * Talking to the store page that holds our iframe (apps/storefront). Messages carry no
 * personal data: only "close", "order placed" (so it can empty the Shopify cart) and
 * "open this URL" (the gateway, same tab on phones).
 */
export const inFrame = window.parent !== window;

export function toStore(message: { type: 'ck:close' } | { type: 'ck:done'; order?: { number: string; total: number } } | { type: 'ck:navigate'; url: string } | { type: 'ck:ready' }): void {
  if (inFrame) window.parent.postMessage(message, '*');
}

let view: 'phone' | 'desktop' | undefined;
/** The store page tells us (#v=phone|desktop): inside the popup our own width is always small. */
export function setView(v: string | null): void {
  if (v === 'phone' || v === 'desktop') view = v;
}

/** Phones pay in the same tab; desktops open the gateway in a new tab. */
export function isPhone(): boolean {
  if (view) return view === 'phone';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (!inFrame && window.matchMedia('(max-width: 640px)').matches);
}

export function close(storeUrl: string): void {
  if (inFrame) toStore({ type: 'ck:close' });
  else window.location.href = storeUrl;
}
