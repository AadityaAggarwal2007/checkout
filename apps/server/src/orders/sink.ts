import type { Order, OrderLine, PrismaClient } from '@prisma/client';
import type { Env } from '../env.js';
import type { Keyring } from '../lib/crypto.js';
import type { FetchLike } from '../payments/types.js';

/** Puts our order into the store's Shopify admin (so fulfilment, inventory and reports keep working). */
export interface OrderSink {
  create(order: Order & { lines: OrderLine[] }, shopDomain: string, storeId: string): Promise<{ id: string; name: string }>;
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

/** Shopify's GraphQL orderCreate input for one of our orders (pure: unit tested). */
export function shopifyOrderInput(order: Order & { lines: OrderLine[] }) {
  const a = order.shippingAddress as unknown as AddressSnapshot;
  const [firstName, ...rest] = a.name.trim().split(/\s+/);
  const address = {
    firstName,
    lastName: rest.join(' ') || undefined,
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
  }));
  if (order.codFee > 0) lineItems.push({ title: 'COD charges', quantity: 1, priceSet: money(order.codFee), requiresShipping: false, taxable: false });

  const mode = order.paymentMode === 'PREPAID' ? 'Prepaid' : order.paymentMode === 'COD' ? 'COD' : 'Partial COD';
  const transactions: Array<Record<string, unknown>> = [];
  if (order.paidAmount > 0) transactions.push({ kind: 'SALE', status: 'SUCCESS', gateway: order.paymentMethod ?? 'online', amountSet: money(order.paidAmount) });
  if (order.dueOnDelivery > 0) transactions.push({ kind: 'SALE', status: 'PENDING', gateway: 'Cash on Delivery (COD)', amountSet: money(order.dueOnDelivery) });

  // Gift lines go at price 0 (order.discount never includes them); the rest is one fixed amount on the order.
  const discount = order.discount;
  return {
    order: {
      currency: 'INR',
      lineItems,
      shippingAddress: address,
      billingAddress: address,
      phone: order.contactPhone,
      email: order.contactEmail ?? undefined,
      financialStatus: order.dueOnDelivery === 0 ? 'PAID' : order.paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING',
      transactions,
      shippingLines: [{ title: order.shipping > 0 ? 'Shipping' : 'Free shipping', priceSet: money(order.shipping) }],
      discountCode: discount > 0 ? { itemFixedDiscountCode: { code: order.couponCodes.join('+').slice(0, 250) || 'Discount', amountSet: money(discount) } } : undefined,
      tags: ['checkout', mode],
      note: order.note ?? undefined,
      customAttributes: [
        { key: 'Checkout order', value: order.number },
        { key: 'Payment', value: mode },
        ...(order.dueOnDelivery > 0 ? [{ key: 'Collect on delivery', value: `₹${(order.dueOnDelivery / 100).toFixed(2)}` }] : []),
      ],
    },
    options: { inventoryBehaviour: 'DECREMENT_OBEYING_POLICY', sendReceipt: true },
  };
}

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

  async create(order: Order & { lines: OrderLine[] }, shopDomain: string, storeId: string) {
    const conn = await this.prisma.shopifyConnection.findUnique({ where: { storeId } });
    if (!conn?.accessTokenEnc) throw new Error('Store is not connected to Shopify.');
    const res = await this.fetchImpl(`https://${shopDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-access-token': this.keyring.decrypt(conn.accessTokenEnc) },
      body: JSON.stringify({ query: ORDER_CREATE, variables: shopifyOrderInput(order) }),
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
      throw new Error(`Shopify orderCreate: ${why}`);
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

  async create(order: Order & { lines: OrderLine[] }) {
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

export function orderSinkFrom(env: Env, prisma: PrismaClient, keyring: Keyring): OrderSink {
  return env.ORDER_SINK === 'dev' ? new DevOrderSink(env.DEV_STORE_URL) : new ShopifyOrderSink(prisma, keyring, env.SHOPIFY_API_VERSION);
}
