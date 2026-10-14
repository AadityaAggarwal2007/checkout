import { matchState } from '@checkout/shared';
import type { Env } from '../env.js';
import type { FetchLike } from '../messaging/otp-sender.js';

export interface PincodeInfo {
  city: string;
  state: string;
}

/** Pincode -> city / state for the address form. A miss is fine: the shopper types them. */
export interface PincodeLookup {
  lookup(pincode: string): Promise<PincodeInfo | null>;
}

/** India Post data via api.postalpincode.in, cached in memory (pincodes do not change). */
export class IndiaPostLookup implements PincodeLookup {
  private readonly cache = new Map<string, PincodeInfo | null>();

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async lookup(pincode: string): Promise<PincodeInfo | null> {
    if (!/^[1-9]\d{5}$/.test(pincode)) return null;
    if (this.cache.has(pincode)) return this.cache.get(pincode)!;
    try {
      const res = await this.fetchImpl(`https://api.postalpincode.in/pincode/${pincode}`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const body = (await res.json()) as Array<{ Status: string; PostOffice?: Array<{ District?: string; State?: string }> | null }>;
      const office = body[0]?.Status === 'Success' ? body[0].PostOffice?.[0] : undefined;
      const state = matchState(office?.State);
      const info = office?.District && state ? { city: office.District, state } : null;
      if (this.cache.size > 20_000) this.cache.clear();
      this.cache.set(pincode, info);
      return info;
    } catch {
      return null; // network trouble: do not cache, the shopper types city / state
    }
  }
}

/** A few real pincodes for local runs and tests. */
export class DevPincodeLookup implements PincodeLookup {
  static readonly TABLE: Record<string, PincodeInfo> = {
    '110001': { city: 'New Delhi', state: 'Delhi' },
    '122001': { city: 'Gurugram', state: 'Haryana' },
    '302001': { city: 'Jaipur', state: 'Rajasthan' },
    '380001': { city: 'Ahmedabad', state: 'Gujarat' },
    '400001': { city: 'Mumbai', state: 'Maharashtra' },
    '560001': { city: 'Bengaluru', state: 'Karnataka' },
    '600001': { city: 'Chennai', state: 'Tamil Nadu' },
    '700001': { city: 'Kolkata', state: 'West Bengal' },
  };

  async lookup(pincode: string): Promise<PincodeInfo | null> {
    return DevPincodeLookup.TABLE[pincode] ?? null;
  }
}

export function pincodeLookupFrom(env: Env): PincodeLookup {
  if (env.PINCODE_LOOKUP === 'dev') return new DevPincodeLookup();
  if (env.PINCODE_LOOKUP === 'off') return { lookup: async () => null };
  return new IndiaPostLookup();
}
