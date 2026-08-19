function createConfetti(type) {
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  var particles = [];
  var colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3'];

  for (var i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 15,
      vy: (Math.random() - 0.5) * 15 - 5,
      size: Math.random() * 6 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
      shape: type === 'stars' ? 'star' : 'rect'
    });
  }

  var frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var alive = false;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.life <= 0) continue;
      alive = true;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3;
      p.life -= 0.015;
      p.vx *= 0.99;

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;

      if (p.shape === 'star') {
        ctx.beginPath();
        for (var j = 0; j < 5; j++) {
          var angle = (j * 4 * Math.PI) / 5 - Math.PI / 2;
          var method = j === 0 ? 'moveTo' : 'lineTo';
          ctx[method](p.x + Math.cos(angle) * p.size, p.y + Math.sin(angle) * p.size);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
      }
    }

    frame++;
    if (alive && frame < 120) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(animate);
}

module.exports = { createConfetti };
