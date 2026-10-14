/**
 * Confetti falling over the bag (or the whole screen), removed when done. Skipped when the shopper
 * prefers reduced motion.
 */
export function confetti(parent: Node, area?: DOMRect): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'ck-confetti';
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  const w = (canvas.width = window.innerWidth);
  const ht = (canvas.height = window.innerHeight);
  const left = area?.left ?? 0;
  const width = area?.width ?? w;
  const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#1dd1a1', '#ff9f43'];
  const parts = Array.from({ length: 140 }, () => ({
    x: left + Math.random() * width,
    y: -20 - Math.random() * ht * 0.6,
    vx: (Math.random() - 0.5) * 1.6,
    vy: 2.2 + Math.random() * 2.8,
    s: Math.random() * 5 + 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.25,
    c: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  let frame = 0;
  const last = 200;
  const tick = () => {
    ctx.clearRect(0, 0, w, ht);
    ctx.globalAlpha = frame > last - 40 ? (last - frame) / 40 : 1;
    for (const p of parts) {
      p.x += p.vx + Math.sin((frame + p.s * 10) / 18) * 0.6;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (++frame < last) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
