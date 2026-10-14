import type { DrawerSettings } from '@checkout/shared';

/** All drawer CSS lives inside the Shadow DOM: the theme cannot break it, and it cannot break the theme. */
export function css(colors: DrawerSettings['colors']): string {
  return `
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
.ck{--p:${colors.primary};--pt:${colors.buttonText};--bg:${colors.background};--ok:${colors.accent};--hl:${colors.highlight};
  --t:#18181B;--t2:#52525B;--t3:#71717A;--line:#E9E9EC;--card:#fff;--r:14px;
  font:14px/1.45 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  color:var(--t);-webkit-font-smoothing:antialiased;text-align:left}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer}
input,select,textarea{font:inherit;color:inherit;margin:0}
.ck-i{display:inline-flex;line-height:0;flex-shrink:0}
.ck-overlay{position:fixed;inset:0;background:rgba(9,9,11,.45);opacity:0;pointer-events:none;transition:opacity .3s ease;z-index:2147483000}
.ck-open .ck-overlay{opacity:1;pointer-events:auto}
.ck-panel{position:fixed;top:0;right:0;height:100%;height:100dvh;width:420px;max-width:100%;background:var(--bg);
  display:flex;flex-direction:column;transform:translate3d(100%,0,0);transition:transform .42s cubic-bezier(.32,.72,0,1);
  z-index:2147483001;box-shadow:-24px 0 60px -12px rgba(9,9,11,.25)}
.ck-open .ck-panel{transform:none}
.ck-preview .ck-panel{position:absolute;transform:none;box-shadow:none;width:100%}
@media (prefers-reduced-motion:reduce){.ck-panel,.ck-overlay{transition:none}}

.ck-head{background:#fff;padding:10px 14px 8px;text-align:center}
.ck-head-row{position:relative;display:flex;align-items:center;justify-content:center;min-height:34px}
.ck-head h2{margin:0;font-size:18px;font-weight:500;color:var(--p);letter-spacing:-.01em}
.ck-x{position:absolute;left:-4px;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:var(--p)}
.ck-x:hover{background:#F4F4F5}
.ck-timer{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;color:var(--p);font-size:14px}
.ck-timer b{border:1.5px solid var(--hl);border-radius:8px;padding:2px 6px;font-weight:600;color:var(--t);font-variant-numeric:tabular-nums;background:#fff}
.ck-ann{background:var(--p);color:var(--pt);font-size:14px;font-weight:600;text-align:center;padding:8px 16px;overflow:hidden;white-space:nowrap;position:relative;min-height:36px}
.ck-ann span{display:inline-block;transition:opacity .35s ease,transform .35s ease}
.ck-ann.ck-fade span{opacity:0;transform:translateY(-6px)}
.ck-ann.ck-marquee span{padding-left:100%;animation:ck-marq var(--dur,18s) linear infinite}
@keyframes ck-marq{to{transform:translateX(-100%)}}

.ck-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:0 12px 12px;display:flex;flex-direction:column;gap:12px}
.ck-body>*{flex-shrink:0}
.ck-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px}
.ck-card-h{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;margin-bottom:10px}
.ck-card-h .ck-i{color:var(--t2)}

.ck-reward{margin:0 -12px;padding:12px 16px 8px;background:linear-gradient(100deg,color-mix(in srgb,var(--hl) 6%,#fff) 0%,color-mix(in srgb,var(--hl) 22%,#fff) 55%,color-mix(in srgb,var(--hl) 48%,#fff) 100%)}
.ck-reward-t{text-align:center;font-size:14.5px;color:var(--t);margin-bottom:4px}.ck-reward-t b{font-weight:600}
.ck-track{position:relative;height:4px;background:#D6D3D6;border-radius:4px;margin:40px 26px 46px 30px}
.ck-flag{position:absolute;left:-26px;top:50%;transform:translateY(-62%);font-size:20px;line-height:1}
.ck-fill{position:absolute;left:0;top:0;bottom:0;background:var(--p);border-radius:4px;transition:width .5s ease}
.ck-dot{position:absolute;top:50%;width:0;height:0}
.ck-dot-v{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);font-size:12.5px;color:var(--t2)}
.ck-dot-i{position:absolute;top:50%;left:50%;transform:translate(-50%,-58%);font-size:26px;line-height:1;filter:grayscale(1);opacity:.65;transition:all .3s}
.ck-dot-l{position:absolute;top:18px;left:50%;transform:translateX(-50%);width:78px;text-align:center;font-size:12.5px;line-height:1.25;color:var(--t2)}
.ck-dot.ck-on .ck-dot-i{filter:none;opacity:1}
.ck-dot.ck-on .ck-dot-v,.ck-dot.ck-on .ck-dot-l{color:var(--t);font-weight:600}
.ck-dot:last-child .ck-dot-l{left:auto;right:-20px;transform:none;text-align:right}
.ck-dot:last-child .ck-dot-v{left:auto;right:-14px;transform:none}

.ck-items{display:flex;flex-direction:column;gap:10px;padding:10px;border-radius:var(--r);background:color-mix(in srgb,var(--hl) 5%,#F6F6F8)}
.ck-line{position:relative;display:flex;gap:12px;padding:12px;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ck-gift{border:1.5px solid color-mix(in srgb,var(--hl) 55%,#F5D76E);background:linear-gradient(110deg,#fff 60%,color-mix(in srgb,#F5D76E 18%,#fff))}
.ck-bow{position:absolute;right:10px;bottom:6px;font-size:22px;opacity:.85}
.ck-img{position:relative;width:76px;height:76px;border-radius:12px;background:#F4F4F5 center/cover no-repeat;flex-shrink:0;border:1px solid var(--line);overflow:hidden}
.ck-offb{position:absolute;top:0;right:0;background:#21931B;color:#fff;font-size:10px;font-weight:700;line-height:1.05;text-align:center;padding:3px 4px 6px;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)}
.ck-qbadge{display:none}
.ck-l-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.ck-l-top{display:flex;gap:10px;align-items:flex-start}
.ck-l-name{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;align-items:flex-start}
.ck-l-title{font-size:14.5px;line-height:1.3;color:var(--t);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ck-l-var{font-size:13px;color:var(--t2)}
.ck-sel{appearance:none;-webkit-appearance:none;max-width:100%;border:1px solid #D4D4D8;border-radius:9px;padding:5px 28px 5px 10px;font-size:13px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525B' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") right 10px center no-repeat}
.ck-l-bottom{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.ck-prices{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0}
.ck-was{color:var(--t3);text-decoration:line-through;font-size:13px}
.ck-now{font-size:15px;color:var(--t)}
.ck-free{color:var(--ok);font-weight:600}
.ck-step{display:inline-flex;align-items:center;border:1px solid #DCE3F5;background:#F4F7FF;border-radius:8px;overflow:hidden;height:32px}
.ck-step button{width:32px;height:100%;display:grid;place-items:center;color:var(--p)}
.ck-step span{min-width:24px;text-align:center;font-weight:600;font-size:14px}
.ck-del{color:var(--t3);width:32px;height:32px;display:grid;place-items:center;border-radius:8px;border:1px solid var(--line);background:#fff}
.ck-del:hover{color:#DC2626;background:#FEF2F2}
.ck-group{display:flex;flex-direction:column;gap:8px}
.ck-group-h{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--ok);padding:0 2px}
.ck-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#15803D;border:1px solid #BBF7D0;background:#F0FDF4;border-radius:20px;padding:2px 10px;margin-top:4px}

.ck-coupon{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:12px}
.ck-coupon .ck-code-row input{border:1px solid #D4D4D8;font-size:15px;text-transform:none}
.ck-coupon .ck-code-row input::placeholder{color:#A1A1AA}
.ck-coupon .ck-code-row button{background:#fff;color:var(--t);border:1px solid #D4D4D8;font-weight:500;padding:0 14px}
.ck-coupon-btn{display:flex;align-items:center;justify-content:center;gap:2px;width:100%;margin-top:10px;font-size:13.5px;color:var(--t2)}
.ck-code-x{margin-left:2px;font-size:15px;line-height:1}
.ck-saved{padding:8px 14px;background:color-mix(in srgb,var(--ok) 10%,#fff);color:var(--ok);font-weight:500;font-size:13.5px}

.ck-upsell{padding:14px 12px}
.ck-ups-h{display:inline-block;font-size:17px;font-weight:600;color:var(--hl);padding:0 4px 8px;border-bottom:3px solid var(--hl);margin-bottom:12px;min-width:60%}
.ck-ups{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px;scrollbar-width:none}
.ck-ups::-webkit-scrollbar{display:none}
.ck-up{flex:0 0 80%;scroll-snap-align:start;border:1px solid var(--line);border-radius:14px;padding:10px;display:flex;gap:12px;align-items:center;background:#fff}
.ck-up .ck-img{width:72px;height:72px}.ck-up .ck-l-bottom{justify-content:space-between}.ck-up .ck-prices{align-items:flex-start}.ck-up .ck-now{font-weight:600;font-size:16px}
.ck-up-t{font-size:13px;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ck-up-r{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.ck-btn-o{border:1px solid var(--hl);color:var(--hl);border-radius:6px;padding:4px 14px;font-weight:500;font-size:14px;background:#fff}
.ck-btn-o:disabled{opacity:.5}
.ck-link{display:inline-flex;align-items:center;gap:6px;color:var(--t);text-decoration:underline;text-underline-offset:3px;font-weight:500;padding:2px}
.ck-note textarea{width:100%;min-height:72px;border:1px solid #D4D4D8;border-radius:10px;padding:10px;resize:vertical;margin-top:8px}
.ck-count{font-size:11.5px;color:var(--t3);text-align:right}

.ck-foot{background:#fff;box-shadow:0 -6px 18px -10px rgba(0,0,0,.18)}
.ck-saving{background:color-mix(in srgb,var(--ok) 45%,#C9F5E2);color:#14532D;text-align:center;font-size:15px;padding:8px 12px}
.ck-saving b{font-weight:700}
.ck-foot-in{padding:12px 14px calc(12px + env(safe-area-inset-bottom))}
.ck-terms{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--t2);margin-bottom:10px;cursor:pointer}
.ck-terms input{width:16px;height:16px;accent-color:var(--p)}
.ck-terms.ck-shake{animation:ck-shake .32s ease}
@keyframes ck-shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.ck-pay{display:flex;align-items:center;gap:12px}
.ck-total{min-width:104px}
.ck-total small{display:block;font-size:13px;color:var(--t2)}
.ck-total div{display:flex;align-items:baseline;gap:6px}
.ck-total s{font-size:13px;color:var(--t3)}
.ck-total b{font-size:19px;font-weight:700;letter-spacing:-.02em}
.ck-cta{position:relative;flex:1;min-height:54px;border-radius:12px;background:var(--p);color:var(--pt);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:6px 10px}
.ck-cta:disabled{opacity:.6;cursor:default}
.ck-cta-tag{position:absolute;top:-11px;left:14px;background:color-mix(in srgb,var(--hl) 45%,#F7C9AE);color:var(--p);font-size:11px;font-weight:600;border-radius:4px 4px 0 0;padding:2px 8px}
.ck-cta-main{display:flex;align-items:center;gap:8px;font-weight:700;font-size:17px}
.ck-cta-apps{display:inline-flex;margin-left:2px}.ck-app{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#fff;align-items:center;justify-content:center;overflow:hidden;margin-left:-6px;border:1.5px solid var(--p)}
.ck-app svg{width:30px;height:20px;flex-shrink:0}
.ck-cta-sub{display:flex;align-items:center;gap:3px;font-size:10px;opacity:.85}
.ck-badges{display:flex;gap:8px;justify-content:space-between;margin-top:10px}
.ck-badge{flex:1;height:36px;border-radius:8px;background:#F4F4F5;display:grid;place-items:center}
.ck-loader{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,.55)}
.ck-loader i{width:14px;height:14px;border-radius:50%;background:var(--hl);animation:ck-dots .9s ease-in-out infinite}
.ck-loader i:nth-child(2){animation-delay:.15s}.ck-loader i:nth-child(3){animation-delay:.3s}
@keyframes ck-dots{0%,80%,100%{transform:translateY(0);opacity:.6}40%{transform:translateY(-7px);opacity:1}}

.ck-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px;gap:10px}
.ck-empty .ck-i{width:64px;height:64px;border-radius:50%;background:#F4F4F5;display:grid;place-items:center;color:var(--t3)}
.ck-empty h3{margin:6px 0 0;font-size:17px}
.ck-empty p{margin:0;color:var(--t2)}
.ck-empty a{margin-top:10px;background:var(--p);color:var(--pt);border-radius:12px;padding:12px 22px;font-weight:600;text-decoration:none}

.ck-sheet-bg{position:absolute;inset:0;background:rgba(9,9,11,.35);z-index:5}
.ck-sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:18px 18px 0 0;padding:10px 16px 20px;z-index:6;animation:ck-up .28s cubic-bezier(.32,.72,0,1)}
@keyframes ck-up{from{transform:translateY(100%)}}
.ck-grab{width:40px;height:4px;border-radius:2px;background:#D4D4D8;margin:0 auto 12px}
.ck-sheet h3{margin:0 0 12px;font-size:16px}
.ck-code-row{display:flex;gap:8px}
.ck-code-row input{flex:1;height:46px;border:1.5px solid var(--p);border-radius:10px;padding:0 12px;text-transform:uppercase}
.ck-code-row button{height:46px;padding:0 20px;border-radius:10px;background:var(--p);color:var(--pt);font-weight:600}
.ck-codes{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.ck-code{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:13px;font-weight:500}
.ck-cards{display:flex;flex-direction:column;gap:8px;margin-top:12px;max-height:46vh;overflow:auto}
.ck-card{display:flex;align-items:center;gap:10px;border:1px dashed var(--line);border-radius:10px;padding:10px 12px}
.ck-card.ck-on{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 6%,#fff)}
.ck-card-text{flex:1;display:flex;flex-direction:column;gap:3px;font-size:13px;min-width:0}
.ck-card-text>span:not(.ck-code){color:#6b7280;font-size:12px}
.ck-card-text .ck-code{align-self:flex-start;padding:2px 8px;font-size:12px}
.ck-card-btn{font-weight:700;color:var(--p);font-size:13px;padding:6px 4px}
.ck-code.ck-on{border-color:var(--ok);color:var(--ok);background:color-mix(in srgb,var(--ok) 8%,#fff)}
.ck-msg{margin-top:10px;font-size:13px}
.ck-msg.ck-err{color:#DC2626}
.ck-msg.ck-ok{color:var(--ok)}
.ck-busy{opacity:.55;pointer-events:none;transition:opacity .15s}
.ck-confetti{position:fixed;inset:0;pointer-events:none;z-index:2147483002}
`;
}
