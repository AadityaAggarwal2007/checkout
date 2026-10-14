import { formatINR } from '@checkout/core';
import { randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';

/** Small server-rendered pages around the gateway (no framework: they must load instantly). */

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827;background:#F3F4F6;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;padding:28px;text-align:center}
h1{font-size:20px;margin:12px 0 6px}p{margin:6px 0;color:#4B5563}.big{font-size:44px;line-height:1}
.rows{text-align:left;margin:18px 0;border-top:1px solid #E5E7EB}.rows div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #E5E7EB}
.btn{display:block;width:100%;margin-top:14px;padding:13px;border:0;border-radius:10px;background:#111827;color:#fff;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer}
.btn.alt{background:#fff;color:#111827;border:1px solid #D1D5DB}.muted{font-size:13px;color:#6B7280}
.spin{width:36px;height:36px;border:4px solid #E5E7EB;border-top-color:#111827;border-radius:50%;margin:8px auto;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}`;

export function sendPage(
  reply: FastifyReply,
  opts: { title: string; body: string; script?: string; formAction?: string; refreshSeconds?: number },
): FastifyReply {
  const nonce = randomBytes(16).toString('base64');
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src https: data:',
    `script-src 'nonce-${nonce}'`,
    `form-action 'self'${opts.formAction ? ` ${opts.formAction}` : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
  return reply
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .header('content-security-policy', csp)
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        (opts.refreshSeconds ? `<meta http-equiv="refresh" content="${opts.refreshSeconds}">` : '') +
        `<title>${esc(opts.title)}</title><style>${STYLE}</style></head><body><div class="card">${opts.body}</div>` +
        (opts.script ? `<script nonce="${nonce}">${opts.script}</script>` : '') +
        `</body></html>`,
    );
}

/**
 * Where the gateway form may go. Not only the form's own host: PayU's _payment (secure.payu.in) answers with a
 * redirect to its payment page on another host (api.payu.in), and Chrome checks every redirect of a form
 * against form-action. Allowing only the first host left shoppers on "Opening secure payment…" for ever.
 */
export function gatewayFormSources(url: string): string {
  const host = new URL(url).hostname;
  const labels = host.split('.');
  // payu.in, payglocal.in: the last two labels (.co.in style names keep three).
  const keep = labels.length > 2 && ['co', 'net', 'org', 'gov'].includes(labels[labels.length - 2]!) ? 3 : 2;
  const base = labels.slice(-keep).join('.');
  return `https://${host} https://${base} https://*.${base}`;
}

/** Auto-submitting form to the gateway (PayU takes a POST); the button is there if scripts are off. */
export function gatewayPostPage(reply: FastifyReply, url: string, fields: Record<string, string>): FastifyReply {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  return sendPage(reply, {
    title: 'Opening payment…',
    formAction: gatewayFormSources(url),
    body: `<div class="spin"></div><h1>Opening secure payment…</h1><form id="f" method="post" action="${esc(url)}">${inputs}<button class="btn" type="submit">Continue to payment</button></form>`,
    script: `document.getElementById('f').submit()`,
  });
}

export function rupee(paise: number): string {
  return formatINR(paise);
}

/** Tell the checkout that opened this tab (desktop), then close the tab. */
export function notifyOpenerScript(checkoutOrigin: string, type: 'ck:paid' | 'ck:failed' | 'ck:pending', storeUrl: string): string {
  return `try{if(window.opener){window.opener.postMessage({type:${JSON.stringify(type)}},${JSON.stringify(checkoutOrigin)});${
    type === 'ck:pending' ? '' : 'setTimeout(function(){window.close()},1500);'
  }}}catch(e){}void ${JSON.stringify(storeUrl)};`;
}
