# Security review — 2026-10-14 (Phase 6)

A read-only review of the server, checkout page, store script and dashboard, then fixes. Re-run before
real shoppers use the checkout, and after any change to payments, OTP or store access.

## Fixed

| What | Risk | Fix |
|---|---|---|
| `trustProxy: true` took the left-most X-Forwarded-For | Anyone could fake their address and get round the OTP / login limits per IP | Only this machine's hops (nginx, the dashboard proxy) are trusted: `apps/server/src/app.ts` |
| A gateway "success" with no amount was accepted | Breaks the "paid only with the amount confirmed" rule (PayGlocal's amount field is not confirmed yet) | It stays pending with a note for a person: `settle()` in `checkout/service.ts` |
| Paying by another method than the one chosen (PayU's `enforce_paymethod` is not in its hash; PayGlocal has no such field) | A "10% off on UPI" offer could be taken while paying by card | The order is placed (the money is in) and flagged in its note: "Paid by CARD, but UPI was chosen" |
| A second device logging in while a payment was open | The paid order could be put on the other shopper's account | No takeover while the session is paying: `customerOf()` |
| Dashboard login `?next=/\evil.com` | Open redirect after login | Only `/` followed by neither `/` nor `\`: `auth-form.tsx` |

## Open (low, decided later)

- Coupon codes can be guessed through `/storefront/price` (5 codes × 120 requests/min per address; "unknown"
  and "not eligible" read differently). Fix when hidden codes matter: one message for both, and a per-store limit.
- Coupon use limits are checked when pricing, recorded when the order is created: several payments open at
  the same time can each pass. Fix: re-check inside the order transaction and flag.
- The checkout page posts `ck:navigate` / `ck:done` with target `*` (the parent is already limited by
  `frame-ancestors`). Fix: post to the store's origin.
- `#ck_done=<order>.<total>` can fire a fake Meta Purchase from a crafted link (ads data only).
- PayGlocal `AUTHORIZED` counts as paid: confirm with PayGlocal UAT whether capture is automatic.

## Checked and fine

UPI inside the checkout (PayU intent, 2026-10-14): the `upi://pay` link is only a way to pay; the order is still
placed only when `settle()` hears success for the exact amount from `verify_payment` server to server. The link is
refused unless it is a `upi://pay` link under 1000 characters naming a payee and our amount; a refusal falls back to the
hosted page. The shopper's IP and user agent go to PayU (its S2S fields) and nowhere else; the salt and hash are never
logged or returned.

Store isolation on every `/api/stores/:storeId/*` route (membership + every id also filtered by store),
server-side prices (catalog re-read, re-priced before payment, frozen draft), upsell offers (variant must be in
the live offer, timer, not while paying), addresses only for the same verified shopper, OTP limits in the
database, settle path (status only from a server-to-server call, one order per session), escaping in server
pages and `h()`, postMessage origin checks, CSRF (JSON only, preflighted DELETE, dashboard-only CORS, httpOnly
SameSite cookie), secrets encrypted and write-only, API keys as peppered hashes.

## Load test

`apps/server/scripts/load-test.ts` (run against the API port, never a live store). 2026-10-14, 4 cores, dev
mode: 50 shoppers for 20 s → about 390 requests/s (65 checkout starts/s), p95 under 320 ms, no errors.
