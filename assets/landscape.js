// A non-convex loss landscape drawn as contour lines, with optimizers running momentum gradient descent across it.
// Click or tap to drop a new optimizer. Static under prefers-reduced-motion; paused when off screen.
(function () {
  const canvas = document.getElementById("landscape");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const LINE = css.getPropertyValue("--night-line").trim() || "#5fb0c4";
  const GLOW = css.getPropertyValue("--night-glow").trim() || "#f4c35a";
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The loss: a tilted bowl, five wells of different depth and width, and a low ripple for local minima.
  const WELLS = [[-0.95, -0.35, 0.55, 0.10], [0.25, 0.42, 0.75, 0.06], [1.05, -0.25, 0.45, 0.14], [-0.2, -0.6, 0.35, 0.05], [0.7, 0.62, 0.3, 0.04]];
  function f(x, y) {
    let v = 0.11 * (x * x + 1.7 * y * y) + 0.03 * x;
    for (const [a, b, d, s] of WELLS) v -= d * Math.exp(-((x - a) ** 2 + (y - b) ** 2) / s);
    return v + 0.035 * Math.sin(4.2 * x + 1) * Math.cos(5.1 * y);
  }
  function grad(x, y) {
    const h = 1e-3;
    return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)];
  }

  let W = 0, H = 0, dpr = 1, sx = 1, contours = null, runners = [], raf = 0, visible = true;
  const X0 = -1.75, X1 = 1.75;
  let Y0 = -1, Y1 = 1;
  const toPx = (x, y) => [(x - X0) * sx, (Y1 - y) * sx];
  const toXY = (px, py) => [X0 + px / sx, Y1 - py / sx];

  function drawContours() {
    contours = document.createElement("canvas");
    contours.width = W * dpr; contours.height = H * dpr;
    const c = contours.getContext("2d");
    c.scale(dpr, dpr);
    const step = 6, nx = Math.ceil(W / step) + 1, ny = Math.ceil(H / step) + 1;
    const g = new Float32Array(nx * ny);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const [x, y] = toXY(i * step, j * step);
      const v = f(x, y); g[j * nx + i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    const levels = 22;
    for (let L = 1; L < levels; L++) {
      const t = L / levels, lv = lo + (hi - lo) * t * t;  // denser lines near the minima
      c.strokeStyle = LINE;
      c.globalAlpha = 0.12 + 0.38 * (1 - t);
      c.lineWidth = 1;
      c.beginPath();
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = g[j * nx + i], b = g[j * nx + i + 1], d = g[(j + 1) * nx + i], e = g[(j + 1) * nx + i + 1];
        const k = (a > lv) | ((b > lv) << 1) | ((e > lv) << 2) | ((d > lv) << 3);
        if (k === 0 || k === 15) continue;
        const px = i * step, py = j * step;
        const top = [px + step * (lv - a) / (b - a), py], right = [px + step, py + step * (lv - b) / (e - b)];
        const bot = [px + step * (lv - d) / (e - d), py + step], left = [px, py + step * (lv - a) / (d - a)];
        const seg = { 1: [left, top], 2: [top, right], 3: [left, right], 4: [right, bot], 5: [left, top, right, bot], 6: [top, bot], 7: [left, bot],
                      8: [left, bot], 9: [top, bot], 10: [left, bot, top, right], 11: [right, bot], 12: [left, right], 13: [top, right], 14: [left, top] }[k];
        for (let s = 0; s < seg.length; s += 2) { c.moveTo(seg[s][0], seg[s][1]); c.lineTo(seg[s + 1][0], seg[s + 1][1]); }
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  function spawn(x, y) {
    if (x === undefined) { x = X0 + Math.random() * (X1 - X0); y = Y0 + Math.random() * (Y1 - Y0); }
    return { x, y, vx: 0, vy: 0, trail: [], still: 0, life: 0, lr: 0.006 + Math.random() * 0.006, beta: 0.86 + Math.random() * 0.1 };
  }
  function stepRunner(r) {
    const [gx, gy] = grad(r.x, r.y);
    r.vx = r.beta * r.vx - r.lr * gx + (Math.random() - 0.5) * 0.0016;
    r.vy = r.beta * r.vy - r.lr * gy + (Math.random() - 0.5) * 0.0016;
    r.x += r.vx; r.y += r.vy; r.life++;
    r.trail.push([r.x, r.y]); if (r.trail.length > 90) r.trail.shift();
    r.still = Math.hypot(r.vx, r.vy) < 0.0009 ? r.still + 1 : 0;
    return r.still < 140 && r.life < 1400 && r.x > X0 - 0.2 && r.x < X1 + 0.2 && r.y > Y0 - 0.2 && r.y < Y1 + 0.2;
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(contours, 0, 0, W, H);
    for (const r of runners) {
      const n = r.trail.length;
      for (let i = 1; i < n; i++) {
        const [ax, ay] = toPx(...r.trail[i - 1]), [bx, by] = toPx(...r.trail[i]);
        ctx.strokeStyle = GLOW; ctx.globalAlpha = (i / n) * 0.7; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      const [hx, hy] = toPx(r.x, r.y);
      ctx.globalAlpha = 0.25; ctx.fillStyle = GLOW; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function tick() {
    runners = runners.filter(stepRunner);
    while (runners.length < 11) runners.push(spawn());
    draw();
    raf = visible && !still ? requestAnimationFrame(tick) : 0;
  }
  function resize() {
    const box = canvas.getBoundingClientRect();
    W = Math.max(1, box.width); H = Math.max(1, box.height); dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    sx = W / (X1 - X0); const half = H / sx / 2; Y0 = -half; Y1 = half;
    drawContours();
    if (still) {  // one settled frame: run the optimizers ahead, then draw once
      runners = Array.from({ length: 11 }, () => spawn());
      for (let k = 0; k < 260; k++) runners.forEach(stepRunner);
      draw();
    } else if (!raf) tick();
  }
  canvas.addEventListener("pointerdown", (e) => {
    const box = canvas.getBoundingClientRect();
    const [x, y] = toXY(e.clientX - box.left, e.clientY - box.top);
    runners.push(spawn(x, y)); if (runners.length > 18) runners.shift();
    if (still) { for (let k = 0; k < 260; k++) stepRunner(runners[runners.length - 1]); draw(); }
  });
  new ResizeObserver(() => resize()).observe(canvas);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf && !still) tick(); }).observe(canvas);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible && !raf && !still) tick(); });
})();
