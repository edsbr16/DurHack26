// Host visuals: one Canvas 2D scene, full-bleed behind the console UI.
// Reads Sensors/Peers refs directly inside rAF — no React involvement.
import { Sensors, Peers } from './store.js';

const lerp = (a, b, t) => a + (b - a) * t;
const rgbCss = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function hashAngle(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 360) * (Math.PI / 180);
}

export function startVisuals(canvas) {
  const ctx = canvas.getContext('2d');
  let raf = 0;
  let bg = [12, 13, 18]; // current background tone, eased toward ambient rgb

  const resize = () => {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  };
  resize();
  window.addEventListener('resize', resize);

  function draw(t) {
    raf = requestAnimationFrame(draw);
    const w = canvas.width, h = canvas.height;
    const now = t / 1000;

    // 1. Background wash — the room's color, dimmed.
    for (let i = 0; i < 3; i++) {
      bg[i] = lerp(bg[i], Sensors.rgb[i] * 0.22 + 8, 0.02);
    }
    ctx.fillStyle = rgbCss(bg[0], bg[1], bg[2]);
    ctx.fillRect(0, 0, w, h);

    // 2. Sound waves — amplitude from ambient sound, drift from distance.
    const amp = 30 + Sensors.sound * 160;
    const drift = 1 + Sensors.distance / 200;
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const alpha = 0.10 + layer * 0.06;
      ctx.strokeStyle = rgbCss(Sensors.rgb[0], Sensors.rgb[1], Sensors.rgb[2], alpha);
      ctx.lineWidth = (devicePixelRatio * (1.5 - layer * 0.35));
      for (let x = 0; x <= w; x += 8) {
        const y =
          h * (0.35 + layer * 0.15) +
          Math.sin(x / (90 * drift) + now * (0.6 + layer * 0.2) + layer * 2) *
            amp * (layer === 1 ? 1.2 : 0.8);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 3. Participants — one orbiting node per live phone, colored by its camera.
    const minDim = Math.min(w, h);
    const cx = w * 0.5, cy = h * 0.45;
    const stale = performance.now() - 5000;
    for (const [id, p] of Peers) {
      if (!p.t || p.t < stale) {
        if (p.t && p.t < performance.now() - 15000) Peers.delete(id);
        continue;
      }
      const ang = hashAngle(id) + now * 0.15;
      const radius = minDim * 0.28 + Math.sin(now * 0.4 + ang * 3) * minDim * 0.04;
      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius;
      const [pr, pg, pb] = Array.isArray(p.dominantRgb) ? p.dominantRgb : [140, 140, 140];
      const size = minDim * (0.008 + 0.03 * (p.pinchVolume || 0));
      // glow
      ctx.beginPath();
      ctx.fillStyle = rgbCss(pr, pg, pb, 0.14 + 0.5 * (p.pinchVolume || 0));
      ctx.arc(x, y, size * 2.4, 0, Math.PI * 2);
      ctx.fill();
      // core
      ctx.beginPath();
      ctx.fillStyle = rgbCss(pr, pg, pb);
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Depth bar — the ultrasonic distance as a horizon line at the bottom.
    const nearness = Math.min(1, Math.max(0, (150 - Sensors.distance) / 150));
    ctx.fillStyle = rgbCss(Sensors.rgb[0], Sensors.rgb[1], Sensors.rgb[2], 0.16 + nearness * 0.3);
    const barY = h - h * 0.06 * (0.4 + nearness);
    ctx.fillRect(0, barY, w, h - barY);
  }

  raf = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
