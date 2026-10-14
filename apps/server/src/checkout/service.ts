import { type Cart, type PaymentMethod, type PricingResult } from '@checkout/core';
import {
  addressInputSchema,
  type AddressInput,
  type CheckoutAddress,
  type CheckoutState,
  type CreateCheckout,
  type PayStart,
} from '@checkout/shared';
import { Prisma, type CheckoutSession, type Customer, type PaymentTransaction, type Store } from '@prisma/client';
import type { Deps } from '../context.js';
import { pepperedHash, randomToken, safeEqual } from '../lib/crypto.js';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors.js';
import { createOrder, modeOf, pushOrderToShopify, type OrderDraft } from '../orders/create.js';
import { shopperCard } from '../rules/coupons.js';
import { buildCart, shopperOf } from './rules.js';
import { couponStateOf, loadPricingContext, priceSession, type PricingContext, type SessionAddress, type SessionPricing } from './pricing.js';
import { ourMethod } from '../payments/types.js';
import { customerForDevice } from './otp.js';
import { liveRules, offerOf, pickRule, upsellStateOf, UPSELL_PREFIX, withUpsellPrices, type UpsellState } from './upsell.js';

export const SESSION_TTL_SECONDS = 24 * 3600;

export type SessionWithStore = CheckoutSession & { store: Store };

/** Where "Continue shopping" goes. */
export function storeUrl(store: Store): string {
  const host = store.domain || store.shopDomain;
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : `https://${host}`;
}

/** Origins allowed to put the checkout in an iframe (CSP frame-ancestors). */
export function storeOrigins(store: Store): string[] {
  const out = new Set([`https://${store.shopDomain}`, storeUrl(store)]);
  if (store.domain && !store.domain.startsWith('localhost')) {
    out.add(`https://${store.domain}`);
    out.add(`https://${store.domain.startsWith('www.') ? store.domain.slice(4) : `www.${store.domain}`}`);
  }
  return [...out];
}

/**
 * Merchant test link (?ck_test=<key>): our checkout on the live store for whoever has the link, before
 * it is switched on for everyone. The key is derived from the store id, shown only in the dashboard.
 */
export function testKeyFor(pepper: string, storeId: string): string {
  return pepperedHash(pepper, `cktest:${storeId}`).slice(0, 20);
}

export function isTestKey(pepper: string, storeId: string, given: unknown): boolean {
  return typeof given === 'string' && given.length === 20 && safeEqual(given, testKeyFor(pepper, storeId));
}

const STEP_RANK = { CART: 0, LOGIN: 1, ADDRESS: 2, PAYMENT: 3, PROCESSING: 4, COMPLETED: 5 } as const;
const furthest = (a: CheckoutSession['step'], b: CheckoutSession['step']) => (STEP_RANK[b] > STEP_RANK[a] ? b : a);

export class CheckoutService {
  constructor(private readonly deps: Deps) {}

  private get prisma() {
    return this.deps.prisma;
  }

  // ---------------------------------------------------------------- session

  async create(store: Store, input: CreateCheckout): Promise<{ session: CheckoutSession; token: string; url: string }> {
    const { cart } = await buildCart(this.deps.catalog, store.id, input.lines);
    if (cart.lines.length === 0) throw badRequest('These items are not available any more.', 'empty_cart');
    const session = await this.prisma.checkoutSession.create({
      data: {
        storeId: store.id,
        cart: cart as unknown as Prisma.InputJsonValue,
        couponState: { codes: input.codes.map((c) => c.toUpperCase()), removed: [] },
        attribution: input.attribution as Prisma.InputJsonValue,
        note: input.note || null,
        source: input.source,
        step: 'LOGIN',
      },
    });
    const token = await this.deps.tokens.sign('checkout', { sid: session.id }, SESSION_TTL_SECONDS);
    const base = this.deps.env.CHECKOUT_URL ?? this.deps.env.PUBLIC_URL;
    return { session, token, url: `${base}/checkout/s/${session.id}#t=${token}` };
  }

  async sessionFromToken(token: string | undefined): Promise<SessionWithStore> {
    const claims = await this.deps.tokens.verify<{ sid: string }>('checkout', token);
    if (!claims?.sid) throw new HttpError(401, 'session_expired', 'This checkout has expired. Please start again from the cart.');
    const session = await this.prisma.checkoutSession.findUnique({ where: { id: claims.sid }, include: { store: true } });
    if (!session || session.store.status === 'UNINSTALLED') throw new HttpError(401, 'session_expired', 'This checkout has expired. Please start again from the cart.');
    return session;
  }

  /**
   * The shopper this browser proved with OTP. A device of another shopper takes the session over
   * (and drops the address); no device = no personal data.
   */
  async customerOf(session: SessionWithStore, deviceToken: string | undefined): Promise<Customer | null> {
    const customer = await customerForDevice(this.prisma, session.storeId, deviceToken);
    if (!customer) return null;
    // Never while a payment is open: the paid order must stay with the shopper who started it.
    if (session.customerId !== customer.id && !session.completedAt && session.status !== 'PAYING') {
      await this.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { customerId: customer.id, contactPhone: customer.phone, address: Prisma.DbNull, step: furthest(session.step, 'ADDRESS') },
      });
      session.customerId = customer.id;
      session.contactPhone = customer.phone;
      session.address = null;
      // Remembered shopper: their default address is chosen for them (one click to pay).
      const saved = await this.prisma.customerAddress.findFirst({ where: { customerId: customer.id, deletedAt: null, isDefault: true } });
      if (saved) await this.chooseAddress(session, customer, { addressId: saved.id });
    }
    return customer;
  }

  async context(session: SessionWithStore, customer: Customer | null): Promise<PricingContext> {
    return loadPricingContext(this.prisma, session.storeId, customer, this.deps.gateways.devAllowed());
  }

  private addressOf(session: CheckoutSession, customer: Customer | null): SessionAddress | null {
    // An address belongs to the shopper who chose it: never shown to anyone else.
    if (!customer || session.customerId !== customer.id) return null;
    return (session.address as unknown as SessionAddress | null) ?? null;
  }

  async pricing(session: SessionWithStore, ctx: PricingContext, customer: Customer | null, cart?: Cart): Promise<SessionPricing> {
    return priceSession(this.prisma, ctx, session.storeId, cart ?? (session.cart as unknown as Cart), couponStateOf(session), this.addressOf(session, customer));
  }

  // ---------------------------------------------------------------- state

  async state(session: SessionWithStore, customer: Customer | null): Promise<CheckoutState> {
    const ctx = await this.context(session, customer);
    const priced = await this.pricing(session, ctx, customer);
    const cart = session.cart as unknown as Cart;
    const p = priced.plain;
    const address = this.addressOf(session, customer);

    const order = await this.prisma.order.findUnique({ where: { sessionId: session.id } });
    const lastTxn = await this.prisma.paymentTransaction.findFirst({ where: { sessionId: session.id }, orderBy: { createdAt: 'desc' } });
    const addresses = customer
      ? await this.prisma.customerAddress.findMany({ where: { customerId: customer.id, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }], take: 10 })
      : [];
    const visible = await this.prisma.coupon.findMany({
      where: { storeId: session.storeId, active: true, visible: true, deletedAt: null, code: { not: null }, kind: { not: 'PAYMENT_OFFER' } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 20,
    });

    let step: CheckoutState['step'];
    if (order) step = 'done';
    else if (session.status === 'PAYING' && lastTxn && (lastTxn.status === 'PENDING' || lastTxn.status === 'CREATED')) step = 'processing';
    else if (!customer) step = 'login';
    else if (!address) step = 'address';
    else step = 'payment';

    const giftInfo = p.gifts.length ? await this.deps.catalog.variants(session.storeId, p.gifts.map((g) => g.variantId)) : new Map();
    const upsellState = upsellStateOf(session.upsell);
    const upsell = step === 'payment' ? await this.upsellOffer(session, customer, upsellState, true) : null;
    return {
      id: session.id,
      step,
      store: {
        name: session.store.name,
        url: storeUrl(session.store),
        poweredBy: ctx.rules.settings.poweredByText ?? undefined,
        logoUrl: ctx.settings.logoUrl,
        colors: ctx.settings.colors,
      },
      settings: {
        askEmail: ctx.settings.askEmail,
        payButtonText: ctx.settings.payButtonText,
        codConfirm: ctx.rules.settings.codConfirmPopup,
        methodLabels: ctx.settings.methodLabels,
        banners: ctx.settings.banners,
        trustBadges: ctx.settings.trustBadges,
        exit: ctx.settings.exit,
      },
      customer: customer ? { phone: customer.phone, name: customer.name ?? undefined, email: customer.email ?? undefined } : null,
      addresses: addresses.map((a) => ({
        id: a.id,
        name: a.name,
        line1: a.line1,
        line2: a.line2 ?? undefined,
        landmark: a.landmark ?? undefined,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        tag: a.tag,
        isDefault: a.isDefault,
      })),
      address,
      email: address?.email ?? customer?.email ?? undefined,
      lines: [
        ...cart.lines.map((l) => {
          const x = p.lines.find((y) => y.lineId === l.lineId);
          return {
            lineId: l.lineId,
            variantId: l.variantId,
            title: l.title,
            variantTitle: l.variantTitle,
            image: l.image,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            compareAtPrice: l.compareAtPrice,
            discount: x?.discount ?? 0,
            total: x?.total ?? l.unitPrice * l.quantity,
            freeUnits: x?.freeUnits ?? 0,
            ...(upsellState.lines[l.lineId] ? { upsell: true } : {}),
          };
        }),
        ...p.gifts.map((g) => ({
          lineId: `gift-${g.variantId}`,
          variantId: g.variantId,
          title: giftInfo.get(g.variantId)?.productTitle ?? g.title,
          image: giftInfo.get(g.variantId)?.image ?? g.image,
          quantity: g.quantity,
          unitPrice: g.unitPrice,
          discount: g.unitPrice * g.quantity,
          total: 0,
          freeUnits: g.quantity,
          gift: true,
        })),
      ],
      summary: {
        subtotal: p.subtotal,
        discount: p.discount,
        shipping: p.shipping?.charge ?? 0,
        shippingLabel: p.shipping?.label ?? 'Shipping',
        shippingEta: p.shipping?.eta,
        total: p.total,
        savings: p.savings.total,
        itemCount: cart.lines.reduce((n, l) => n + l.quantity, 0),
      },
      coupons: {
        applied: p.applied.map((a) => ({ code: a.code, title: a.title, amount: a.amount, automatic: a.automatic })),
        rejected: p.rejected.map((r) => ({ code: r.code, message: r.message })),
        visible: visible.map(shopperCard),
      },
      methods: priced.methods,
      upsell: upsell?.offer ?? null,
      codReasons: p.codAvailability.reasons,
      unserviceable: p.unserviceable,
      payment:
        !order && lastTxn?.status === 'FAILED' && session.status === 'OPEN'
          ? { status: 'failed', method: lastTxn.method ?? undefined, message: 'Your payment did not go through. No money was taken, or it will be refunded by your bank. Please try again.' }
          : step === 'processing'
            ? { status: 'pending', method: lastTxn?.method ?? undefined }
            : { status: 'idle' },
      order: order
        ? { number: order.number, total: order.total, paidAmount: order.paidAmount, dueOnDelivery: order.dueOnDelivery, paymentMode: order.paymentMode }
        : null,
    };
  }

  // ---------------------------------------------------------------- address and coupons

  private assertOpen(session: CheckoutSession) {
    if (session.status === 'COMPLETED' || session.completedAt) throw conflict('This order is already placed.', 'completed');
  }

  async chooseAddress(session: SessionWithStore, customer: Customer, body: { addressId?: string; address?: unknown; email?: string }): Promise<void> {
    this.assertOpen(session);
    let snapshot: SessionAddress;
    if (body.addressId) {
      const saved = await this.prisma.customerAddress.findFirst({ where: { id: body.addressId, customerId: customer.id, deletedAt: null } });
      if (!saved) throw notFound('Address not found.');
      snapshot = {
        id: saved.id,
        name: saved.name,
        line1: saved.line1,
        line2: saved.line2 ?? undefined,
        landmark: saved.landmark ?? undefined,
        city: saved.city,
        state: saved.state,
        pincode: saved.pincode,
        tag: saved.tag,
        email: body.email?.trim() || saved.email || customer.email || undefined,
      };
    } else {
      const parsed = addressInputSchema.safeParse(body.address);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Check the address.', 'invalid_address');
      const a: AddressInput = parsed.data;
      const ctx = await this.context(session, customer);
      if (ctx.settings.askEmail === 'required' && !a.email) throw badRequest('Enter your email.', 'invalid_address');
      const isFirst = (await this.prisma.customerAddress.count({ where: { customerId: customer.id, deletedAt: null } })) === 0;
      const saved = await this.prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          name: a.name,
          phone: customer.phone,
          email: a.email || null,
          line1: a.line1,
          line2: a.line2 || null,
          landmark: a.landmark || null,
          city: a.city,
          state: a.state,
          pincode: a.pincode,
          tag: a.tag,
          isDefault: isFirst,
        },
      });
      snapshot = { id: saved.id, name: a.name, line1: a.line1, line2: a.line2 || undefined, landmark: a.landmark || undefined, city: a.city, state: a.state, pincode: a.pincode, tag: a.tag, email: a.email || undefined };
    }
    await this.prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        address: snapshot as unknown as Prisma.InputJsonValue,
        contactName: snapshot.name,
        contactEmail: snapshot.email ?? null,
        step: furthest(session.step, 'PAYMENT'),
        status: 'OPEN',
      },
    });
    session.address = snapshot as unknown as Prisma.JsonValue;
  }

  async setCodes(session: SessionWithStore, change: { add?: string; remove?: string }): Promise<void> {
    this.assertOpen(session);
    const state = couponStateOf(session);
    if (change.add) {
      const code = change.add.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,40}$/.test(code)) throw badRequest('This code is not valid.', 'invalid_code');
      state.codes = [...state.codes.filter((c) => c !== code), code].slice(-5);
    }
    if (change.remove) {
      const code = change.remove.trim().toUpperCase();
      if (state.codes.includes(code)) state.codes = state.codes.filter((c) => c !== code);
      else {
        // An automatic offer the shopper took off.
        const coupon = await this.prisma.coupon.findFirst({ where: { storeId: session.storeId, code } });
        if (coupon?.automatic) state.removed = [...new Set([...state.removed, coupon.id])];
      }
    }
    await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { couponState: state as unknown as Prisma.InputJsonValue } });
    session.couponState = state as unknown as Prisma.JsonValue;
  }

  // ---------------------------------------------------------------- pay

  /**
   * The shopper picked a method. Prices are re-read fresh from the catalog; when the total is not
   * what the shopper saw, nothing happens and the new state comes back (409 price_changed).
   * Cash on delivery places the order now; online methods return the page that opens the gateway.
   */
  async pay(session: SessionWithStore, customer: Customer, method: PaymentMethod, expectedTotal: number): Promise<{ order?: true; pay?: PayStart }> {
    this.assertOpen(session);
    const address = this.addressOf(session, customer);
    if (!address) throw badRequest('Choose a delivery address first.', 'no_address');

    const old = session.cart as unknown as Cart;
    const cart = withUpsellPrices((await buildCart(this.deps.catalog, session.storeId, old.lines, true)).cart, upsellStateOf(session.upsell));
    const ctx = await this.context(session, customer);
    const priced = await this.pricing(session, ctx, customer, cart);
    const result = priced.byMethod.get(method);
    const changed = cart.lines.length !== old.lines.length || cart.lines.some((l, i) => l.unitPrice !== old.lines[i]?.unitPrice || l.variantId !== old.lines[i]?.variantId);
    if (changed) await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { cart: cart as unknown as Prisma.InputJsonValue } });
    if (cart.lines.length === 0) throw badRequest('These items are not available any more.', 'empty_cart');
    if (priced.plain.unserviceable) throw badRequest('Sorry, we do not deliver to this pincode yet.', 'unserviceable');
    if (!result) throw badRequest('This payment method is not available for this order.', 'method_unavailable');
    if (changed || result.total !== expectedTotal) {
      session.cart = cart as unknown as Prisma.JsonValue;
      throw new HttpError(409, 'price_changed', 'Prices were updated. Please check your order total.', { data: { state: await this.state(session, customer) } });
    }

    const gifts = result.gifts.length ? await this.deps.catalog.variants(session.storeId, result.gifts.map((g) => g.variantId)) : new Map();
    const draft: OrderDraft = {
      method,
      mode: modeOf(method),
      cart,
      pricing: result,
      address,
      phone: customer.phone,
      giftInfo: Object.fromEntries([...gifts.entries()].map(([id, v]) => [id, { title: v.productTitle, image: v.image }])),
    };

    if (method === 'cod') {
      const { order } = await createOrder(this.prisma, {
        storeId: session.storeId,
        sessionId: session.id,
        customerId: customer.id,
        draft,
        paidAmount: 0,
        note: session.note,
        attribution: session.attribution,
      });
      await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { paymentMethod: method, pricing: result as unknown as Prisma.InputJsonValue } });
      void pushOrderToShopify(this.prisma, this.deps.orderSink, order.id);
      return { order: true };
    }

    const account = method === 'partial_cod' ? ctx.partialAccount : ctx.routes.get(method);
    if (!account) throw badRequest('This payment method is not available for this order.', 'method_unavailable');
    const ref = `ck${randomToken(12)}`; // 18 characters: fits PayU's 25-character txnid
    await this.prisma.$transaction([
      this.prisma.paymentTransaction.create({
        data: {
          storeId: session.storeId,
          sessionId: session.id,
          gatewayAccountId: account.id,
          provider: account.provider,
          amount: result.payNow,
          method,
          merchantRef: ref,
          draft: draft as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { status: 'PAYING', step: 'PROCESSING', paymentMethod: method, pricing: result as unknown as Prisma.InputJsonValue, total: result.total },
      }),
    ]);
    return { pay: { url: `${this.deps.env.PUBLIC_URL}/checkout/go/${ref}`, ref } };
  }

  /** Shopper closed the gateway / pressed "Change payment method" while a payment was open. */
  // ---------------------------------------------------------------- upsell

  /** The offer this cart and shopper get now. markShown starts its timer the first time it is shown. */
  private async upsellOffer(session: SessionWithStore, customer: Customer | null, state: UpsellState, markShown: boolean) {
    const rows = await this.prisma.upsellRule.findMany({ where: { storeId: session.storeId, active: true }, select: { id: true, priority: true, rule: true } });
    if (rows.length === 0) return null;
    const cart = session.cart as unknown as Cart;
    const now = Date.now();
    const rule = pickRule(liveRules(rows), cart, shopperOf(customer), state, now);
    if (!rule) return null;
    const products = await this.deps.catalog.products(session.storeId, rule.rule.productIds);
    let shownAt = state.shown[rule.id];
    if (markShown && shownAt === undefined) {
      const offer = offerOf(rule, products, cart, now);
      if (!offer) return null;
      shownAt = now;
      state.shown[rule.id] = now;
      await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { upsell: state as unknown as Prisma.InputJsonValue } });
      session.upsell = state as unknown as Prisma.JsonValue;
    }
    const offer = offerOf(rule, products, cart, shownAt);
    return offer ? { rule, offer } : null;
  }

  /** "Add" on an offer: one unit, at the offer price, only while the offer is live for this cart. */
  async addUpsell(session: SessionWithStore, customer: Customer, variantId: string): Promise<void> {
    this.assertOpen(session);
    if (session.status !== 'OPEN') throw conflict('A payment is in progress.', 'paying');
    const state = upsellStateOf(session.upsell);
    const live = await this.upsellOffer(session, customer, state, false);
    const item = live?.offer.items.find((i) => i.variants.some((v) => v.variantId === variantId));
    if (!live || !item || state.shown[live.rule.id] === undefined) throw badRequest('This offer has ended.', 'offer_ended');
    const { cart: one } = await buildCart(this.deps.catalog, session.storeId, [{ variantId, quantity: 1 }], true);
    if (!one.lines[0]) throw badRequest('This item is sold out.', 'sold_out');
    const lineId = `${UPSELL_PREFIX}${variantId}`;
    state.lines[lineId] = { ruleId: live.rule.id, percent: live.rule.rule.discountPercent };
    const cart = session.cart as unknown as Cart;
    const line = withUpsellPrices({ currency: 'INR', lines: [{ ...one.lines[0], lineId }] }, state).lines[0]!;
    const next: Cart = { ...cart, lines: [...cart.lines.filter((l) => l.lineId !== lineId), line] };
    await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { cart: next as unknown as Prisma.InputJsonValue, upsell: state as unknown as Prisma.InputJsonValue } });
    session.cart = next as unknown as Prisma.JsonValue;
    session.upsell = state as unknown as Prisma.JsonValue;
  }

  /** Removes a line the shopper added from an offer (their own cart lines stay). */
  async removeUpsell(session: SessionWithStore, lineId: string): Promise<void> {
    this.assertOpen(session);
    if (session.status !== 'OPEN') throw conflict('A payment is in progress.', 'paying');
    const state = upsellStateOf(session.upsell);
    if (!state.lines[lineId]) throw notFound('This item was not added from an offer.');
    delete state.lines[lineId];
    const cart = session.cart as unknown as Cart;
    const next: Cart = { ...cart, lines: cart.lines.filter((l) => l.lineId !== lineId) };
    await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { cart: next as unknown as Prisma.InputJsonValue, upsell: state as unknown as Prisma.InputJsonValue } });
    session.cart = next as unknown as Prisma.JsonValue;
    session.upsell = state as unknown as Prisma.JsonValue;
  }

  async cancelPending(session: SessionWithStore): Promise<void> {
    if (session.completedAt) return;
    await this.prisma.checkoutSession.update({ where: { id: session.id }, data: { status: 'OPEN', step: 'PAYMENT' } });
    // Pending payments stay pending: if the money still arrives, refresh() / the webhook places the order.
  }

  // ---------------------------------------------------------------- gateway side

  async transaction(ref: string) {
    if (!/^ck[\w-]{8,30}$/.test(ref)) return null;
    return this.prisma.paymentTransaction.findUnique({ where: { merchantRef: ref }, include: { session: { include: { store: true } }, gateway: true } });
  }

  /** Called by /checkout/go/:ref — asks the gateway how to send the shopper there. */
  async startGateway(txn: NonNullable<Awaited<ReturnType<CheckoutService['transaction']>>>) {
    if (!txn.gateway) throw new Error('payment has no gateway');
    const saved = (txn.raw as { start?: { kind: 'redirect'; url: string } } | null)?.start;
    if (txn.status === 'PENDING' && saved?.kind === 'redirect') return saved;
    const draft = txn.draft as unknown as OrderDraft;
    const start = await this.deps.gateways.for(txn.gateway).start({
      merchantRef: txn.merchantRef,
      amount: txn.amount,
      method: txn.method ?? undefined,
      customer: { name: draft.address.name, phone: draft.phone, email: draft.address.email },
      returnUrl: `${this.deps.env.PUBLIC_URL}/checkout/return/${txn.merchantRef}`,
      notifyUrl: `${this.deps.env.PUBLIC_URL}/webhooks/gateway/${txn.provider.toLowerCase()}`,
      description: `Order at ${txn.session.store.name}`,
    });
    await this.prisma.paymentTransaction.update({
      where: { id: txn.id },
      data: {
        status: 'PENDING',
        gatewayRef: start.gatewayRef ?? txn.gatewayRef,
        // A redirect URL can be reused if the shopper reloads; a POST form is rebuilt each time.
        raw: start.kind === 'redirect' ? ({ start: { kind: 'redirect', url: start.url } } as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
    return start;
  }

  private lastCheck = new Map<string, number>();

  /**
   * Asks the gateway (server to server) how a payment stands and acts on it. Safe to call any
   * number of times from the return page, the webhook and the checkout's polling.
   */
  async settle(ref: string, opts: { minIntervalMs?: number } = {}): Promise<'success' | 'failed' | 'pending' | 'unknown'> {
    const txn = await this.transaction(ref);
    if (!txn || !txn.gateway) return 'unknown';
    if (txn.status === 'SUCCESS') {
      await this.placePaidOrder(txn);
      return 'success';
    }
    if (txn.status === 'FAILED') return 'failed';
    const now = Date.now();
    if (opts.minIntervalMs && now - (this.lastCheck.get(ref) ?? 0) < opts.minIntervalMs) return 'pending';
    this.lastCheck.set(ref, now);
    if (this.lastCheck.size > 10_000) this.lastCheck.clear();

    let status;
    try {
      status = await this.deps.gateways.for(txn.gateway).status(ref, txn.gatewayRef);
    } catch {
      return 'pending'; // gateway unreachable: ask again later
    }
    const raw = { ...((txn.raw as object | null) ?? {}), status: status.raw } as Prisma.InputJsonValue;
    if (status.state === 'pending') {
      await this.prisma.paymentTransaction.update({ where: { id: txn.id }, data: { raw } });
      return 'pending';
    }
    if (status.state === 'success' && status.amount !== undefined && status.amount !== txn.amount) {
      // Never accept a payment of another amount as this order's. Needs a person (refund).
      await this.prisma.paymentTransaction.update({
        where: { id: txn.id },
        data: { status: 'FAILED', raw: { ...(raw as object), problem: `amount mismatch: gateway ${status.amount}, expected ${txn.amount}` } as Prisma.InputJsonValue },
      });
      await this.reopen(txn.sessionId);
      return 'failed';
    }
    if (status.state === 'success' && status.amount === undefined) {
      // "Paid" only with the amount confirmed: without it a person checks (the check fails closed).
      await this.prisma.paymentTransaction.update({ where: { id: txn.id }, data: { raw: { ...(raw as object), problem: 'gateway said success without an amount: check by hand' } as Prisma.InputJsonValue } });
      return 'pending';
    }
    if (status.state === 'failed') {
      const changed = await this.prisma.paymentTransaction.updateMany({ where: { id: txn.id, status: { in: ['CREATED', 'PENDING'] } }, data: { status: 'FAILED', raw, gatewayRef: status.gatewayRef ?? txn.gatewayRef } });
      if (changed.count) await this.reopen(txn.sessionId);
      return 'failed';
    }
    // Paid another way than chosen (the gateway page offered more methods): the order is placed (the money
    // is in) but flagged, because an offer for the chosen method may not apply to the one used.
    const used = ourMethod(status.method);
    const mismatch = used && txn.method && txn.method !== 'partial_cod' && used !== txn.method ? `Paid by ${used.toUpperCase()}, but ${txn.method.toUpperCase()} was chosen: check method offers on this order.` : null;
    const changed = await this.prisma.paymentTransaction.updateMany({
      where: { id: txn.id, status: { in: ['CREATED', 'PENDING'] } },
      data: { status: 'SUCCESS', verifiedAt: new Date(), raw: mismatch ? ({ ...(raw as object), problem: mismatch } as Prisma.InputJsonValue) : raw, gatewayRef: status.gatewayRef ?? txn.gatewayRef, method: txn.method },
    });
    await this.placePaidOrder(txn);
    if (mismatch && changed.count) {
      const order = await this.prisma.order.findUnique({ where: { sessionId: txn.sessionId }, select: { id: true, note: true } });
      if (order) await this.prisma.order.update({ where: { id: order.id }, data: { note: `⚠ ${mismatch}${order.note ? `\n${order.note}` : ''}` } });
    }
    return 'success';
  }

  private async reopen(sessionId: string) {
    await this.prisma.checkoutSession.updateMany({ where: { id: sessionId, completedAt: null, status: 'PAYING' }, data: { status: 'OPEN', step: 'PAYMENT' } });
  }

  private async placePaidOrder(txn: PaymentTransaction & { session: CheckoutSession }) {
    const draft = txn.draft as unknown as OrderDraft;
    const { order, created } = await createOrder(this.prisma, {
      storeId: txn.storeId,
      sessionId: txn.sessionId,
      customerId: txn.session.customerId,
      draft,
      paidAmount: txn.amount,
      transactionId: txn.id,
      note: txn.session.note,
      attribution: txn.session.attribution,
    });
    if (created) {
      void pushOrderToShopify(this.prisma, this.deps.orderSink, order.id);
    } else if (order.id && txn.orderId !== order.id) {
      // A second successful payment for an order that already exists: keep it visible for a refund.
      const isOther = !(await this.prisma.paymentTransaction.findFirst({ where: { id: txn.id, orderId: order.id } }));
      if (isOther) {
        await this.prisma.paymentTransaction.update({
          where: { id: txn.id },
          data: { raw: { ...((txn.raw as object | null) ?? {}), problem: 'second payment for a placed order: refund it' } as Prisma.InputJsonValue },
        });
      }
    }
  }

  /** Polling from the checkout: check the open payments of this session. */
  async refresh(session: SessionWithStore): Promise<void> {
    if (session.completedAt) return;
    const open = await this.prisma.paymentTransaction.findMany({
      where: { sessionId: session.id, status: { in: ['CREATED', 'PENDING'] }, createdAt: { gt: new Date(Date.now() - 2 * 3600_000) } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    for (const t of open) if (t.status === 'PENDING') await this.settle(t.merchantRef, { minIntervalMs: 4000 });
  }
}

export const addressFields = (a: CheckoutAddress) => [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(', ');
export type { PricingResult };
