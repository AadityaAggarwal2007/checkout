import { createHash, generateKeyPairSync } from 'node:crypto';
import { compactDecrypt, compactVerify, importPKCS8, importSPKI } from 'jose';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.js';
import { WhatsAppOtpSender } from '../src/messaging/otp-sender.js';
import { shopifyOrderInput } from '../src/orders/sink.js';
import { PayGlocalGateway } from '../src/payments/payglocal.js';
import { PayUGateway } from '../src/payments/payu.js';
import { paiseFrom } from '../src/payments/types.js';

const sha512 = (s: string) => createHash('sha512').update(s).digest('hex');

function recorder(answer: unknown, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

const REQ = {
  merchantRef: 'ckABCDEF123456',
  amount: 14780,
  method: 'upi',
  customer: { name: 'Asha Verma', phone: '+919876543210', email: 'asha@example.com' },
  returnUrl: 'https://api.test/checkout/return/ckABCDEF123456',
  notifyUrl: 'https://api.test/webhooks/gateway/payu',
  description: 'Order at Kurtiya',
};

describe('PayU', () => {
  it('builds the hosted-page form with the documented hash', async () => {
    const gw = new PayUGateway({ key: 'KEY1', salt: 'SALT1' }, 'test');
    const start = await gw.start(REQ);
    expect(start.kind).toBe('post');
    if (start.kind !== 'post') return;
    expect(start.url).toBe('https://test.payu.in/_payment');
    const f = start.fields;
    expect(f).toMatchObject({ key: 'KEY1', txnid: REQ.merchantRef, amount: '147.80', firstname: 'Asha', phone: '9876543210', enforce_paymethod: 'upi' });
    expect(f.hash).toBe(sha512(`KEY1|${REQ.merchantRef}|147.80|Order at Kurtiya|Asha|asha@example.com|||||||||||SALT1`));
    expect(Object.values(f).join(' ')).not.toContain('SALT1');
  });

  it('asks verify_payment server to server and maps the answer', async () => {
    const { calls, fetchImpl } = recorder({
      status: 1,
      transaction_details: { [REQ.merchantRef]: { status: 'success', amt: '147.80', mihpayid: '403993715', mode: 'UPI' } },
    });
    const gw = new PayUGateway({ key: 'KEY1', salt: 'SALT1' }, 'live', fetchImpl);
    const st = await gw.status(REQ.merchantRef);
    expect(st).toMatchObject({ state: 'success', amount: 14780, gatewayRef: '403993715', method: 'UPI' });
    expect(calls[0]!.url).toBe('https://info.payu.in/merchant/postservice.php?form=2');
    const body = new URLSearchParams(String(calls[0]!.init!.body));
    expect(body.get('command')).toBe('verify_payment');
    expect(body.get('hash')).toBe(sha512(`KEY1|verify_payment|${REQ.merchantRef}|SALT1`));

    const failed = new PayUGateway({ key: 'K', salt: 'S' }, 'test', recorder({ transaction_details: { x: { status: 'failure' } } }).fetchImpl);
    expect((await failed.status('x')).state).toBe('failed');
    const unknown = new PayUGateway({ key: 'K', salt: 'S' }, 'test', recorder({ status: 0, msg: 'not found' }).fetchImpl);
    expect((await unknown.status('x')).state).toBe('pending');
  });
});

describe('PayGlocal', () => {
  const pg = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const creds = {
    merchantId: 'MID1',
    publicKeyId: 'pg-kid',
    privateKeyId: 'm-kid',
    payglocalPublicKey: pg.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    merchantPrivateKey: merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };

  it('sends an encrypted, signed initiate and returns the redirect', async () => {
    const { calls, fetchImpl } = recorder({ status: 'INPROGRESS', gid: 'gl_123', data: { redirectUrl: 'https://pay.uat.payglocal.in/x' } });
    const gw = new PayGlocalGateway(creds, 'test', fetchImpl);
    const start = await gw.start(REQ);
    expect(start).toEqual({ kind: 'redirect', url: 'https://pay.uat.payglocal.in/x', gatewayRef: 'gl_123' });
    const call = calls[0]!;
    expect(call.url).toBe('https://api.uat.payglocal.in/gl/v1/payments/initiate/paycollect');
    const jwe = String(call.init!.body);
    // PayGlocal (holder of its private key) can read it…
    const plain = await compactDecrypt(jwe, await importPKCS8(pg.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'RSA-OAEP-256'));
    const payload = JSON.parse(new TextDecoder().decode(plain.plaintext));
    expect(payload).toMatchObject({ merchantTxnId: REQ.merchantRef, paymentData: { totalAmount: '147.80', txnCurrency: 'INR' }, merchantCallbackURL: REQ.returnUrl });
    // …and the JWS proves it came from us, over this exact JWE.
    const headers = call.init!.headers as Record<string, string>;
    const verified = await compactVerify(headers['x-gl-token-external']!, await importSPKI(merchant.publicKey.export({ type: 'spki', format: 'pem' }).toString(), 'RS256'));
    const digest = JSON.parse(new TextDecoder().decode(verified.payload)).digest;
    expect(digest).toBe(createHash('sha256').update(jwe).digest('base64'));
    expect(headers['x-gl-merchantid']).toBe('MID1');
  });

  it('maps the status answer and reads the callback only for the reference', async () => {
    const ok = new PayGlocalGateway(creds, 'test', recorder({ gid: 'gl_123', status: 'SENT_FOR_CAPTURE', data: { status: 'SENT_FOR_CAPTURE', Amount: '147.80' } }).fetchImpl);
    expect(await ok.status(REQ.merchantRef, 'gl_123')).toMatchObject({ state: 'success', amount: 14780 });
    const declined = new PayGlocalGateway(creds, 'test', recorder({ gid: 'gl_1', status: 'ISSUER_DECLINE' }).fetchImpl);
    expect((await declined.status('x', 'gl_1')).state).toBe('failed');
    expect((await ok.status('x', null)).state).toBe('pending');
    const token = `e30.${Buffer.from(JSON.stringify({ merchantTxnId: 'ckXYZ12345678' })).toString('base64url')}.sig`;
    expect(ok.refFromCallback({ 'x-gl-token': token })).toBe('ckXYZ12345678');
    expect(ok.refFromCallback({})).toBeNull();
  });
});

describe('WhatsApp OTP sender', () => {
  it('sends the authentication template with the code in body and button', async () => {
    const { calls, fetchImpl } = recorder({ messages: [{ id: 'wamid.1' }] });
    const sender = new WhatsAppOtpSender({ token: 'TOKEN', phoneNumberId: '123', template: 'otp_login', lang: 'en', apiVersion: 'v21.0' }, fetchImpl);
    await sender.send('+919876543210', '482913');
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v21.0/123/messages');
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({ to: '919876543210', type: 'template', template: { name: 'otp_login', language: { code: 'en' } } });
    expect(JSON.stringify(body.template.components)).toContain('482913');
    const failing = new WhatsAppOtpSender({ token: 'T', phoneNumberId: '1', template: 't', lang: 'en', apiVersion: 'v21.0' }, recorder({ error: {} }, 400).fetchImpl);
    await expect(failing.send('+919876543210', '111111')).rejects.toThrow(/WhatsApp send failed/);
  });
});

describe('environment safety', () => {
  const base = {
    NODE_ENV: 'production',
    PUBLIC_URL: 'https://api.example.com',
    DASHBOARD_URL: 'https://dash.example.com',
    DATABASE_URL: 'postgresql://x',
    JWT_SECRET: 'a'.repeat(44),
    ENCRYPTION_KEYS: `k1:${'b'.repeat(44)}`,
    HASH_PEPPER: 'c'.repeat(44),
  };
  it('refuses fake OTP, gateway, order sink or catalog in production', () => {
    expect(() => loadEnv(base)).toThrow(/OTP_SENDER/);
    expect(() => loadEnv({ ...base, OTP_SENDER: 'whatsapp' })).toThrow(/WHATSAPP_TOKEN/);
    const live = { ...base, OTP_SENDER: 'whatsapp', WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_OTP_TEMPLATE: 'otp' };
    expect(() => loadEnv(live)).not.toThrow();
    expect(() => loadEnv({ ...live, DEV_GATEWAY: '1' })).toThrow(/DEV_GATEWAY/);
    expect(() => loadEnv({ ...live, ORDER_SINK: 'dev' })).toThrow(/ORDER_SINK/);
  });
});

describe('Shopify order', () => {
  it('copies lines, prices, shipping, discount and the COD balance', () => {
    const input = shopifyOrderInput({
      id: 'o1',
      storeId: 's1',
      sessionId: 'x',
      customerId: null,
      shopifyOrderId: null,
      shopifyName: null,
      number: 'CK1001',
      shopifyError: null,
      paymentMode: 'PARTIAL_COD',
      paymentStatus: 'PARTIALLY_PAID',
      paymentMethod: 'partial_cod',
      fulfillmentStatus: null,
      financialStatus: null,
      cancelledAt: null,
      contactName: 'Asha Verma',
      contactPhone: '+919876543210',
      contactEmail: null,
      shippingAddress: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
      billingAddress: null,
      gstin: null,
      note: null,
      subtotal: 24800,
      discount: 12400,
      shipping: 3000,
      codFee: 0,
      total: 15400,
      paidAmount: 5000,
      dueOnDelivery: 10400,
      couponCodes: ['B1G1'],
      pricing: {},
      attribution: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [
        { id: 'l1', orderId: 'o1', productId: '1001', variantId: '2001', title: 'Jhumka', variantTitle: null, image: null, sku: null, quantity: 2, unitPrice: 12400, compareAtPrice: null, discount: 12400, total: 12400, isGift: false },
        { id: 'l2', orderId: 'o1', productId: '1009', variantId: '2081', title: 'Gift', variantTitle: null, image: null, sku: null, quantity: 1, unitPrice: 4900, compareAtPrice: null, discount: 4900, total: 0, isGift: true },
      ],
    });
    const o = input.order;
    expect(o.financialStatus).toBe('PARTIALLY_PAID');
    expect(o.lineItems).toEqual([
      { variantId: 'gid://shopify/ProductVariant/2001', quantity: 2, priceSet: { shopMoney: { amount: '124.00', currencyCode: 'INR' } } },
      { variantId: 'gid://shopify/ProductVariant/2081', quantity: 1, priceSet: { shopMoney: { amount: '0.00', currencyCode: 'INR' } } },
    ]);
    expect(o.discountCode?.itemFixedDiscountCode.amountSet.shopMoney.amount).toBe('124.00');
    expect(o.shippingLines[0]!.priceSet.shopMoney.amount).toBe('30.00');
    expect(o.transactions).toHaveLength(2);
    expect(o.shippingAddress).toMatchObject({ firstName: 'Asha', lastName: 'Verma', zip: '302001', countryCode: 'IN', province: 'Rajasthan' });
    expect(o.tags).toContain('Partial COD');
    expect(paiseFrom('147.80')).toBe(14780);
    expect(paiseFrom('abc')).toBeUndefined();
  });
});
