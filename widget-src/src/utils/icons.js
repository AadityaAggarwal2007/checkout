// Inline SVG icon set — stroke-based, 24x24 grid, inherits currentColor.
function icon(paths, size, strokeWidth) {
  return '<svg class="sd-icon" width="' + (size || 20) + '" height="' + (size || 20) +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (strokeWidth || 1.75) +
    '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths + '</svg>';
}

var PATHS = {
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".75" fill="currentColor" stroke="none"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  star: '<path d="m12 2.5 2.7 5.47 6.04.88-4.37 4.26 1.03 6.01L12 16.27l-5.4 2.85 1.03-6.01L3.26 8.85l6.04-.88z"/>',
  sparkles: '<path d="M12 2.5 13.6 8 19 9.6 13.6 11.2 12 16.7l-1.6-5.5L5 9.6 10.4 8z"/><path d="M18.5 15.5 19.2 18l2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4.5M12 16h.01"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/><path d="M8 13h8M8 17h5"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2"/><path d="M21 12H16a2 2 0 0 0 0 4h5a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  bank: '<path d="M3 21h18"/><path d="M5 21V10M9.5 21V10M14.5 21V10M19 21V10"/><path d="M12 2 3 7.5h18z"/>'
};

function get(name, size, strokeWidth) {
  return icon(PATHS[name] || PATHS.star, size, strokeWidth);
}

// Payment brand marks — recognizable, brand-coloured, sized for a 40x26 card.
var BRANDS = {
  visa: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" font-style="italic" letter-spacing=".3" fill="#1434CB">VISA</text></svg>',
  mastercard: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><circle cx="16" cy="13" r="7.5" fill="#EB001B"/><circle cx="24" cy="13" r="7.5" fill="#F79E1B"/><path d="M20 7.2a7.49 7.49 0 0 0 0 11.6 7.49 7.49 0 0 0 0-11.6z" fill="#FF5F00"/></svg>',
  amex: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><rect x="2" y="4" width="36" height="18" rx="2.5" fill="#006FCF"/><text x="20" y="16" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="700" fill="#fff" letter-spacing=".4">AMEX</text></svg>',
  rupay: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" font-style="italic"><tspan fill="#097DC6">Ru</tspan><tspan fill="#0A8A3F">Pay</tspan></text></svg>',
  upi: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><path d="M27.5 5.5 32 13l-4.5 7.5-1.9-1.1L29.6 13l-4-6.4z" fill="#0A8A3F"/><path d="M31 5.5 35.5 13 31 20.5l-1.9-1.1L33.1 13l-4-6.4z" fill="#ED752E"/><text x="14" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="700" fill="#3B3B3B">UPI</text></svg>',
  google_pay: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="600"><tspan fill="#4285F4">G</tspan><tspan fill="#EA4335">P</tspan><tspan fill="#5F6368">ay</tspan></text></svg>',
  phonepe: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><circle cx="20" cy="13" r="9" fill="#5F259F"/><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="700" fill="#fff">Pe</text></svg>',
  paytm: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="700"><tspan fill="#00BAF2">Pay</tspan><tspan fill="#012970">tm</tspan></text></svg>',
  amazon_pay: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="16" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7.5" font-weight="700" fill="#232F3E">amazon</text><path d="M13 19q7 3 14 0" stroke="#FF9900" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  apple_pay: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="10" font-weight="600" fill="#000">&#63743;Pay</text></svg>',
  razorpay: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><path d="M12 6h4l-2.6 14H9.4z" fill="#3395FF"/><path d="M17 6h4l-3.2 14h-4z" fill="#072654"/></svg>',
  sabpaisa: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8.5" font-weight="700" fill="#1B4DB1">SabPaisa</text></svg>',
  payu: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" fill="#A4C639">PayU</text></svg>',
  cashfree: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="700" fill="#6933FF">cashfree</text></svg>',
  ccavenue: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7.5" font-weight="700" fill="#E4002B">CCAvenue</text></svg>',
  easebuzz: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7.5" font-weight="700" fill="#0B63F6">easebuzz</text></svg>',
  instamojo: '<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true"><text x="20" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7.5" font-weight="700" fill="#1B7FBD">instamojo</text></svg>',
  netbanking: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#52525B" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PATHS.bank + '</svg>',
  cod: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#52525B" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PATHS.banknote + '</svg>'
};

function brand(name) {
  return BRANDS[name] || null;
}

module.exports = { get: get, brand: brand, icon: icon };
