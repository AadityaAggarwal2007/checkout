/**
 * Local "Shopify store" (no real Shopify needed). Serves:
 *  - home + product pages that look like a simple Dawn theme (header cart icon with .cart-count-bubble,
 *    add-to-cart form posting to /cart/add, "Buy it now"),
 *  - the Shopify AJAX cart API: /cart.js, /cart/add.js, /cart/change.js, /cart/update.js, /cart/clear.js,
 *    /products/<handle>.js,
 *  - our storefront script tag pointing at the local API server.
 * Prices come from catalog.json, the same file the API server reads when CATALOG=dev.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

interface Variant { variantId: string; productId: string; productTitle: string; title: string; image?: string; price: number; compareAtPrice?: number; available: boolean }
interface Product { productId: string; title: string; handle: string; image?: string; collectionIds: string[]; variants: Variant[] }
interface Item { key: string; variantId: string; quantity: number; properties: Record<string, string> }
interface Cart { token: string; note: string; items: Item[] }

const PORT = Number(process.env.PORT ?? 5004);
const API = process.env.API_URL ?? 'http://localhost:5002';
const KEY = process.env.WIDGET_KEY ?? 'dev-widget-key';
const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8')) as { products: Product[] };
const products = catalog.products;
const variantById = new Map(products.flatMap((p) => p.variants.map((v) => [v.variantId, { v, p }] as const)));
const carts = new Map<string, Cart>();
const GIFT_COLLECTION = '9004';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rupees = (p: number) => `Rs. ${(p / 100).toFixed(2)}`;

function cartFor(req: IncomingMessage, res: ServerResponse): Cart {
  const token = /(?:^|;\s*)cart=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (token && carts.has(token)) return carts.get(token)!;
  const cart: Cart = { token: randomUUID(), note: '', items: [] };
  carts.set(cart.token, cart);
  res.setHeader('set-cookie', `cart=${cart.token}; Path=/; SameSite=Lax`);
  return cart;
}

function cartJson(cart: Cart) {
  const items = cart.items.map((i) => {
    const { v, p } = variantById.get(i.variantId)!;
    const defaultOnly = p.variants.length === 1;
    return {
      key: i.key,
      id: Number(v.variantId),
      product_id: Number(p.productId),
      title: defaultOnly ? p.title : `${p.title} - ${v.title}`,
      product_title: p.title,
      variant_title: defaultOnly ? null : v.title,
      quantity: i.quantity,
      price: v.price,
      original_price: v.price,
      final_price: v.price,
      final_line_price: v.price * i.quantity,
      line_price: v.price * i.quantity,
      image: v.image ? `http://localhost:${PORT}${v.image}` : null,
      url: `/products/${p.handle}?variant=${v.variantId}`,
      handle: p.handle,
      product_has_only_default_variant: defaultOnly,
      properties: Object.keys(i.properties).length ? i.properties : null,
    };
  });
  return {
    token: cart.token,
    note: cart.note || null,
    attributes: {},
    currency: 'INR',
    item_count: items.reduce((n, i) => n + i.quantity, 0),
    total_price: items.reduce((n, i) => n + i.final_line_price, 0),
    items,
  };
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/json')) return raw ? JSON.parse(raw) : {};
  if (type.includes('multipart/form-data')) {
    const boundary = /boundary=(.+)$/.exec(type)?.[1] ?? '';
    const out: Record<string, string> = {};
    for (const part of raw.split(`--${boundary}`)) {
      const name = /name="([^"]+)"/.exec(part)?.[1];
      if (name) out[name] = part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
    }
    return out;
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function send(res: ServerResponse, status: number, data: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function addItem(cart: Cart, variantId: string, quantity: number, properties: Record<string, string> = {}) {
  const hit = variantById.get(String(variantId));
  if (!hit) throw Object.assign(new Error('Cannot find variant'), { status: 404 });
  const same = cart.items.find((i) => i.variantId === String(variantId) && JSON.stringify(i.properties) === JSON.stringify(properties));
  if (same) same.quantity += quantity;
  else cart.items.push({ key: `${variantId}:${randomUUID().slice(0, 8)}`, variantId: String(variantId), quantity, properties });
}

function page(title: string, content: string, cart: Cart): string {
  const count = cart.items.reduce((n, i) => n + i.quantity, 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – Kurtiya (local)</title>
<style>
body{margin:0;font-family:Georgia,serif;color:#222;background:#faf7f2}a{color:inherit}
.bar{background:#f3e9dc;text-align:center;padding:8px;font-size:14px;letter-spacing:.04em}
header{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;background:#fff;border-bottom:1px solid #eee}
.logo{font-size:30px;font-weight:700;letter-spacing:.06em;text-decoration:none}
.icons{display:flex;gap:18px;align-items:center}.cart-link{position:relative;text-decoration:none;font-size:22px}
.cart-count-bubble{position:absolute;top:-8px;right:-12px;background:#b22;color:#fff;border-radius:10px;font:12px Arial;min-width:18px;height:18px;display:grid;place-items:center;padding:0 4px}
main{max-width:1100px;margin:0 auto;padding:32px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:22px}
.card{background:#fff;border-radius:12px;overflow:hidden;text-decoration:none;box-shadow:0 1px 3px rgba(0,0,0,.08)}.card img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.card div{padding:12px}.price{font-family:Arial;font-weight:700}.was{text-decoration:line-through;color:#888;font-weight:400;margin-left:6px}
.pdp{display:grid;grid-template-columns:1fr 1fr;gap:40px}.pdp img{width:100%;border-radius:12px}
form label{display:block;margin:16px 0 6px;font-family:Arial}select,input{font-size:16px;padding:10px;border:1px solid #ccc;border-radius:8px}
.btn{display:block;width:100%;margin-top:14px;padding:14px;font-size:16px;border-radius:8px;cursor:pointer;font-family:Arial}
.add{background:#fff;border:1px solid #222}.buy{background:#111;color:#fff;border:0}
.offer{border:2px solid #e2c27a;border-radius:12px;padding:14px 18px;margin:16px 0;background:#fffaf0;font-family:Arial}
@media(max-width:760px){.pdp{grid-template-columns:1fr}header{padding:14px 16px}main{padding:16px}}
</style></head><body>
<div class="bar">GET 1 FREE ON PREMIUM JHUMKAS · HANDCRAFTED WITH LOVE · FAST DELIVERY</div>
<header><a class="logo" href="/">KURTIYA</a><div class="icons"><a href="/search">🔍</a>
<a class="cart-link" href="/cart" aria-label="Cart">👜<span class="cart-count-bubble"${count ? '' : ' hidden'}>${count}</span></a></div></header>
<main>${content}</main>
<script>window.Shopify={routes:{root:'/'}};</script>
<script src="${API}/storefront/loader.js" data-key="${KEY}" defer></script>
</body></html>`;
}

function productCard(p: Product): string {
  const v = p.variants[0]!;
  return `<a class="card" href="/products/${p.handle}"><img src="${p.image}" alt=""><div>${esc(p.title)}<br><span class="price">${rupees(v.price)}${v.compareAtPrice ? `<span class="was">${rupees(v.compareAtPrice)}</span>` : ''}</span></div></a>`;
}

function productPage(p: Product): string {
  const v = p.variants[0]!;
  const opts = p.variants.map((x) => `<option value="${x.variantId}">${esc(x.title)} – ${rupees(x.price)}</option>`).join('');
  return `<div class="pdp"><img src="${p.image}" alt="${esc(p.title)}"><div>
<h1>${esc(p.title)}</h1><p class="price">${rupees(v.price)}${v.compareAtPrice ? `<span class="was">${rupees(v.compareAtPrice)}</span>` : ''}</p>
${p.collectionIds.includes('9001') ? '<div class="offer"><b>BUY 1 GET 1 FREE</b><br>Limited Time Jewellery Offer</div>' : ''}
<form method="post" action="/cart/add" id="product-form">
${p.variants.length > 1 ? `<label for="v">Variant</label><select id="v" name="id">${opts}</select>` : `<input type="hidden" name="id" value="${v.variantId}">`}
<label for="q">Quantity</label><input id="q" name="quantity" type="number" min="1" value="1">
<button class="btn add" type="submit" name="add">Add to cart</button>
<button class="btn buy" type="submit" name="checkout">⚡ Buy it now</button>
</form></div></div>`;
}

function svgImage(id: string): string {
  const p = products.find((x) => x.productId === id);
  const hue = (Number(id) * 47) % 360;
  const words = (p?.title ?? 'Item').split(' ');
  const lines = [words.slice(0, 3).join(' '), words.slice(3, 6).join(' '), words.slice(6).join(' ')].filter(Boolean);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="hsl(${hue} 45% 88%)"/><circle cx="300" cy="250" r="120" fill="hsl(${hue} 55% 62%)"/>${lines.map((l, i) => `<text x="300" y="${440 + i * 44}" font-family="Georgia" font-size="34" text-anchor="middle" fill="hsl(${hue} 50% 25%)">${esc(l)}</text>`).join('')}</svg>`;
}

/** Orders our checkout "creates in Shopify" (ORDER_SINK=dev). Memory only. */
const adminOrders: Array<{ id: string; name: string; at: string; order: Record<string, unknown> }> = [];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;
    const cart = cartFor(req, res);
    const img = /^\/img\/(\d+)\.svg$/.exec(path);
    if (img) return send(res, 200, svgImage(img[1]!), 'image/svg+xml');
    if (path === '/') {
      const list = products.filter((p) => !p.collectionIds.includes(GIFT_COLLECTION));
      return send(res, 200, page('Home', `<h2>Kurti Styles</h2><div class="grid">${list.map(productCard).join('')}</div>`, cart), 'text/html');
    }
    const pj = /^\/products\/([\w-]+)\.js$/.exec(path);
    if (pj) {
      const p = products.find((x) => x.handle === pj[1]);
      if (!p) return send(res, 404, { status: 404, description: 'Not found' });
      return send(res, 200, { id: Number(p.productId), handle: p.handle, title: p.title, variants: p.variants.map((v) => ({ id: Number(v.variantId), title: v.title, available: v.available, price: v.price, compare_at_price: v.compareAtPrice ?? null })) });
    }
    const pp = /^\/products\/([\w-]+)$/.exec(path);
    if (pp) {
      const p = products.find((x) => x.handle === pp[1]);
      if (!p) return send(res, 404, page('Not found', '<h1>Not found</h1>', cart), 'text/html');
      return send(res, 200, page(p.title, productPage(p), cart), 'text/html');
    }
    if (path === '/cart.js') return send(res, 200, cartJson(cart));
    if (/^\/cart\/add(\.js)?$/.test(path) && req.method === 'POST') {
      const b = await body(req);
      const items = Array.isArray(b.items) ? (b.items as Array<{ id: string; quantity?: number; properties?: Record<string, string> }>) : [{ id: String(b.id), quantity: Number(b.quantity ?? 1) }];
      for (const it of items) addItem(cart, String(it.id), Math.max(1, Number(it.quantity ?? 1)), it.properties ?? {});
      if (path === '/cart/add') { res.writeHead(302, { location: '/cart' }); return res.end(); }
      return send(res, 200, { items: cartJson(cart).items.slice(-items.length) });
    }
    if (/^\/cart\/change(\.js)?$/.test(path) && req.method === 'POST') {
      const b = await body(req);
      const q = Math.max(0, Number(b.quantity ?? 0));
      const item = typeof b.line === 'number' ? cart.items[b.line - 1] : cart.items.find((i) => i.key === String(b.id) || i.variantId === String(b.id));
      if (!item) return send(res, 400, { status: 400, description: 'No such line' });
      if (q === 0) cart.items = cart.items.filter((i) => i !== item);
      else item.quantity = q;
      return send(res, 200, cartJson(cart));
    }
    if (/^\/cart\/update(\.js)?$/.test(path) && req.method === 'POST') {
      const b = await body(req);
      if (typeof b.note === 'string') cart.note = b.note.slice(0, 5000);
      return send(res, 200, cartJson(cart));
    }
    if (/^\/cart\/clear(\.js)?$/.test(path) && req.method === 'POST') {
      cart.items = [];
      return send(res, 200, cartJson(cart));
    }
    if (path === '/dev-admin/orders' && req.method === 'POST') {
      const b = await body(req);
      const n = adminOrders.length + 1;
      const created = { id: String(700000 + n), name: `#${1000 + n}`, at: new Date().toISOString(), order: (b.order ?? {}) as Record<string, unknown> };
      adminOrders.push(created);
      return send(res, 200, { id: created.id, name: created.name });
    }
    if (path === '/dev-admin/orders') {
      if (url.searchParams.get('format') === 'json') return send(res, 200, { orders: adminOrders });
      const rows = adminOrders
        .map((o) => {
          const attrs = (o.order.customAttributes as Array<{ key: string; value: string }> | undefined) ?? [];
          return `<li><b>${esc(o.name)}</b> — ${esc(attrs.map((a) => `${a.key}: ${a.value}`).join(' · '))} — ${esc(String(o.order.financialStatus ?? ''))}</li>`;
        })
        .join('');
      return send(res, 200, page('Orders (admin)', `<h1>Orders received from the checkout</h1><ul>${rows || '<li>None yet</li>'}</ul>`, cart), 'text/html');
    }
    if (path === '/cart' && req.method === 'POST') {
      res.writeHead(302, { location: '/checkout' });
      return res.end();
    }
    if (path === '/cart' || path === '/checkout') {
      const c = cartJson(cart);
      const rows = c.items.map((i) => `<li>${esc(i.title)} × ${i.quantity} — ${rupees(i.final_line_price)}</li>`).join('');
      const title = path === '/cart' ? 'Cart' : 'Shopify checkout (local stand-in)';
      const button = path === '/cart' && c.items.length ? '<form action="/cart" method="post"><button class="btn buy" type="submit" name="checkout">Check out</button></form>' : '';
      return send(res, 200, page(title, `<h1>${title}</h1><ul>${rows || '<li>Empty</li>'}</ul><p class="price">Total ${rupees(c.total_price)}</p>${button}`, cart), 'text/html');
    }
    const disc = /^\/discount\/([^/]+)$/.exec(path);
    if (disc) { res.writeHead(302, { location: url.searchParams.get('redirect') ?? '/' }); return res.end(); }
    return send(res, 404, page('Not found', '<h1>Not found</h1>', cart), 'text/html');
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return send(res, status, { status, description: (err as Error).message });
  }
}).listen(PORT, () => console.log(`Local store on http://localhost:${PORT} (storefront script from ${API})`));
