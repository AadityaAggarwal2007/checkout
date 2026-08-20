function toRgb(hex) {
  var h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function alpha(hex, a) {
  var c = toRgb(hex);
  return c ? 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')' : hex;
}

// amt > 0 lightens toward white, amt < 0 darkens toward black.
function shade(hex, amt) {
  var c = toRgb(hex);
  if (!c) return hex;
  var target = amt < 0 ? 0 : 255;
  var p = Math.abs(amt);
  return 'rgb(' + c.map(function (v) { return Math.round((target - v) * p + v); }).join(',') + ')';
}

function getStyles(colors) {
  var primary = (colors && colors.primary) || '#6C5CE7';
  var text = (colors && colors.text) || '#18181B';
  var bg = (colors && colors.background) || '#ffffff';
  var accent = (colors && colors.accent) || '#0F9D58';

  var primaryDark = shade(primary, -0.14);
  var primaryLight = shade(primary, 0.18);

  // Neutral ramp — slightly cool, reads as considered rather than default-gray.
  var n50 = '#FAFAFA', n100 = '#F4F4F5', n200 = '#E9E9EC', n300 = '#D4D4D8',
      n400 = '#A1A1AA', n500 = '#71717A', n600 = '#52525B';

  return `
.sd-drawer,.sd-drawer *,.sd-drawer *::before,.sd-drawer *::after,
.sd-cart-toggle,.sd-cart-toggle *{box-sizing:border-box}
.sd-drawer input,.sd-drawer select,.sd-drawer textarea{font-family:inherit;font-size:inherit;color:inherit;margin:0}
/* Buttons deliberately omit color:inherit — the element-qualified selector would
   outrank every single-class rule below and blank out their own text colors. */
.sd-drawer button{font-family:inherit;font-size:inherit;margin:0}
.sd-drawer h3,.sd-drawer h4,.sd-drawer p{margin:0;padding:0}

.sd-overlay{position:fixed;inset:0;background:rgba(9,9,11,.44);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:2147483000;opacity:0;transition:opacity .34s ease;pointer-events:none}
.sd-overlay.sd-open{opacity:1;pointer-events:auto}

.sd-drawer{position:fixed;top:0;right:0;width:428px;max-width:100%;height:100%;height:100dvh;background:${n50};z-index:2147483001;
  transform:translate3d(100%,0,0);transition:transform .46s cubic-bezier(.32,.72,0,1);
  display:flex;flex-direction:column;overflow:hidden;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  font-size:14px;line-height:1.45;color:${text};text-align:left;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  box-shadow:-32px 0 64px -16px rgba(9,9,11,.22),-2px 0 8px rgba(9,9,11,.06)}
.sd-drawer.sd-open{transform:translate3d(0,0,0)}
.sd-icon{display:block;flex-shrink:0}

/* ---------- Header ---------- */
.sd-header{display:flex;align-items:center;gap:10px;padding:16px 18px;background:${bg};border-bottom:1px solid ${n200};flex-shrink:0}
.sd-header-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:${alpha(primary, 0.1)};color:${primary};flex-shrink:0}
.sd-header h3{font-size:15px;font-weight:600;letter-spacing:-.011em;flex:1;display:flex;align-items:center;gap:8px}
.sd-header-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:${n100};color:${n600};font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:0}
.sd-close{display:flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:none;border-radius:9px;background:transparent;color:${n500};cursor:pointer;transition:background .16s,color .16s}
.sd-close:hover{background:${n100};color:${text}}

/* ---------- Scroll body ---------- */
.sd-body{flex:1;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:${n300} transparent}
.sd-body::-webkit-scrollbar{width:6px}
.sd-body::-webkit-scrollbar-thumb{background:${n300};border-radius:999px}
.sd-body::-webkit-scrollbar-thumb:hover{background:${n400}}
.sd-body::-webkit-scrollbar-track{background:transparent}

/* ---------- Announcement ---------- */
.sd-announcement{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 18px;
  background:linear-gradient(100deg,${primary},${primaryDark});color:#fff;
  font-size:12.5px;font-weight:500;letter-spacing:-.003em;text-align:center;flex-shrink:0}
.sd-announcement-text{transition:opacity .28s ease}
.sd-announcement .sd-icon{opacity:.9}

/* ---------- Card primitive ---------- */
.sd-card{background:${bg};border:1px solid ${n200};border-radius:14px}
.sd-section-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;letter-spacing:-.008em;margin-bottom:10px;color:${text}}
.sd-section-title .sd-icon{color:${n500}}

/* ---------- Reward bar ---------- */
.sd-reward-bar{margin:12px 14px 0;padding:15px 16px 13px;background:${bg};border:1px solid ${n200};border-radius:14px}
.sd-reward-text{font-size:13px;color:${n600};letter-spacing:-.004em;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:6px}
.sd-reward-text b{color:${text};font-weight:600}
.sd-reward-text .sd-icon{color:${primary};flex-shrink:0}
.sd-reward-track-wrap{position:relative;padding:0 16px;margin-bottom:28px}
.sd-reward-track{position:relative;height:5px;background:${n200};border-radius:999px}
.sd-reward-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,${primaryLight},${primary});
  transition:width .62s cubic-bezier(.32,.72,0,1);position:relative}
.sd-reward-fill::after{content:'';position:absolute;inset:0;border-radius:999px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);
  animation:sd-shimmer 2.2s ease-in-out infinite}
@keyframes sd-shimmer{0%{transform:translateX(-100%)}60%,100%{transform:translateX(100%)}}
.sd-milestone{position:absolute;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center}
.sd-milestone-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;
  background:${bg};border:2.5px solid ${n200};color:${n400};transition:all .3s cubic-bezier(.32,.72,0,1);z-index:1}
.sd-milestone.sd-reached .sd-milestone-icon{background:${primary};border-color:${primary};color:#fff;box-shadow:0 0 0 3px ${alpha(primary, 0.15)}}
.sd-milestone.sd-next .sd-milestone-icon{border-color:${primary};color:${primary};background:${alpha(primary, 0.08)};
  box-shadow:0 0 0 3px ${alpha(primary, 0.1)};transform:scale(1.13)}
.sd-milestone-label{position:absolute;top:calc(100% + 6px);white-space:nowrap;font-size:10px;line-height:1.2;
  color:${n500};text-align:center;letter-spacing:-.002em;max-width:68px;overflow:hidden;text-overflow:ellipsis}
.sd-milestone.sd-reached .sd-milestone-label{color:${text};font-weight:600}
.sd-milestone.sd-next .sd-milestone-label{color:${primary};font-weight:600}

/* ---------- Product rows ---------- */
.sd-items{margin:12px 14px 0;background:${bg};border:1px solid ${n200};border-radius:14px;overflow:hidden}
.sd-product{display:flex;gap:12px;padding:14px;border-bottom:1px solid ${n100}}
.sd-product:last-child{border-bottom:none}
.sd-product-img{width:66px;height:66px;border-radius:10px;object-fit:cover;background:${n100};border:1px solid ${alpha('#000000', 0.05)};flex-shrink:0}
.sd-product-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.sd-product-title{font-size:13.5px;font-weight:500;letter-spacing:-.008em;line-height:1.35;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sd-product-variant{font-size:11.5px;color:${n500}}
.sd-product-price{display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap}
.sd-price-current{font-size:14px;font-weight:600;letter-spacing:-.014em;font-variant-numeric:tabular-nums}
.sd-price-compare{font-size:11.5px;color:${n400};text-decoration:line-through;font-variant-numeric:tabular-nums}
.sd-price-discount{font-size:10.5px;font-weight:600;color:${accent};background:${alpha(accent, 0.1)};padding:2px 6px;border-radius:5px;letter-spacing:-.002em}
.sd-product-actions{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:8px;flex-shrink:0}
.sd-delete{display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:7px;background:transparent;color:${n400};cursor:pointer;transition:all .16s}
.sd-delete:hover{background:#FEF2F2;color:#DC2626}
.sd-qty{display:flex;align-items:center;border:1px solid ${n200};border-radius:9px;background:${bg};overflow:hidden;height:32px}
.sd-qty button{display:flex;align-items:center;justify-content:center;width:30px;height:100%;padding:0;border:none;background:transparent;color:${n600};cursor:pointer;transition:background .14s,color .14s}
.sd-qty button:hover{background:${n100};color:${text}}
.sd-qty span{min-width:26px;text-align:center;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}

/* ---------- Coupons ---------- */
.sd-coupons-section{margin:12px 14px 0}
.sd-coupons{display:flex;align-items:center;gap:11px;padding:13px 14px;background:${bg};border:1px solid ${n200};border-radius:14px;cursor:pointer;transition:border-color .18s,box-shadow .18s;user-select:none}
.sd-coupons:hover{border-color:${n300}}
.sd-coupons.sd-expanded{border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-color:transparent}
.sd-coupons-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:${alpha(primary, 0.1)};color:${primary};flex-shrink:0}
.sd-coupons-label{flex:1;font-size:13px;font-weight:600;letter-spacing:-.008em}
.sd-coupons-sub{display:block;font-size:11.5px;font-weight:400;color:${n500};margin-top:1px;letter-spacing:0}
.sd-coupon-arrow{color:${n400};transition:transform .24s cubic-bezier(.32,.72,0,1);flex-shrink:0}
.sd-coupons.sd-expanded .sd-coupon-arrow{transform:rotate(90deg)}
.sd-coupon-panel{padding:14px;background:${bg};border:1px solid ${n200};border-top:none;border-radius:0 0 14px 14px;animation:sd-slide-down .26s cubic-bezier(.32,.72,0,1)}
@keyframes sd-slide-down{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.sd-coupon-input-row{display:flex;gap:8px}
.sd-coupon-input{flex:1;min-width:0;height:42px;padding:0 13px;border:1px solid ${n200};border-radius:10px;background:${bg};
  font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;transition:border-color .16s,box-shadow .16s}
.sd-coupon-input::placeholder{font-weight:400;letter-spacing:.01em;text-transform:none;color:${n400}}
.sd-coupon-input:focus{outline:none;border-color:${primary};box-shadow:0 0 0 3px ${alpha(primary, 0.13)}}
.sd-coupon-input:disabled{background:${n50};color:${n500}}
.sd-coupon-apply{height:42px;padding:0 17px;border:none;border-radius:10px;background:${primary};color:#fff;
  font-size:13px;font-weight:600;letter-spacing:-.006em;cursor:pointer;white-space:nowrap;transition:background .16s,opacity .16s}
.sd-coupon-apply:hover{background:${primaryDark}}
.sd-coupon-apply:disabled{opacity:.55;cursor:default}
.sd-coupon-apply.sd-ghost{background:transparent;color:${n600};border:1px solid ${n200}}
.sd-coupon-apply.sd-ghost:hover{background:${n100};color:${text}}
.sd-coupon-msg{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;margin-top:9px;letter-spacing:-.004em}
.sd-coupon-msg:empty{display:none}
.sd-coupon-success{color:${accent}}
.sd-coupon-error{color:#DC2626}
.sd-coupon-list{margin-top:14px;padding-top:14px;border-top:1px solid ${n100}}
.sd-coupon-list-title{font-size:10.5px;font-weight:600;color:${n400};text-transform:uppercase;letter-spacing:.07em;margin-bottom:9px}
.sd-coupon-chip{position:relative;display:flex;align-items:center;gap:10px;padding:11px 13px;margin-bottom:7px;
  border:1.5px dashed ${n300};border-radius:10px;background:${n50};transition:all .18s;overflow:hidden}
.sd-coupon-chip::before,.sd-coupon-chip::after{content:'';position:absolute;top:50%;width:11px;height:11px;
  border-radius:50%;background:${bg};transform:translateY(-50%)}
.sd-coupon-chip::before{left:-6px}
.sd-coupon-chip::after{right:-6px}
.sd-coupon-chip:last-child{margin-bottom:0}
.sd-coupon-chip.sd-coupon-active{border-color:${accent};border-style:solid;background:${alpha(accent, 0.06)}}
.sd-coupon-code{font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:12.5px;font-weight:700;letter-spacing:.05em;flex-shrink:0}
.sd-coupon-desc{flex:1;min-width:0;font-size:11.5px;color:${n500};letter-spacing:-.002em}
.sd-coupon-tap{display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid ${alpha(primary, 0.32)};border-radius:7px;
  background:transparent;color:${primary};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .16s;flex-shrink:0}
.sd-coupon-tap:hover{background:${primary};border-color:${primary};color:#fff}
.sd-coupon-tap:disabled{background:transparent;border-color:transparent;color:${accent};cursor:default}
.sd-coupons-saved{display:flex;align-items:center;gap:6px;font-size:12px;color:${accent};font-weight:500;margin-top:9px}

/* ---------- Upsells ---------- */
.sd-upsells{margin:16px 0 0;padding:0 14px}
.sd-upsells-scroll{display:flex;gap:10px;overflow-x:auto;padding:2px 14px 10px;margin:0 -14px;
  -webkit-overflow-scrolling:touch;scrollbar-width:none}
.sd-upsells-scroll::-webkit-scrollbar{display:none}
.sd-upsell-card{width:134px;flex-shrink:0;background:${bg};border:1px solid ${n200};border-radius:12px;overflow:hidden;
  transition:transform .2s cubic-bezier(.32,.72,0,1),box-shadow .2s,border-color .2s}
.sd-upsell-card:hover{transform:translateY(-2px);border-color:${n300};box-shadow:0 6px 16px -6px rgba(9,9,11,.14)}
.sd-upsell-img{width:100%;height:104px;object-fit:cover;background:${n100};display:block}
.sd-upsell-info{padding:9px 10px 10px}
.sd-upsell-name{font-size:12px;font-weight:500;letter-spacing:-.006em;line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:31px}
.sd-upsell-price{font-size:12.5px;font-weight:600;letter-spacing:-.012em;font-variant-numeric:tabular-nums;margin-top:3px}
.sd-upsell-add{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;height:30px;margin-top:8px;
  border:1px solid ${n200};border-radius:8px;background:${bg};color:${text};font-size:11.5px;font-weight:600;cursor:pointer;transition:all .16s}
.sd-upsell-add:hover{background:${primary};border-color:${primary};color:#fff}

/* ---------- Free gifts ---------- */
.sd-gifts{margin:16px 14px 0}
.sd-gift-card{position:relative;display:flex;align-items:center;gap:11px;padding:12px 13px;margin-bottom:8px;
  border:1.5px dashed ${n300};border-radius:11px;background:${bg};transition:all .22s;overflow:hidden}
.sd-gift-card:last-child{margin-bottom:0}
.sd-gift-card::before,.sd-gift-card::after{content:'';position:absolute;top:50%;width:11px;height:11px;border-radius:50%;background:${n50};transform:translateY(-50%)}
.sd-gift-card::before{left:-6px}
.sd-gift-card::after{right:-6px}
.sd-gift-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;
  background:${n100};color:${n400};flex-shrink:0;transition:all .22s}
.sd-gift-card.sd-unlocked{border-style:solid;border-color:${accent};background:${alpha(accent, 0.05)}}
.sd-gift-card.sd-unlocked .sd-gift-icon{background:${alpha(accent, 0.14)};color:${accent}}
.sd-gift-info{flex:1;min-width:0}
.sd-gift-label{font-size:12.5px;font-weight:600;letter-spacing:-.008em}
.sd-gift-card.sd-locked .sd-gift-label{color:${n600}}
.sd-gift-hint{font-size:11px;color:${n500};margin-top:1px}
.sd-gift-card.sd-unlocked .sd-gift-hint{color:${accent};font-weight:500}

/* ---------- Notes ---------- */
.sd-notes{margin:16px 14px 0;padding:14px;background:${bg};border:1px solid ${n200};border-radius:14px}
.sd-notes textarea{width:100%;min-height:70px;padding:11px 12px;border:1px solid ${n200};border-radius:10px;background:${bg};
  font-size:13px;line-height:1.5;resize:vertical;transition:border-color .16s,box-shadow .16s}
.sd-notes textarea::placeholder{color:${n400}}
.sd-notes textarea:focus{outline:none;border-color:${primary};box-shadow:0 0 0 3px ${alpha(primary, 0.13)}}
.sd-notes-count{text-align:right;font-size:11px;color:${n400};margin-top:6px;font-variant-numeric:tabular-nums}

/* ---------- Trust badges ---------- */
.sd-trust{margin:16px 14px 0;padding:14px;background:${bg};border:1px solid ${n200};border-radius:14px}
.sd-trust-head{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11.5px;font-weight:500;color:${n500};margin-bottom:11px}
.sd-trust-head .sd-icon{color:${accent}}
.sd-badges{display:flex;flex-wrap:wrap;gap:7px;justify-content:center}
.sd-badge{display:flex;align-items:center;justify-content:center;width:44px;height:29px;border:1px solid ${n200};
  border-radius:7px;background:${bg};transition:border-color .16s}
.sd-badge:hover{border-color:${n300}}
.sd-badge svg{display:block}

/* ---------- Confirmation ---------- */
.sd-confirm{display:flex;align-items:flex-start;gap:10px;margin:16px 14px 0;padding:13px 14px;
  background:${bg};border:1px solid ${n200};border-radius:14px;cursor:pointer;user-select:none}
.sd-checkbox{position:relative;display:flex;align-items:center;justify-content:center;width:19px;height:19px;
  border:1.5px solid ${n300};border-radius:6px;background:${bg};flex-shrink:0;margin-top:1px;transition:all .16s;color:transparent}
.sd-checkbox.sd-checked{background:${primary};border-color:${primary};color:#fff}
.sd-confirm-label{font-size:12.5px;line-height:1.5;color:${n600};letter-spacing:-.004em}

/* ---------- Empty state ---------- */
.sd-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:64px 32px}
.sd-empty-icon{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;
  background:${alpha(primary, 0.09)};color:${primary};margin-bottom:18px}
.sd-empty h4{font-size:16px;font-weight:600;letter-spacing:-.016em;margin-bottom:6px}
.sd-empty p{font-size:13px;color:${n500};line-height:1.5;margin-bottom:22px;max-width:250px}
.sd-empty a{display:inline-flex;align-items:center;gap:7px;height:44px;padding:0 22px;border-radius:11px;
  background:${primary};color:#fff;text-decoration:none;font-size:13.5px;font-weight:600;letter-spacing:-.008em;
  box-shadow:0 4px 12px ${alpha(primary, 0.26)};transition:transform .16s,box-shadow .16s,background .16s}
.sd-empty a:hover{background:${primaryDark};transform:translateY(-1px);box-shadow:0 6px 18px ${alpha(primary, 0.32)}}

/* ---------- Footer ---------- */
.sd-footer{flex-shrink:0;padding:14px 18px calc(16px + env(safe-area-inset-bottom,0px));background:${bg};border-top:1px solid ${n200};
  box-shadow:0 -8px 24px -16px rgba(9,9,11,.16)}
.sd-footer:empty{display:none}
.sd-footer-subtotal,.sd-footer-discount{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-bottom:6px}
.sd-footer-subtotal{color:${n500}}
.sd-footer-subtotal span:last-child{font-variant-numeric:tabular-nums}
.sd-footer-discount{color:${accent};font-weight:500}
.sd-footer-discount span:first-child{display:flex;align-items:center;gap:5px;min-width:0}
.sd-footer-discount span:last-child{font-variant-numeric:tabular-nums;flex-shrink:0}
.sd-footer-total{display:flex;justify-content:space-between;align-items:baseline;padding-top:10px;margin-bottom:13px;border-top:1px solid ${n100}}
.sd-footer-total span:first-child{font-size:13.5px;font-weight:500;color:${n600};letter-spacing:-.006em}
.sd-footer-total span:last-child{font-size:18px;font-weight:700;letter-spacing:-.022em;font-variant-numeric:tabular-nums;color:${text}}
.sd-checkout-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;border:none;border-radius:13px;
  background:linear-gradient(180deg,${primary},${primaryDark});color:#fff;font-size:15px;font-weight:600;letter-spacing:-.012em;cursor:pointer;
  box-shadow:0 4px 14px ${alpha(primary, 0.3)},inset 0 1px 0 rgba(255,255,255,.14);
  transition:transform .16s cubic-bezier(.32,.72,0,1),box-shadow .16s,opacity .16s}
.sd-checkout-btn:hover{transform:translateY(-1px);box-shadow:0 8px 22px ${alpha(primary, 0.36)},inset 0 1px 0 rgba(255,255,255,.14)}
.sd-checkout-btn:active{transform:translateY(0)}
.sd-checkout-btn:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none}
.sd-footer-note{display:flex;align-items:center;justify-content:center;gap:5px;font-size:11px;color:${n400};margin-top:10px}

/* ---------- Checkout form ---------- */
.sd-checkout-form{padding:18px}
.sd-back-btn{display:flex;align-items:center;gap:6px;padding:6px 10px 6px 7px;margin:0 0 16px -7px;border:none;border-radius:8px;
  background:transparent;color:${n600};font-size:12.5px;font-weight:500;cursor:pointer;transition:background .16s,color .16s}
.sd-back-btn:hover{background:${n100};color:${text}}
.sd-steps{display:flex;align-items:center;gap:0;margin-bottom:20px}
.sd-step{display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0}
.sd-step-dot{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;
  border:1.5px solid ${n200};background:${bg};color:${n400};font-size:11.5px;font-weight:600;transition:all .26s cubic-bezier(.32,.72,0,1)}
.sd-step.sd-active .sd-step-dot{border-color:${primary};background:${primary};color:#fff;box-shadow:0 0 0 4px ${alpha(primary, 0.13)}}
.sd-step.sd-done .sd-step-dot{border-color:${accent};background:${accent};color:#fff}
.sd-step-label{font-size:10.5px;color:${n400};letter-spacing:-.002em;white-space:nowrap}
.sd-step.sd-active .sd-step-label{color:${text};font-weight:600}
.sd-step.sd-done .sd-step-label{color:${n600}}
.sd-step-line{flex:1;height:1.5px;background:${n200};margin:0 6px;position:relative;top:-9px;border-radius:999px;transition:background .3s}
.sd-step-line.sd-done{background:${accent}}
.sd-checkout-form h4{font-size:16px;font-weight:600;letter-spacing:-.017em;margin-bottom:4px}
.sd-form-sub{font-size:12.5px;color:${n500};margin-bottom:18px}
.sd-form-group{margin-bottom:13px}
.sd-form-group label{display:block;font-size:12px;font-weight:500;color:${n600};margin-bottom:6px;letter-spacing:-.004em}
.sd-form-group input,.sd-form-group select{width:100%;height:44px;padding:0 13px;border:1px solid ${n200};border-radius:10px;
  background:${bg};font-size:14px;letter-spacing:-.006em;transition:border-color .16s,box-shadow .16s;-webkit-appearance:none;appearance:none}
.sd-form-group textarea:focus,.sd-form-group input:focus,.sd-form-group select:focus{outline:none;border-color:${primary};box-shadow:0 0 0 3px ${alpha(primary, 0.13)}}
.sd-form-group input::placeholder{color:${n400}}
.sd-form-group select{background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 12px center;background-size:16px;padding-right:36px;cursor:pointer}
.sd-form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sd-phone-group{display:flex;gap:8px}
.sd-phone-group select{width:82px;flex-shrink:0;padding-right:26px;background-position:right 8px center}
.sd-payment-options{display:flex;flex-direction:column;gap:9px}
.sd-payment-option{display:flex;align-items:center;gap:11px;padding:13px 14px;border:1.5px solid ${n200};border-radius:12px;
  background:${bg};cursor:pointer;transition:all .18s;user-select:none}
.sd-payment-option:hover{border-color:${n300}}
.sd-payment-option.sd-selected{border-color:${primary};background:${alpha(primary, 0.045)};box-shadow:0 0 0 3px ${alpha(primary, 0.1)}}
.sd-payment-radio{position:relative;width:19px;height:19px;border:1.5px solid ${n300};border-radius:50%;flex-shrink:0;transition:border-color .18s}
.sd-payment-radio.sd-selected{border-color:${primary};border-width:5.5px}
.sd-payment-body{flex:1;min-width:0}
.sd-payment-name{font-size:13.5px;font-weight:600;letter-spacing:-.01em}
.sd-payment-desc{font-size:11.5px;color:${n500};margin-top:1px}
.sd-payment-amount{font-size:14px;font-weight:600;letter-spacing:-.014em;font-variant-numeric:tabular-nums;flex-shrink:0}
.sd-payment-tag{display:inline-block;font-size:10px;font-weight:600;color:${accent};background:${alpha(accent, 0.11)};padding:2px 6px;border-radius:5px;margin-left:6px;vertical-align:middle}
.sd-success{display:flex;flex-direction:column;align-items:center;text-align:center;padding:56px 28px}
.sd-success-icon{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;
  background:${alpha(accent, 0.12)};color:${accent};margin-bottom:18px;animation:sd-pop .42s cubic-bezier(.32,1.6,.5,1)}
@keyframes sd-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
.sd-success h4{font-size:17px;font-weight:600;letter-spacing:-.018em;margin-bottom:6px}
.sd-success p{font-size:13px;color:${n500};line-height:1.5}

/* ---------- Floating toggle ---------- */
.sd-cart-toggle{position:fixed;bottom:22px;right:22px;display:flex;align-items:center;justify-content:center;
  width:54px;height:54px;padding:0;border:none;border-radius:50%;cursor:pointer;z-index:2147482999;
  background:linear-gradient(180deg,${primary},${primaryDark});color:#fff;
  box-shadow:0 6px 20px ${alpha(primary, 0.36)},0 2px 6px rgba(9,9,11,.14),inset 0 1px 0 rgba(255,255,255,.16);
  transition:transform .2s cubic-bezier(.32,.72,0,1),box-shadow .2s}
.sd-cart-toggle:hover{transform:scale(1.06);box-shadow:0 10px 28px ${alpha(primary, 0.42)},0 2px 6px rgba(9,9,11,.14),inset 0 1px 0 rgba(255,255,255,.16)}
.sd-cart-toggle:active{transform:scale(.97)}
.sd-cart-badge{position:absolute;top:-2px;right:-2px;display:flex;align-items:center;justify-content:center;
  min-width:21px;height:21px;padding:0 5px;border-radius:999px;background:#EF4444;color:#fff;
  font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;border:2px solid ${bg};
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  animation:sd-pop .34s cubic-bezier(.32,1.6,.5,1)}

@media(max-width:520px){
  .sd-drawer{width:100%}
  .sd-cart-toggle{bottom:18px;right:18px;width:50px;height:50px}
}
@media(prefers-reduced-motion:reduce){
  .sd-drawer,.sd-overlay,.sd-reward-fill,.sd-cart-toggle,.sd-checkout-btn,.sd-upsell-card{transition-duration:.01ms}
  .sd-reward-fill::after,.sd-success-icon,.sd-cart-badge{animation:none}
}
`;
}

module.exports = { getStyles: getStyles };
