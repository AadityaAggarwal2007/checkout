import { z } from 'zod';

/**
 * Cart drawer settings (dashboard "Cart drawer" editor). One JSON per drawer; every field has a
 * default so an old saved config keeps working when we add a field (zod fills it in).
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour like #0A2870');
const text = (max: number) => z.string().trim().max(max);

export const TRUST_BADGES = [
  'upi', 'gpay', 'phonepe', 'paytm', 'bhim', 'amazonpay', 'visa', 'mastercard', 'rupay', 'amex',
  'netbanking', 'cod', 'secure', 'easy_returns', 'fast_delivery', 'authentic',
] as const;

export const drawerSettingsSchema = z.object({
  colors: z
    .object({
      primary: hex.default('#0A2870'),
      buttonText: hex.default('#FFFFFF'),
      background: hex.default('#F7F7F8'),
      accent: hex.default('#0F9D58'),
      /** Headings ("You may also like"), the timer boxes, gift borders. */
      highlight: hex.default('#AC6E0D'),
    })
    .default({}),
  /** "Hurry! 03Min : 58Sec" under the title; starts again when it reaches zero. */
  timer: z
    .object({
      enabled: z.boolean().default(false),
      text: text(20).default('Hurry!'),
      minutes: z.number().int().min(1).max(60).default(4),
    })
    .default({}),
  announcements: z
    .object({
      enabled: z.boolean().default(true),
      mode: z.enum(['rotate', 'marquee', 'static']).default('rotate'),
      messages: z.array(text(50).min(1)).max(10).default(['Free delivery across India']),
      durationSec: z.number().int().min(2).max(20).default(3),
    })
    .default({}),
  rewardBar: z
    .object({
      enabled: z.boolean().default(false),
      template: z.enum(['icons', 'simple']).default('icons'),
      counting: z.enum(['value', 'quantity']).default('value'),
      confetti: z.boolean().default(true),
      tiers: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            label: text(30).min(1),
            /** paise for value, pieces for quantity */
            threshold: z.number().int().min(0),
            kind: z.enum(['shipping', 'gift', 'discount']).default('gift'),
          }),
        )
        .max(6)
        .default([]),
    })
    .default({}),
  upsells: z
    .object({
      enabled: z.boolean().default(false),
      title: text(30).default('You may also like'),
      /** manual = the products below; auto = from the store's upsell rules */
      mode: z.enum(['manual', 'auto']).default('manual'),
      productIds: z.array(z.string().min(1)).max(30).default([]),
      max: z.number().int().min(1).max(30).default(10),
    })
    .default({}),
  addons: z
    .object({
      enabled: z.boolean().default(false),
      rules: z
        .array(
          z.object({
            id: z.string().min(1),
            /** Show the add-on when any of these products is in the cart (empty = always). */
            triggerProductIds: z.array(z.string()).default([]),
            addonVariantId: z.string().min(1),
            label: text(60).default(''),
          }),
        )
        .max(10)
        .default([]),
    })
    .default({}),
  notes: z
    .object({
      enabled: z.boolean().default(false),
      position: z.enum(['body', 'footer']).default('body'),
      title: text(30).default('Add instructions'),
      placeholder: text(30).default('Add note here...'),
      maxLength: z.number().int().min(20).max(1000).default(300),
    })
    .default({}),
  confirmation: z
    .object({
      enabled: z.boolean().default(false),
      text: text(100).default('I accept the terms and conditions'),
      checkbox: z.boolean().default(true),
      required: z.boolean().default(false),
    })
    .default({}),
  discountCodes: z
    .object({
      enabled: z.boolean().default(true),
      mode: z.enum(['input', 'list']).default('input'),
      placeholder: text(30).default('Enter coupon code'),
      applyText: text(10).default('Apply'),
      invalidMessage: text(80).default('Invalid discount code'),
      appliedMessage: text(80).default('Discount applied successfully'),
      confetti: z.boolean().default(false),
    })
    .default({}),
  trustBadges: z
    .object({
      enabled: z.boolean().default(false),
      badges: z.array(z.enum(TRUST_BADGES)).max(8).default(['upi', 'gpay', 'mastercard', 'paytm', 'phonepe']),
    })
    .default({}),
  settings: z
    .object({
      showCompareAt: z.boolean().default(true),
      showSavings: z.boolean().default(true),
      showVariantSelector: z.boolean().default(true),
      showProperties: z.boolean().default(true),
      openOnAdd: z.boolean().default(true),
      checkoutText: text(30).default('Buy Now'),
      /** Small tag on the checkout button ("Limited Offer"); empty = none. */
      buttonTag: text(20).default(''),
      emptyTitle: text(30).default('Your cart is empty'),
      emptyDescription: text(60).default("Looks like you haven't added anything to your cart yet"),
      emptyButtonText: text(25).default('Continue Shopping'),
      emptyButtonUrl: z.string().trim().max(200).regex(/^(\/|https:\/\/)/, 'a path like /collections/all').default('/collections/all'),
      /** Theme's cart-count element class (the app embed setting). */
      cartCountClass: text(60).default('cart-count-bubble'),
    })
    .default({}),
});

export type DrawerSettings = z.infer<typeof drawerSettingsSchema>;

export function defaultDrawerSettings(): DrawerSettings {
  return drawerSettingsSchema.parse({});
}

/** Parse a stored / submitted config; unknown keys are dropped, missing ones defaulted. */
export function parseDrawerSettings(input: unknown): DrawerSettings {
  return drawerSettingsSchema.parse(input ?? {});
}
