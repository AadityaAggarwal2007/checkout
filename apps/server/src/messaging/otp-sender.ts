import type { Env } from '../env.js';

/** Sends a one-time code to a phone. The code itself is never logged in production. */
export interface OtpSender {
  readonly channel: 'whatsapp' | 'dev';
  send(phoneE164: string, code: string): Promise<void>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Meta WhatsApp Cloud API, "authentication" template: body {{1}} = the code, plus the
 * copy-code (URL) button that Meta requires on authentication templates.
 */
export class WhatsAppOtpSender implements OtpSender {
  readonly channel = 'whatsapp' as const;

  constructor(
    private readonly cfg: { token: string; phoneNumberId: string; template: string; lang: string; apiVersion: string },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(phoneE164: string, code: string): Promise<void> {
    const res = await this.fetchImpl(`https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneE164.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: this.cfg.template,
          language: { code: this.cfg.lang },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Meta's error text never contains the code; keep it short for the log.
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
    }
  }
}

/** Local development and tests: keeps the last code per phone in memory and prints it. */
export class DevOtpSender implements OtpSender {
  readonly channel = 'dev' as const;
  readonly outbox = new Map<string, string>();

  constructor(private readonly print = true) {}

  async send(phoneE164: string, code: string): Promise<void> {
    this.outbox.set(phoneE164, code);
    if (this.print) console.log(`[dev-otp] ${phoneE164} code ${code}`);
  }
}

export function otpSenderFrom(env: Env): OtpSender {
  if (env.OTP_SENDER === 'whatsapp') {
    return new WhatsAppOtpSender({
      token: env.WHATSAPP_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      template: env.WHATSAPP_OTP_TEMPLATE,
      lang: env.WHATSAPP_TEMPLATE_LANG,
      apiVersion: env.WHATSAPP_API_VERSION,
    });
  }
  return new DevOtpSender(env.NODE_ENV !== 'test');
}
