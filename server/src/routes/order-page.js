const express = require('express');
const prisma = require('../db');

const router = express.Router();

const DEFAULTS = {
  title: 'Thank you for your order!',
  message: 'We have received your order and will send updates to your phone.',
  failedTitle: 'Payment was not completed',
  failedMessage: 'No money has been taken. You can try placing the order again.',
  showOrderSummary: true,
  supportEmail: '',
  supportPhone: '',
  continueUrl: '',
  continueText: 'Continue shopping'
};

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isSafeUrl(url) {
  // Rendered into href — only allow same-site paths or explicit http(s) origins,
  // never javascript: or data: which would execute in the shopper's browser.
  if (!url) return false;
  if (url.startsWith('/')) return true;
  return /^https?:\/\//i.test(url);
}

function page({ ok, cfg, colors, order, storeName }) {
  const primary = colors.primary || '#18181B';
  const accent = colors.accent || '#0F9D58';
  const bg = colors.background || '#ffffff';
  const text = colors.text || '#18181B';

  const title = ok ? (cfg.title || DEFAULTS.title) : (cfg.failedTitle || DEFAULTS.failedTitle);
  const message = ok ? (cfg.message || DEFAULTS.message) : (cfg.failedMessage || DEFAULTS.failedMessage);

  const items = Array.isArray(order.items) ? order.items : [];
  const showSummary = cfg.showOrderSummary !== false;

  const rows = items.map(it => `
      <tr>
        <td>
          <div class="name">${esc(it.title || it.product_title || 'Item')}</div>
          <div class="qty">Qty ${esc(it.quantity || 1)}</div>
        </td>
        <td class="amt">${money((Number(it.price) || 0) * (Number(it.quantity) || 1))}</td>
      </tr>`).join('');

  const support = [];
  if (cfg.supportEmail) support.push(`<a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>`);
  if (cfg.supportPhone) support.push(`<a href="tel:${esc(cfg.supportPhone)}">${esc(cfg.supportPhone)}</a>`);

  const continueUrl = isSafeUrl(cfg.continueUrl) ? cfg.continueUrl : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;padding:32px 20px;background:#FAFAFA;color:${esc(text)};
    font:15px/1.5 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    -webkit-font-smoothing:antialiased}
  .card{max-width:520px;margin:0 auto;background:${esc(bg)};border:1px solid #E9E9EC;
    border-radius:18px;overflow:hidden}
  .top{padding:36px 28px 28px;text-align:center;border-bottom:1px solid #F4F4F5}
  .badge{display:flex;align-items:center;justify-content:center;width:64px;height:64px;
    margin:0 auto 18px;border-radius:50%;background:${ok ? esc(accent) + '1f' : '#FEF2F2'};
    color:${ok ? esc(accent) : '#DC2626'}}
  h1{margin:0 0 8px;font-size:21px;font-weight:650;letter-spacing:-.02em}
  .msg{margin:0;color:#71717A;font-size:14px}
  .store{margin-top:14px;font-size:12px;color:#A1A1AA}
  .meta{display:flex;gap:10px;padding:16px 28px;background:#FAFAFA;border-bottom:1px solid #F4F4F5;
    font-size:12.5px;color:#52525B;flex-wrap:wrap;justify-content:center}
  .meta b{color:${esc(text)};font-weight:600}
  table{width:100%;border-collapse:collapse}
  .items{padding:8px 28px 4px}
  td{padding:11px 0;border-bottom:1px solid #F4F4F5;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .name{font-size:13.5px;font-weight:500;letter-spacing:-.006em}
  .qty{font-size:12px;color:#A1A1AA;margin-top:2px}
  .amt{text-align:right;font-size:13.5px;font-weight:600;white-space:nowrap;
    font-variant-numeric:tabular-nums;padding-left:16px}
  .totals{padding:14px 28px 22px;font-size:13.5px}
  .row{display:flex;justify-content:space-between;padding:5px 0;color:#71717A}
  .row span:last-child{font-variant-numeric:tabular-nums}
  .row.disc{color:${esc(accent)};font-weight:500}
  .row.total{margin-top:8px;padding-top:12px;border-top:1px solid #E9E9EC;
    color:${esc(text)};font-size:16px;font-weight:700;letter-spacing:-.02em}
  .actions{padding:0 28px 28px}
  .btn{display:flex;align-items:center;justify-content:center;height:50px;border-radius:12px;
    background:${esc(primary)};color:#fff;text-decoration:none;font-weight:600;font-size:14.5px;
    letter-spacing:-.01em}
  .support{margin:18px auto 0;max-width:520px;text-align:center;font-size:12.5px;color:#A1A1AA}
  .support a{color:#71717A}
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div class="badge">
        ${ok
          ? '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
          : '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'}
      </div>
      <h1>${esc(title)}</h1>
      <p class="msg">${esc(message)}</p>
      ${storeName ? `<div class="store">${esc(storeName)}</div>` : ''}
    </div>

    <div class="meta">
      <span>Order <b>#${esc(String(order.id).slice(0, 8).toUpperCase())}</b></span>
      ${order.paymentMethod ? `<span>Paid via <b>${esc(String(order.paymentMethod).toUpperCase())}</b></span>` : ''}
    </div>

    ${showSummary && items.length ? `<div class="items"><table>${rows}</table></div>` : ''}

    ${showSummary ? `
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      ${Number(order.discount) > 0
        ? `<div class="row disc"><span>Discount${order.couponCode ? ' · ' + esc(order.couponCode) : ''}</span><span>−${money(order.discount)}</span></div>`
        : ''}
      <div class="row total"><span>Total</span><span>${money(order.total)}</span></div>
    </div>` : ''}

    ${continueUrl ? `<div class="actions"><a class="btn" href="${esc(continueUrl)}">${esc(cfg.continueText || DEFAULTS.continueText)}</a></div>` : ''}
  </div>

  ${support.length ? `<div class="support">Need help? ${support.join(' · ')}</div>` : ''}
</body>
</html>`;
}

router.get('/:orderId', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { store: { include: { config: true } } }
    });

    if (!order) return res.status(404).send('Order not found');

    const cfg = (order.store.config && order.store.config.postPurchase) || {};
    const colors = (order.store.config && order.store.config.colors) || {};

    const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'cod_confirmed';
    const ok = req.query.status ? req.query.status === 'success' : paid;

    res.set('Cache-Control', 'no-store');
    res.send(page({ ok, cfg, colors, order, storeName: order.store.name }));
  } catch (err) {
    console.error('Order page error:', err);
    res.status(500).send('Something went wrong');
  }
});

module.exports = router;
