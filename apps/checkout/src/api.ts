import type { CheckoutState, PayStart } from '@checkout/shared';

/** Thrown for any non-2xx answer; `message` is safe to show the shopper. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

const DEVICE_KEY = 'ck_device';

/** The device token proves an earlier WhatsApp OTP on this browser (for this store only: storage is per store site). */
export const device = {
  get(): string | undefined {
    try {
      return localStorage.getItem(DEVICE_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(token: string | undefined): void {
    try {
      if (token) localStorage.setItem(DEVICE_KEY, token);
      else localStorage.removeItem(DEVICE_KEY);
    } catch {
      /* storage blocked: the shopper verifies again next time */
    }
  },
};

export function api(token: string) {
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    const d = device.get();
    if (d) headers['x-ck-device'] = d;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch {
      throw new ApiError(0, 'network', 'No internet connection. Please try again.', {});
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(res.status, String(json.error ?? 'error'), String(json.message ?? 'Something went wrong. Please try again.'), json);
    return json as T;
  }
  type S = { state: CheckoutState };
  return {
    session: () => call<S>('GET', '/checkout/api/session'),
    sendOtp: (phone: string) => call<{ challengeId: string; resendInMs: number; phone: string; devCode?: string }>('POST', '/checkout/api/otp/send', { phone }),
    verifyOtp: (challengeId: string, phone: string, code: string) => call<S & { deviceToken: string }>('POST', '/checkout/api/otp/verify', { challengeId, phone, code }),
    logout: () => call<S>('POST', '/checkout/api/logout', {}),
    chooseAddress: (body: { addressId?: string; address?: unknown }) => call<S>('POST', '/checkout/api/address', body),
    editAddress: () => call<S>('POST', '/checkout/api/address/edit', {}),
    pincode: (pin: string) => call<{ city: string; state: string }>('GET', `/checkout/api/pincode/${pin}`),
    upsell: (change: { variantId?: string; lineId?: string }) => call<S>('POST', '/checkout/api/upsell', change),
    coupon: (change: { add?: string; remove?: string }) => call<S>('POST', '/checkout/api/coupon', change),
    pay: (method: string, expectedTotal: number) => call<S & { pay: PayStart | null }>('POST', '/checkout/api/pay', { method, expectedTotal }),
    cancelPayment: () => call<S>('POST', '/checkout/api/pay/cancel', {}),
  };
}
export type Api = ReturnType<typeof api>;
