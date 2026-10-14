import { z } from 'zod';

/**
 * The checkout page (apps/checkout, in an iframe on our origin) and its API (/checkout/api/*).
 * Types here are the contract between the server and the page.
 */

/** India's states and union territories, as the address form lists them (shipping zones use the same names). */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

/** Finds the list's spelling of a state name ("delhi", "NCT of Delhi", "Orissa" -> list names). */
export function matchState(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const clean = input.toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases: Record<string, string> = {
    'nct of delhi': 'Delhi',
    'new delhi': 'Delhi',
    orissa: 'Odisha',
    pondicherry: 'Puducherry',
    'jammu kashmir': 'Jammu and Kashmir',
    uttaranchal: 'Uttarakhand',
    'andaman nicobar': 'Andaman and Nicobar Islands',
    'andaman and nicobar': 'Andaman and Nicobar Islands',
    'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
    'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  };
  if (aliases[clean]) return aliases[clean];
  return INDIAN_STATES.find((s) => s.toLowerCase() === clean);
}

/**
 * Indian mobile number -> "+91XXXXXXXXXX", or null. Accepts spaces, dashes, a leading 0, 91 or +91.
 * Only 10-digit numbers starting 6-9 are mobiles (WhatsApp OTP needs a mobile).
 */
export function normalizeIndianMobile(input: string | undefined | null): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** "+919876543210" -> "+91 98•••••210" (what the checkout shows before / around OTP). */
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+91/, '');
  return `+91 ${d.slice(0, 2)}${'•'.repeat(5)}${d.slice(7)}`;
}

/** Merchant settings for the checkout page (CheckoutConfig.config). Phase 4 adds the design tabs. */
export const checkoutSettingsSchema = z
  .object({
    logoUrl: z.string().regex(/^https:\/\//).max(500).optional(),
    colors: z
      .object({
        primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#111827'),
        primaryText: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFFFF'),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0E9F6E'),
      })
      .default({}),
    /** Email on the address form. */
    askEmail: z.enum(['hidden', 'optional', 'required']).default('optional'),
    /** Order and visibility of payment methods in the list. */
    methodOrder: z
      .array(z.enum(['upi', 'card', 'netbanking', 'wallet', 'emi', 'pay_later', 'cod', 'partial_cod']))
      .default(['upi', 'card', 'netbanking', 'wallet', 'emi', 'pay_later', 'partial_cod', 'cod']),
    hiddenMethods: z.array(z.string()).default([]),
    payButtonText: z.string().trim().max(40).default('Pay now'),
  })
  .default({});
export type CheckoutSettings = z.infer<typeof checkoutSettingsSchema>;

export const addressInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(60),
  email: z.string().trim().email('Enter a valid email').max(120).optional().or(z.literal('')),
  line1: z.string().trim().min(3, 'Enter house no. and street').max(120),
  line2: z.string().trim().max(120).optional().or(z.literal('')),
  landmark: z.string().trim().max(80).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter your city').max(50),
  state: z.enum(INDIAN_STATES, { errorMap: () => ({ message: 'Choose your state' }) }),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit pincode'),
  tag: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

/** Create a checkout from the store (drawer "Checkout", cart page, "Buy it now"). */
export const createCheckoutSchema = z.object({
  lines: z
    .array(z.object({ variantId: z.string().regex(/^\d{1,20}$/), quantity: z.number().int().min(1).max(999) }))
    .min(1)
    .max(100),
  codes: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
  note: z.string().max(500).optional(),
  source: z.enum(['cart', 'buy_now']).default('cart'),
  attribution: z
    .object({
      landing: z.string().max(500).optional(),
      referrer: z.string().max(500).optional(),
      utm: z.record(z.string().max(40), z.string().max(200)).optional(),
      fbclid: z.string().max(300).optional(),
      fbp: z.string().max(200).optional(),
      fbc: z.string().max(300).optional(),
    })
    .default({}),
});
export type CreateCheckout = z.infer<typeof createCheckoutSchema>;

export type CheckoutStep = 'login' | 'address' | 'payment' | 'processing' | 'done';

export interface CheckoutAddress {
  id?: string;
  name: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  tag: string;
  isDefault?: boolean;
}

export interface CheckoutLine {
  lineId: string;
  variantId: string;
  title: string;
  variantTitle?: string;
  image?: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice?: number;
  discount: number;
  total: number;
  freeUnits: number;
  gift?: boolean;
}

export interface CheckoutMethod {
  method: 'upi' | 'card' | 'netbanking' | 'wallet' | 'emi' | 'pay_later' | 'cod' | 'partial_cod';
  /** Total of the order when paid this way, and what is paid now / on delivery. */
  total: number;
  payNow: number;
  payOnDelivery: number;
  /** Extra saving of this method compared with the plain total ("Save ₹20 on UPI"). */
  extraSaving: number;
  codFee: number;
}

/** GET /checkout/api/session and every action's answer: the whole page state. */
export interface CheckoutState {
  id: string;
  step: CheckoutStep;
  store: { name: string; url: string; poweredBy?: string; logoUrl?: string; colors: CheckoutSettings['colors'] };
  settings: { askEmail: CheckoutSettings['askEmail']; payButtonText: string; codConfirm: boolean };
  /** Only after OTP on this device. */
  customer: { phone: string; name?: string; email?: string } | null;
  addresses: CheckoutAddress[];
  address: CheckoutAddress | null;
  email?: string;
  lines: CheckoutLine[];
  summary: {
    subtotal: number;
    discount: number;
    shipping: number;
    shippingLabel: string;
    shippingEta?: string;
    total: number;
    /** One savings number (design rule 8). */
    savings: number;
    itemCount: number;
  };
  coupons: { applied: Array<{ code?: string; title?: string; amount: number; automatic: boolean }>; rejected: Array<{ code: string; message: string }>; visible: Array<{ code: string; title?: string }> };
  methods: CheckoutMethod[];
  /** Why COD is not offered (shown under the list). */
  codReasons: string[];
  unserviceable: boolean;
  payment: { status: 'idle' | 'pending' | 'failed'; message?: string; method?: string };
  order: { number: string; total: number; paidAmount: number; dueOnDelivery: number; paymentMode: 'PREPAID' | 'COD' | 'PARTIAL_COD' } | null;
}

/** POST /checkout/api/pay answer for an online payment. */
export interface PayStart {
  /** Our page that sends the shopper on to the gateway (new tab on desktop, same tab on phone). */
  url: string;
  ref: string;
}
