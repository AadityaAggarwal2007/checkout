import type { Order, OrderLine, PrismaClient } from '@prisma/client';
import type { ConnectedStores } from '../catalog/per-store.js';
import type { Env } from '../env.js';
import type { Keyring } from '../lib/crypto.js';
import type { FetchLike } from '../payments/types.js';

/** Puts our order into the store's Shopify admin (so fulfilment, inventory and reports keep working). */
export interface OrderSink {
  create(order: Order & { lines: OrderLine[]; transactions?: SinkOrder['transactions'] }, shopDomain: string, storeId: string): Promise<{ id: string; name: string }>;
}

interface AddressSnapshot {
  name: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  phone?: string;
}

const money = (paise: number) => ({ shopMoney: { amount: (paise / 100).toFixed(2), currencyCode: 'INR' } });

/** Unique per store: lets a retry find an order Shopify made while our first request timed out. */
export const orderTag = (order: Pick<Order, 'number'>) => `ck-${order.number}`;

type SinkOrder = Order & { lines: OrderLine[]; transactions?: Array<{ status: string; gatewayRef: string | null; provider: string; method: string | null }> };

interface PricingSnapshot {
  applied?: Array<{ code?: string; title?: string; amount: number; automatic: boolean }>;
  shipping?: { name?: string } | null;
}
interface Attribution {
  landing?: string;
  utm?: Record<string, string>;
  fbclid?: string;
}

/**
 * Shopify's GraphQL orderCreate input for one of our orders (pure: unit tested). Shaped like the orders other
 * checkouts put into Shopify: customer, delivery method "Standard (COD)", tags, one line per discount, the
 * gateway's payment id, where the shopper came from. `rich: false` leaves out every field the first version
 * did not send (customer, line properties, tax flag, shipping code, payment id field) for a second try if Shopify refuses them, so an order is never lost over extras.
 */
export function shopifyOrderInput(order: SinkOrder, opts: { rich?: boolean } = {}) {
  const rich = opts.rich ?? true;
  const a = order.shippingAddress as unknown as AddressSnapshot;
  const [firstName, ...rest] = a.name.trim().split(/\s+/);
  const lastName = rest.join(' ') || undefined;
  const address = {
    firstName,
    lastName,
    address1: a.line1,
    address2: [a.line2, a.landmark].filter(Boolean).join(', ') || undefined,
    city: a.city,
    province: a.state,
    zip: a.pincode,
    countryCode: 'IN',
    phone: order.contactPhone,
  };
  const lineItems: Array<Record<string, unknown>> = order.lines.map((l) => ({
    variantId: `gid://shopify/ProductVariant/${l.variantId}`,
    quantity: l.quantity,
    priceSet: money(l.isGift ? 0 : l.unitPrice),
    requiresShipping: true,
    ...(rich && l.isGift ? { properties: [{ name: 'freebie', value: 'true' }] } : {}),
  }));
  if (order.codFee > 0) lineItems.push({ title: 'COD charges', quantity: 1, priceSet: money(order.codFee), requiresShipping: false, taxable: false });

  const mode = order.paymentMode === 'PREPAID' ? 'Prepaid' : order.paymentMode === 'COD' ? 'COD' : 'Partial COD';
  const transactions: Array<Record<string, unknown>> = [];
  const paid = order.transactions?.find((t) => t.status === 'SUCCESS');
  const gatewayName = paid ? (paid.provider === 'PAYU' ? 'PayU' : paid.provider === 'PAYGLOCAL' ? 'PayGlocal' : paid.provider === 'PINELABS' ? 'Pine Labs' : paid.provider) : (order.paymentMethod ?? 'online');
  if (order.paidAmount > 0) transactions.push({ kind: 'SALE', status: 'SUCCESS', gateway: gatewayName, amountSet: money(order.paidAmount), ...(rich && paid?.gatewayRef ? { authorizationCode: paid.gatewayRef } : {}) });
  if (order.dueOnDelivery > 0) transactions.push({ kind: 'SALE', status: 'PENDING', gateway: 'Cash on Delivery (COD)', amountSet: money(order.dueOnDelivery) });

  const pricing = (order.pricing ?? {}) as PricingSnapshot;
  const applied = (pricing.applied ?? []).filter((d) => d.amount > 0);
  const rateName = pricing.shipping?.name?.trim() || 'Standard';
  const delivery = `${rateName} (${mode})`;
  const attribution = (order.attribution ?? {}) as Attribution;
  const utm = attribution.utm ?? {};

  // Gift lines go at price 0 (order.discount never includes them); the rest is one fixed amount on the order,
  // named after the codes, with each discount also listed in the order's additional details.
  const discount = order.discount;
  const discountName = applied.map((d) => d.code ?? d.title ?? 'Offer').join(' + ') || order.couponCodes.join('+') || 'Discount';
  const tags = [...new Set(['checkout', orderTag(order), mode, rateName, ...applied.map((d) => d.code ?? d.title ?? '').filter(Boolean), ...(utm.utm_source ? [utm.utm_source] : [])])]
    .map((t) => t.replace(/,/g, ' ').slice(0, 40))
    .slice(0, 20);
  const attrs = [
    { key: 'Checkout order', value: order.number },
    { key: 'Payment', value: mode },
    ...(order.dueOnDelivery > 0 ? [{ key: 'Collect on delivery', value: `₹${(order.dueOnDelivery / 100).toFixed(2)}` }] : []),
    ...(paid?.gatewayRef ? [{ key: `${gatewayName}_txn_id`, value: paid.gatewayRef }] : []),
    ...applied.map((d) => ({ key: `discount | ${d.code ?? d.title ?? 'Offer'} | ${d.automatic ? 'automatic' : 'code'}`, value: (d.amount / 100).toFixed(2) })),
    ...(attribution.landing ? [{ key: 'landing_page_url', value: attribution.landing.slice(0, 250) }] : []),
    ...Object.entries(utm).slice(0, 6).map(([k, v]) => ({ key: k, value: String(v).slice(0, 100) })),
    ...(attribution.fbclid ? [{ key: 'fbclid', value: attribution.fbclid.slice(0, 100) }] : []),
  ];
  return {
    order: {
      currency: 'INR',
      lineItems,
      shippingAddress: address,
      billingAddress: address,
      phone: order.contactPhone,
      email: order.contactEmail ?? undefined,
      // Indian prices include GST, as in the store's own checkout.
      ...(rich ? { taxesIncluded: true } : {}),
      financialStatus: order.dueOnDelivery === 0 ? 'PAID' : order.paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING',
      transactions,
      shippingLines: [{ title: delivery, ...(rich ? { code: rateName, source: 'checkout' } : {}), priceSet: money(order.shipping) }],
      discountCode: discount > 0 ? { itemFixedDiscountCode: { code: discountName.slice(0, 250), amountSet: money(discount) } } : undefined,
      tags,
      note: order.note ?? undefined,
      customAttributes: attrs,
      ...(rich
        ? { customer: { toUpsert: { phone: order.contactPhone, ...(order.contactEmail ? { email: order.contactEmail } : {}), firstName, ...(lastName ? { lastName } : {}) } } }
        : {}),
    },
    options: { inventoryBehaviour: 'DECREMENT_OBEYING_POLICY', sendReceipt: !!order.contactEmail },
  };
}

/** Shopify answered but did not create the order (bad input), as opposed to a network / HTTP failure. */
class RefusedInput extends Error {}

const FIND_ORDER = `query findOrder($q: String!) { orders(first: 1, query: $q) { nodes { id name } } }`;

const ORDER_CREATE = `mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) { order { id name } userErrors { field message } }
}`;

export class ShopifyOrderSink implements OrderSink {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly keyring: Keyring,
    private readonly apiVersion: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async create(order: SinkOrder, shopDomain: string, storeId: string) {
    const conn = await this.prisma.shopifyConnection.findUnique({ where: { storeId } });
    if (!conn?.accessTokenEnc) throw new Error('Store is not connected to Shopify.');
    const token = this.keyring.decrypt(conn.accessTokenEnc);
    // A retry after a failure we could not read (timeout, cut connection) may find Shopify already made it:
    // look it up by its order-number tag first, so the shopper never gets two Shopify orders.
    if (order.shopifyError !== null) {
      const found = await this.findByTag(shopDomain, token, orderTag(order));
      if (found) return found;
    }
    try {
      return await this.send(shopDomain, token, shopifyOrderInput(order));
    } catch (err) {
      // Shopify refused the extras (customer, line properties)? The order itself must still get in.
      if (err instanceof RefusedInput) return this.send(shopDomain, token, shopifyOrderInput(order, { rich: false }));
      throw err;
    }
  }

  private async findByTag(shopDomain: string, token: string, tag: string): Promise<{ id: string; name: string } | null> {
    const res = await this.fetchImpl(`https://${shopDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
      body: JSON.stringify({ query: FIND_ORDER, variables: { q: `tag:'${tag}'` } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Shopify order lookup HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { orders?: { nodes?: Array<{ id: string; name: string }> } } };
    const hit = body.data?.orders?.nodes?.[0];
    return hit ? { id: hit.id.slice(hit.id.lastIndexOf('/') + 1), name: hit.name } : null;
  }

  private async send(shopDomain: string, token: string, variables: ReturnType<typeof shopifyOrderInput>) {
    const res = await this.fetchImpl(`https://${shopDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
      body: JSON.stringify({ query: ORDER_CREATE, variables }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Shopify orderCreate HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: { orderCreate?: { order?: { id: string; name: string } | null; userErrors: Array<{ message: string }> } };
      errors?: unknown;
    };
    const created = body.data?.orderCreate?.order;
    if (!created) {
      const why = body.data?.orderCreate?.userErrors.map((e) => e.message).join('; ') || JSON.stringify(body.errors ?? {}).slice(0, 300);
      throw new RefusedInput(`Shopify orderCreate: ${why}`);
    }
    return { id: created.id.slice(created.id.lastIndexOf('/') + 1), name: created.name };
  }
}

/** Local test store (apps/devstore) keeps the orders it receives in memory. */
export class DevOrderSink implements OrderSink {
  constructor(
    private readonly devStoreUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async create(order: SinkOrder) {
    const res = await this.fetchImpl(`${this.devStoreUrl}/dev-admin/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(shopifyOrderInput(order)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`dev store answered ${res.status}`);
    return (await res.json()) as { id: string; name: string };
  }
}

export function orderSinkFrom(env: Env, prisma: PrismaClient, keyring: Keyring, stores?: ConnectedStores): OrderSink {
  const shopify = new ShopifyOrderSink(prisma, keyring, env.SHOPIFY_API_VERSION);
  if (env.ORDER_SINK !== 'dev') return shopify;
  const dev = new DevOrderSink(env.DEV_STORE_INTERNAL_URL ?? env.DEV_STORE_URL);
  if (!stores) return dev;
  // Demo server: a store connected to Shopify gets real Shopify orders, the demo store the local one.
  return { create: async (order, shopDomain, storeId) => ((await stores.connected(storeId)) ? shopify : dev).create(order, shopDomain, storeId) };
}
