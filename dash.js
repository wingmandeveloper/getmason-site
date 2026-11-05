/* Compact sample-run dashboard ("On the job").
   A small, self-contained version of the Mason dashboard: one sample run from
   Storage (A) to the Work area (B), looping. Route, obstacles and event wording
   come from mason-dashboard/data.js. Everything is a simulation, labelled
   "Sample run" on the page. It only runs while on screen. */
(() => {
  const root = document.getElementById('dash');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const RAD = Math.PI / 180;
  const NIGHT = '#101113', AMBER = '#f5b014';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, '0');
  const hms = (s) => `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(Math.floor(s % 60))}`;
  const mmss = (s) => `${pad2(Math.min(99, Math.floor(s / 60)))}:${pad2(Math.floor(s % 60))}`;

  /* ---- sample data (from the dashboard's data.js) ---- */
  const CAP = 1500, MAX_KMH = 30, LOAD = 820, CLOCK0 = 11 * 3600 + 42 * 60 + 30, K = 0.5;
  const ROUTE = [
    { name: 'A', label: 'Storage', x: 10, y: 12 }, { x: 36, y: 16 }, { x: 62, y: 14 },
    { x: 86, y: 28 }, { x: 104, y: 46 }, { name: 'B', label: 'Work area', x: 116, y: 58 },
  ].map((p) => ({ ...p, x: p.x * K, y: p.y * K }));
  const OBS = [
    { x1: 2, y1: 5, x2: 7, y2: 10 }, { x1: 44, y1: 4, x2: 56, y2: 10 }, { x1: 30, y1: 30, x2: 62, y2: 52 },
    { x1: 112, y1: 14, x2: 114, y2: 44 }, { x1: 70, y1: 40, x2: 78, y2: 46 }, { x1: 108, y1: 64, x2: 114, y2: 69 },
    { x1: 86, y1: 31, x2: 90, y2: 35 },
  ].map((o) => ({ x1: o.x1 * K, y1: o.y1 * K, x2: o.x2 * K, y2: o.y2 * K }));

  const seg = []; let total = 0;
  for (let i = 1; i < ROUTE.length; i++) { const l = Math.hypot(ROUTE[i].x - ROUTE[i - 1].x, ROUTE[i].y - ROUTE[i - 1].y); seg.push(l); total += l; }
  const A = ROUTE[0], B = ROUTE[ROUTE.length - 1];
  function at(s) {
    s = clamp(s, 0, total);
    let acc = 0;
    for (let i = 1; i < ROUTE.length; i++) {
      if (s <= acc + seg[i - 1] || i === ROUTE.length - 1) {
        const t = clamp((s - acc) / seg[i - 1], 0, 1);
        const dx = ROUTE[i].x - ROUTE[i - 1].x, dy = ROUTE[i].y - ROUTE[i - 1].y;
        return { x: ROUTE[i - 1].x + dx * t, y: ROUTE[i - 1].y + dy * t, hdg: (Math.atan2(dx, dy) / RAD + 360) % 360 };
      }
      acc += seg[i - 1];
    }
  }
  const roughAt = (s, vKmh) => { const m = s / K; return 0.02 + 0.011 * vKmh + 0.05 * Math.exp(-(((m - 88) / 7) ** 2)) + 0.004 * Math.sin(m * 1.7); };

  /* ---- the run ---- */
  const T_LOAD = 6.5, T_OBS = 23.3, T_OBS_END = 26.8, FOOTAGE = 31.3;   // seconds into the camera footage
  let S;
  function reset() {
    S = { t: 0, s: 0, v: 0, hdg: at(0).hdg, load: 0, mode: 'load', done: 0, events: [], obs: false, loaded: false, tipped: false, acc: 0,
          rough: Array.from({ length: 240 }, () => roughAt(0, 0)), roughAcc: 0, scan: 0 };
    addEvent('Run started, recording');
  }
  function addEvent(text, tone) {
    S.events.unshift({ t: hms(CLOCK0 + S.t), text, tone });
    S.events.length = Math.min(S.events.length, 5);
    S.dirty = true;
  }
  function step(dt) {
    S.t += dt; S.scan += dt;
    if (S.mode === 'load') {                       // loading at A
      S.load = clamp((S.t - 1.5) / 2.5, 0, 1) * LOAD;
      if (!S.loaded && S.t > 4.2) { S.loaded = true; addEvent(`Load ${LOAD} kg on board`); }
      if (S.t >= T_LOAD) S.mode = 'drive';
    } else if (S.mode === 'drive') {
      const remain = total - S.s;
      let kmh = 11 + 0.9 * Math.sin(S.t * 0.8) + 0.4 * Math.sin(S.t * 2.1 + 1);
      if (S.t >= T_OBS && S.t < T_OBS_END) {        // something ahead: slow down
        if (!S.obs) { S.obs = true; addEvent('Obstacle within 2.2 m', 'warn'); }
        kmh = 3.5;
      }
      kmh *= clamp(remain / (11 * K * 3.2), 0.07, 1);   // ease down into B
      S.v += clamp(kmh / 3.6 - S.v, -1.6 * dt, 1.0 * dt);
      S.s = clamp(S.s + S.v * dt, 0, total);
      if (total - S.s < 0.25) { S.s = total; S.v = 0; S.mode = 'dump'; S.done = 0; addEvent(`Arrived at ${B.label}`); }
    } else if (S.mode === 'dump') {                 // tip the load; the next run starts when the footage loops
      S.done += dt;
      if (S.done > 0.5 && !S.tipped) { S.tipped = true; addEvent(`Load tipped, ${LOAD} kg`); }
      if (S.tipped) S.load = Math.max(0, S.load - (LOAD / 1.1) * dt);
    }
    S.here = at(S.s);
    const diff = ((S.here.hdg - S.hdg + 540) % 360) - 180;
    S.hdg = (S.hdg + diff * Math.min(1, dt * 4) + 360) % 360;
    S.roughAcc += dt;
    while (S.roughAcc >= 0.25) { S.roughAcc -= 0.25; S.rough.push(roughAt(S.s, S.v * 3.6)); S.rough.shift(); }
  }
  reset(); S.here = at(0);

  /* ---- text and bars ---- */
  const cache = {};
  const put = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
  const wid = (id, v) => { if (cache[id + 'w'] !== v) { cache[id + 'w'] = v; $(id).style.width = v; } };
  function render() {
    put('dClock', hms(CLOCK0 + S.t));
    put('dTimer', mmss(S.t));
    put('dSpeed', (S.v * 3.6).toFixed(1)); wid('dSpeedFill', `${(S.v * 3.6 / MAX_KMH) * 100}%`);
    put('dLoad', Math.round(S.load).toLocaleString('en-US')); wid('dLoadFill', `${(S.load / CAP) * 100}%`);
    put('dRough', S.rough[S.rough.length - 1].toFixed(2));
    if (S.dirty) {
      S.dirty = false;
      $('dEvents').innerHTML = S.events.map((e, i) => `<li class="${e.tone || ''}${i === 0 ? ' new' : ''}"><time>${e.t}</time><span>${e.text}</span></li>`).join('');
    }
  }

  /* ---- canvases ---- */
  function view(id, onsize) {
    const c = $(id), ctx = c.getContext('2d'), v = { c, ctx, w: 0, h: 0, dpr: 1 };
    const fit = () => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (!r.width || !r.height) return;
      v.w = r.width; v.h = r.height; v.dpr = dpr;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (onsize) onsize(v);
    };
    new ResizeObserver(fit).observe(c); fit();
    return v;
  }

  let g = null, bg = null;
  function buildMap(v) {
    const { w, h } = v, pad = 9;
    const xs = ROUTE.map((p) => p.x), ys = ROUTE.map((p) => p.y);
    const x1 = Math.min(...xs) - pad, x2 = Math.max(...xs) + pad, y1 = Math.min(...ys) - pad, y2 = Math.max(...ys) + pad;
    const sc = Math.min((w - 36) / (x2 - x1), (h - 36) / (y2 - y1));
    const ox = (w - sc * (x2 - x1)) / 2, oy = (h - sc * (y2 - y1)) / 2;
    g = { sc, X: (x) => ox + (x - x1) * sc, Y: (y) => oy + (y2 - y) * sc };
    bg = document.createElement('canvas'); bg.width = v.c.width; bg.height = v.c.height;
    const b = bg.getContext('2d'); b.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    b.fillStyle = NIGHT; b.fillRect(0, 0, w, h);
    b.lineWidth = 1; b.strokeStyle = 'rgba(255,255,255,.05)';
    const gs = 10 * K;
    for (let gx = Math.ceil(x1 / gs) * gs; gx <= x2; gx += gs) { b.beginPath(); b.moveTo(g.X(gx), 0); b.lineTo(g.X(gx), h); b.stroke(); }
    for (let gy = Math.ceil(y1 / gs) * gs; gy <= y2; gy += gs) { b.beginPath(); b.moveTo(0, g.Y(gy)); b.lineTo(w, g.Y(gy)); b.stroke(); }
    for (const o of OBS) {
      b.fillStyle = 'rgba(255,255,255,.06)'; b.strokeStyle = 'rgba(255,255,255,.17)';
      b.beginPath(); b.roundRect(g.X(o.x1), g.Y(o.y2), (o.x2 - o.x1) * sc, (o.y2 - o.y1) * sc, 4); b.fill(); b.stroke();
    }
  }
  const map = view('dMap', buildMap);

  function drawMap() {
    if (!g || !bg) return;
    const { ctx } = map, { X, Y } = g;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0); ctx.setTransform(map.dpr, 0, 0, map.dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = (from, to) => {
      const pts = [at(from)]; for (let s = from + 1.5; s < to; s += 1.5) pts.push(at(s)); pts.push(at(to));
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    };
    ctx.setLineDash([1, 8]); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; path(S.s, total); ctx.stroke(); ctx.setLineDash([]);
    if (S.s > 0.1) { ctx.save(); ctx.shadowColor = 'rgba(245,176,20,.55)'; ctx.shadowBlur = 12; ctx.strokeStyle = AMBER; ctx.lineWidth = 3.5; path(0, S.s); ctx.stroke(); ctx.restore(); }

    [A, B].forEach((p) => {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 16, 0, 7); ctx.fill();
      ctx.fillStyle = p === B ? AMBER : '#fff'; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#15171b'; ctx.font = '700 11px "General Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.name, X(p.x), Y(p.y) + 0.5);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '500 11px "General Sans", sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.fillText(p.label, X(p.x), Y(p.y) + 30);
    });

    const hr = S.here;
    ctx.save(); ctx.translate(X(hr.x), Y(hr.y));
    // LiDAR sweep: rings that spread out from the vehicle
    for (let k = 0; k < 2; k++) {
      const ph = ((S.scan * 0.8) + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(245,176,20,${(1 - ph) * 0.35})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 10 + ph * 38, 0, 7); ctx.stroke();
    }
    ctx.rotate(S.hdg * RAD);
    ctx.fillStyle = 'rgba(245,176,20,.25)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = NIGHT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();

    if (S.mode === 'drive' && S.t >= T_OBS && S.t < T_OBS_END) {   // obstacle ahead: warning ring
      const a = at(Math.min(total, S.s + 2.2 * 1.3)), pulse = 0.5 + 0.5 * Math.sin(S.t * 8);
      ctx.strokeStyle = `rgba(255,120,60,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(X(a.x), Y(a.y), 12 + 3 * pulse, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  const spark = view('dSpark');
  function drawSpark() {
    const { ctx, w, h } = spark; if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const max = 0.3, stepX = w / 239;
    const pts = S.rough.map((v, i) => [i * stepX, h - 4 - (Math.min(v, max) / max) * (h - 10)]);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, 'rgba(245,176,20,.4)'); grad.addColorStop(1, 'rgba(245,176,20,0)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
  }

  /* ---- camera footage drives the run: the run restarts whenever the footage loops ---- */
  const cam = $('dCam');
  let camOk = false, camLoaded = false;
  if (cam) {
    cam.addEventListener('canplay', () => { camOk = true; });
    cam.addEventListener('error', () => { camOk = false; cam.closest('.dcard--cam').hidden = true; });
  }
  function loadCam() { if (cam && !camLoaded) { camLoaded = true; cam.src = 'assets/camera.mp4'; cam.load(); } }

  /* ---- loop: only while the panel is on screen ---- */
  let running = false, last = 0, clock0 = 0;
  function frame(now) {
    if (!running) return;
    // master time: the footage if it is playing, otherwise a clock of the same length
    const tt = camOk && !cam.paused ? cam.currentTime : (((now - clock0) / 1000) % FOOTAGE);
    if (tt < S.t - 0.3) { reset(); S.here = at(0); }
    let guard = 0;
    while (S.t + 1 / 60 <= tt && guard++ < 4000) step(1 / 60);
    render(); drawMap(); drawSpark();
    requestAnimationFrame(frame);
  }
  new IntersectionObserver((entries) => {
    const on = entries.some((e) => e.isIntersecting);
    if (on) loadCam();
    if (on && !running) {
      running = true; clock0 = performance.now();
      if (cam && camLoaded) cam.play().catch(() => {});
      requestAnimationFrame(frame);
    } else if (!on) { running = false; if (cam) cam.pause(); }
  }, { threshold: 0.05 }).observe(root);
  render();
})();
