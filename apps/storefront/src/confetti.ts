/** Small canvas confetti, removed when done. Skipped when the shopper prefers reduced motion. */
export function confetti(parent: Node): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'ck-confetti';
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  const w = (canvas.width = window.innerWidth);
  const ht = (canvas.height = window.innerHeight);
  const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3'];
  const parts = Array.from({ length: 90 }, () => ({
    x: w - 210 + (Math.random() - 0.5) * 120,
    y: ht * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 12 - 4,
    s: Math.random() * 6 + 3,
    c: colors[Math.floor(Math.random() * colors.length)]!,
    life: 1,
  }));
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, w, ht);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.vx *= 0.99;
      p.life -= 0.012;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.s, p.s * 0.6);
    }
    if (++frame < 130) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
