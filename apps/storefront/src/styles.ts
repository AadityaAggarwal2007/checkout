import type { DrawerSettings } from '@checkout/shared';

/** All drawer CSS lives inside the Shadow DOM: the theme cannot break it, and it cannot break the theme. */
export function css(colors: DrawerSettings['colors']): string {
  return `
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
.ck{--p:${colors.primary};--pt:${colors.buttonText};--bg:${colors.background};--ok:${colors.accent};
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

.ck-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border-bottom:1px solid var(--line)}
.ck-head h2{flex:1;margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.ck-x{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:var(--t2)}
.ck-x:hover{background:#F4F4F5}
.ck-ann{background:var(--p);color:var(--pt);font-size:13px;font-weight:500;text-align:center;padding:9px 16px;overflow:hidden;white-space:nowrap;position:relative;min-height:36px}
.ck-ann span{display:inline-block;transition:opacity .35s ease,transform .35s ease}
.ck-ann.ck-fade span{opacity:0;transform:translateY(-6px)}
.ck-ann.ck-marquee span{padding-left:100%;animation:ck-marq var(--dur,18s) linear infinite}
@keyframes ck-marq{to{transform:translateX(-100%)}}

.ck-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:12px 12px 4px;display:flex;flex-direction:column;gap:12px}
.ck-body>*{flex-shrink:0}
.ck-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px}
.ck-card-h{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;margin-bottom:10px}
.ck-card-h .ck-i{color:var(--t2)}

.ck-reward{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:12px 14px 10px}
.ck-reward-t{text-align:center;font-weight:600;color:var(--p);font-size:14px;margin-bottom:12px}
.ck-track{position:relative;height:4px;background:#E4E4E7;border-radius:4px;margin:14px 18px 30px 8px}
.ck-fill{position:absolute;left:0;top:0;bottom:0;background:var(--p);border-radius:4px;transition:width .5s ease}
.ck-dot{position:absolute;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:8px;background:#fff;border:1.5px solid #D4D4D8;color:#A1A1AA;display:grid;place-items:center;transition:all .3s}
.ck-dot.ck-on{background:var(--p);border-color:var(--p);color:var(--pt)}
.ck-dot-l{position:absolute;top:32px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11.5px;color:var(--t3)}
.ck-dot.ck-on .ck-dot-l{color:var(--p);font-weight:600}
.ck-dot:last-child .ck-dot-l{left:auto;right:-4px;transform:none}

.ck-line{display:flex;gap:12px;padding:10px 0}
.ck-line+.ck-line{border-top:1px solid #F4F4F5}
.ck-img{position:relative;width:64px;height:64px;border-radius:10px;background:#F4F4F5 center/cover no-repeat;flex-shrink:0;border:1px solid var(--line)}
.ck-qbadge{position:absolute;top:-7px;right:-7px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#52525B;color:#fff;font-size:11px;font-weight:600;display:grid;place-items:center}
.ck-l-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.ck-l-top{display:flex;gap:8px;align-items:flex-start}
.ck-l-title{flex:1;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ck-l-var{font-size:12px;color:var(--t3)}
.ck-sel{appearance:none;-webkit-appearance:none;max-width:100%;border:1px solid #D4D4D8;border-radius:9px;padding:6px 28px 6px 10px;font-size:13px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525B' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") right 10px center no-repeat}
.ck-l-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ck-prices{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.ck-was{color:var(--t3);text-decoration:line-through;font-size:12.5px}
.ck-now{font-weight:600}
.ck-free{color:var(--ok);font-weight:600}
.ck-off{color:var(--ok);font-size:12px;font-weight:500;width:100%}
.ck-step{display:inline-flex;align-items:center;border:1px solid #D4D4D8;border-radius:9px;overflow:hidden;height:32px}
.ck-step button{width:30px;height:100%;display:grid;place-items:center;color:var(--t2)}
.ck-step button:hover{background:#F4F4F5}
.ck-step span{min-width:26px;text-align:center;font-weight:600;font-size:13px}
.ck-del{color:var(--t3);width:28px;height:28px;display:grid;place-items:center;border-radius:8px}
.ck-del:hover{color:#DC2626;background:#FEF2F2}
.ck-group{border:1.5px solid color-mix(in srgb,var(--p) 35%,#fff);background:color-mix(in srgb,var(--p) 4%,#fff);border-radius:12px;padding:6px 10px;margin:6px 0}
.ck-group-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ok)}
.ck-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#7C3AED;background:#F5F3FF;border-radius:6px;padding:2px 6px}

.ck-coupon{border:1.5px solid color-mix(in srgb,var(--ok) 45%,#fff);background:linear-gradient(90deg,color-mix(in srgb,var(--ok) 8%,#fff),#fff);border-radius:var(--r);overflow:hidden}
.ck-coupon-btn{display:flex;align-items:center;gap:12px;width:100%;padding:14px;text-align:left}
.ck-coupon-ic{width:36px;height:36px;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center}
.ck-coupon-btn b{flex:1;font-size:15px;font-weight:600;color:var(--ok)}
.ck-saved{padding:8px 14px;background:color-mix(in srgb,var(--ok) 10%,#fff);color:var(--ok);font-weight:500;font-size:13.5px}

.ck-ups{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px;scrollbar-width:none}
.ck-ups::-webkit-scrollbar{display:none}
.ck-up{flex:0 0 78%;scroll-snap-align:start;border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center;background:#fff}
.ck-up .ck-img{width:58px;height:58px}
.ck-up-t{font-size:13px;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ck-up-r{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.ck-btn-o{border:1.5px solid var(--p);color:var(--p);border-radius:9px;padding:5px 16px;font-weight:600;font-size:13px}
.ck-btn-o:disabled{opacity:.5}
.ck-link{display:inline-flex;align-items:center;gap:6px;color:var(--t);text-decoration:underline;text-underline-offset:3px;font-weight:500;padding:2px}
.ck-note textarea{width:100%;min-height:72px;border:1px solid #D4D4D8;border-radius:10px;padding:10px;resize:vertical;margin-top:8px}
.ck-count{font-size:11.5px;color:var(--t3);text-align:right}

.ck-foot{background:#fff;border-top:1px solid var(--line);padding:10px 14px calc(12px + env(safe-area-inset-bottom))}
.ck-terms{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--t2);margin-bottom:10px;cursor:pointer}
.ck-terms input{width:16px;height:16px;accent-color:var(--p)}
.ck-terms.ck-shake{animation:ck-shake .32s ease}
@keyframes ck-shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.ck-pay{display:flex;align-items:center;gap:12px}
.ck-total b{display:block;font-size:20px;font-weight:700;letter-spacing:-.02em}
.ck-total small{font-size:12px;color:var(--t3);text-decoration:underline}
.ck-cta{flex:1;height:50px;border-radius:12px;background:var(--p);color:var(--pt);font-weight:600;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px}
.ck-cta:disabled{opacity:.6;cursor:default}
.ck-badges{display:flex;gap:8px;justify-content:space-between;margin-top:10px}
.ck-badge{flex:1;height:36px;border-radius:8px;background:#F4F4F5;display:grid;place-items:center}
.ck-secured{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:8px;font-size:11px;color:var(--t3)}

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
.ck-code.ck-on{border-color:var(--ok);color:var(--ok);background:color-mix(in srgb,var(--ok) 8%,#fff)}
.ck-msg{margin-top:10px;font-size:13px}
.ck-msg.ck-err{color:#DC2626}
.ck-msg.ck-ok{color:var(--ok)}
.ck-busy{opacity:.55;pointer-events:none;transition:opacity .15s}
.ck-confetti{position:fixed;inset:0;pointer-events:none;z-index:2147483002}
`;
}
