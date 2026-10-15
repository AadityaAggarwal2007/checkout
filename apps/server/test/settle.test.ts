import type { CheckoutState } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { ourMethod, type GatewayStatus } from '../src/payments/types.js';
import { keyring, makeApp, otpOutbox, prisma, resetDb } from './helpers.js';

let app: FastifyInstance;
let storeId: string;
let answer: (amount: number) => GatewayStatus;

beforeAll(async () => {
  app = await makeApp();
  // The test gateway, but its server-to-server answer is ours to choose.
  const registry = app.deps.gateways;
  const real = registry.for.bind(registry);
  (registry as { for: typeof registry.for }).for = (acc) => {
    const g = real(acc);
    return Object.assign(Object.create(Object.getPrototypeOf(g)), g, { status: async (ref: string) => answer((await prisma.paymentTransaction.findUniqueOrThrow({ where: { merchantRef: ref } })).amount) });
  };
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  storeId = (await seedDemo(prisma)).storeId;
  await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: true } });
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'DEV', active: true, credentialsEnc: keyring.encryptJson({}) } });
  otpOutbox.outbox.clear();
});

let phoneSeq = 0;
async function payUpi() {
  const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId: '2021', quantity: 1 }] } });
  const auth = { authorization: `Bearer ${start.json().token}` };
  const number = `94${String(76500000 + ++phoneSeq)}`;
  const sent = await app.inject({ method: 'POST', url: '/checkout/api/otp/send', headers: auth, payload: { phone: number } });
  const ver = await app.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers: auth, payload: { challengeId: sent.json().challengeId, phone: number, code: otpOutbox.outbox.get(`+91${number}`) } });
  const h = { ...auth, 'x-ck-device': ver.json().deviceToken };
  const state = (await app.inject({ method: 'POST', url: '/checkout/api/address', headers: h, payload: { address: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } } })).json().state as CheckoutState;
  const upi = state.methods.find((m) => m.method === 'upi')!;
  const ref = (await app.inject({ method: 'POST', url: '/checkout/api/pay', headers: h, payload: { method: 'upi', expectedTotal: upi.total } })).json().pay.ref as string;
  await app.inject({ method: 'GET', url: `/checkout/return/${ref}` });
  return { ref, sessionId: state.id };
}

describe('settling a payment', () => {
  it('a success without an amount is never "paid"', async () => {
    answer = () => ({ state: 'success', raw: {} });
    const { ref, sessionId } = await payUpi();
    expect(await prisma.order.count({ where: { sessionId } })).toBe(0);
    const txn = await prisma.paymentTransaction.findUniqueOrThrow({ where: { merchantRef: ref } });
    expect(txn.status).not.toBe('SUCCESS');
    expect(JSON.stringify(txn.raw)).toContain('without an amount');
  });

  it('paid by card after choosing UPI: the order is placed and flagged', async () => {
    answer = (amount) => ({ state: 'success', amount, method: 'CC', raw: {} });
    const { sessionId } = await payUpi();
    const order = await prisma.order.findUniqueOrThrow({ where: { sessionId } });
    expect(order.paymentStatus).toBe('PAID');
    expect(order.note).toContain('Paid by CARD, but UPI was chosen');
  });

  it('reads gateway method names', () => {
    expect(['UPI', 'CC', 'DC', 'NB', 'CASH', 'EMI', 'BNPL', 'NET_BANKING', 'CARD', 'x', undefined].map(ourMethod)).toEqual(['upi', 'card', 'card', 'netbanking', 'wallet', 'emi', 'pay_later', 'netbanking', 'card', undefined, undefined]);
  });
});

describe('which gateway takes a method', () => {
  it('a real gateway comes before the local test one, whichever was added first', async () => {
    const { routeTable } = await import('../src/checkout/pricing.js');
    const dev = { id: 'd', provider: 'DEV', active: true } as never;
    const payu = { id: 'p', provider: 'PAYU', active: true } as never;
    expect(routeTable([dev, payu], [], true).get('upi')).toBe(payu);
    expect(routeTable([dev], [], true).get('upi')).toBe(dev);
    expect(routeTable([dev, payu], [], false).get('card')).toBe(payu);
  });

  it('Automatic methods and routes to a switched-off gateway use the first active gateway', async () => {
    const { routeTable } = await import('../src/checkout/pricing.js');
    const glocal = { id: 'g', provider: 'PAYGLOCAL', active: false } as never;
    const pine = { id: 'pl', provider: 'PINELABS', active: true } as never;
    const payu = { id: 'p', provider: 'PAYU', active: true } as never;
    const routes = [{ method: 'upi', gatewayAccountId: 'g' }, { method: 'card', gatewayAccountId: 'p' }] as never;
    const table = routeTable([pine, payu].concat(glocal), routes, false);
    expect(table.get('upi')).toBe(pine); // its gateway is off
    expect(table.get('card')).toBe(payu); // explicit route kept
    expect(table.get('netbanking')).toBe(pine); // Automatic
    expect(routeTable([glocal], routes, false).size).toBe(0);
  });
});

describe('gateway hand-off page', () => {
  it('lets the form follow the gateway onto its other hosts (PayU _payment redirects to api.payu.in)', async () => {
    const { gatewayFormSources } = await import('../src/checkout/pages.js');
    expect(gatewayFormSources('https://secure.payu.in/_payment')).toBe('https://secure.payu.in https://payu.in https://*.payu.in');
    expect(gatewayFormSources('https://test.payu.in/_payment')).toContain('https://*.payu.in');
    expect(gatewayFormSources('https://pay.payglocal.in/x')).toContain('https://*.payglocal.in');
  });
});
