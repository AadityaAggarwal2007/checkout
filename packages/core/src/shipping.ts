import type { Paise } from './money.js';
import type { AddressContext } from './types.js';

/**
 * Shipping lives only in our dashboard (owner 2026-10-14): zones of states, rates by order price
 * or weight, slabs with a charge and "COD allowed", blocked pincodes.
 */
export interface ShippingSlab {
  /** Lower bound, inclusive: paise for 'price' rates, grams for 'weight' rates. */
  min: number;
  /** Upper bound, exclusive. Absent = no upper limit. */
  max?: number;
  charge: Paise;
  codAllowed: boolean;
}

export interface ShippingRateConfig {
  id: string;
  name: string;
  /** "3-5 business days" — shown as is. */
  eta?: string;
  basis: 'price' | 'weight';
  active: boolean;
  slabs: ShippingSlab[];
  blockedPincodes?: string[];
}

export interface ShippingZoneConfig {
  id: string;
  name: string;
  /** States this zone covers. Empty / absent = every state not covered by another zone. */
  states?: string[];
  rates: ShippingRateConfig[];
}

export interface ShippingConfig {
  zones: ShippingZoneConfig[];
}

export interface ShippingOption {
  rateId: string;
  zoneId: string;
  name: string;
  eta?: string;
  charge: Paise;
  codAllowed: boolean;
  /** Text the shopper sees. Never "Free" for a charge above 0 (design rule 7). */
  label: string;
  /** Spend this much more (same rate) to reach a ₹0 slab. Only for price-based rates. */
  addForFree?: Paise;
}

export interface ShippingQuoteInput {
  /** Merchandise value after coupon discounts, before payment offers. */
  merchandiseTotal: Paise;
  weightGrams: number;
  address?: AddressContext;
}

export function shippingLabel(charge: Paise): string {
  return charge === 0 ? 'Free shipping' : 'Shipping';
}

/** Warn the merchant when a rate is named "free" but charges money in some slab. */
export function misleadingFreeName(rate: ShippingRateConfig): boolean {
  return /\bfree\b/i.test(rate.name) && rate.slabs.some((s) => s.charge > 0);
}

function zoneFor(config: ShippingConfig, state?: string): ShippingZoneConfig | undefined {
  const norm = state?.trim().toLowerCase();
  if (norm) {
    const exact = config.zones.find((z) => z.states?.some((s) => s.trim().toLowerCase() === norm));
    if (exact) return exact;
  }
  return config.zones.find((z) => !z.states || z.states.length === 0);
}

function slabFor(rate: ShippingRateConfig, value: number): ShippingSlab | undefined {
  return rate.slabs.find((s) => value >= s.min && (s.max === undefined || value < s.max));
}

export function quoteShipping(config: ShippingConfig, input: ShippingQuoteInput): ShippingOption[] {
  const zone = zoneFor(config, input.address?.state);
  if (!zone) return [];
  const pincode = input.address?.pincode?.trim();
  const options: ShippingOption[] = [];
  for (const rate of zone.rates) {
    if (!rate.active) continue;
    if (pincode && rate.blockedPincodes?.includes(pincode)) continue;
    const value = rate.basis === 'price' ? input.merchandiseTotal : input.weightGrams;
    const slab = slabFor(rate, value);
    if (!slab) continue;
    const option: ShippingOption = {
      rateId: rate.id,
      zoneId: zone.id,
      name: rate.name,
      eta: rate.eta,
      charge: slab.charge,
      codAllowed: slab.codAllowed,
      label: shippingLabel(slab.charge),
    };
    if (rate.basis === 'price' && slab.charge > 0) {
      const free = rate.slabs
        .filter((s) => s.charge === 0 && s.min > input.merchandiseTotal)
        .sort((a, b) => a.min - b.min)[0];
      if (free) option.addForFree = free.min - input.merchandiseTotal;
    }
    options.push(option);
  }
  return options.sort((a, b) => a.charge - b.charge || a.name.localeCompare(b.name));
}
