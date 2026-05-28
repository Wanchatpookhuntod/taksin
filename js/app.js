// ═══ SPOTS ═══
const SPOTS = [
  { id: "prang",    name: "พระปรางค์สามยอด", desc: "ศูนย์กลางพลังขอม",   lat: 14.802964261273392, lng: 100.61404536171183, icon: "🏛️", vfx: "golden" },
  { id: "mahathat", name: "วัดมหาธาตุ",       desc: "พระธาตุคุ้มกันทัพ",  lat: 14.79965, lng: 100.63418, icon: "⛩️", vfx: "sacred" },
  { id: "wang",     name: "วังนารายณ์",       desc: "ฐานบัญชาการตากสิน", lat: 14.8050, lng: 100.6120, icon: "⚔️", vfx: "battle" },
];
const VFX_LABELS = { golden: "✦ SACRED LIGHT", sacred: "◈ RELIC AURA", battle: "⚔ BATTLE FIRE" };
const AIM_DEG = 22, UNLOCK_M = 200;

// ═══ STATE ═══
let userLat = null, userLng = null, rawH = 0, smoothH = 0;
let aimedSpot = null, activeVFX = null, vfxFade = 0;
let unlocked = {}, toastTimer = null, T = 0;
let ps = [], ss = [];

// ═══ CANVAS ═══
const cv = document.getElementById('vfx');
const ctx = cv.getContext('2d');
function resizeCV() { cv.width = innerWidth; cv.height = innerHeight; spawnParticles(); }

// ═══ MATH ═══
function hav(a, b, c, d) {
  const R = 6371000, dL = (c - a) * Math.PI / 180, dG = (d - b) * Math.PI / 180;
  const x = Math.sin(dL / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function bear(a, b, c, d) {
  const dG = (d - b) * Math.PI / 180;
  const y = Math.sin(dG) * Math.cos(c * Math.PI / 180);
  const x = Math.cos(a * Math.PI / 180) * Math.sin(c * Math.PI / 180) - Math.sin(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.cos(dG);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function adiff(a, b) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }
function sAngle(c, t, a) { let d = t - c; if (d > 180) d -= 360; if (d < -180) d += 360; return c + d * a; }

// ═══ PARTICLES ═══
function mkP(W, H) {
  const z = Math.random();
  return {
    x: Math.random() * W,
    y: z < 0.5 ? H * 0.6 + Math.random() * H * 0.5 : Math.random() * H,
    vx: (Math.random() - .5) * .9, vy: -(0.3 + Math.random() * 1.5),
    size: 1.5 + Math.random() * 3.5,
    life: z > 0.5 ? Math.random() * .4 : 0, maxLife: .5 + Math.random() * .5,
    type: Math.floor(Math.random() * 3), phase: Math.random() * Math.PI * 2
  };
}
function mkS(W, H) {
  return {
    x: Math.random() * W, y: H * .25 + Math.random() * H * .55,
    vx: (Math.random() - .5) * .3, vy: -(0.08 + Math.random() * .22),
    size: 40 + Math.random() * 90, life: Math.random() * .3,
    opacity: .025 + Math.random() * .06, phase: Math.random() * Math.PI * 2
  };
}
function spawnParticles() {
  const W = cv.width, H = cv.height;
  ps = Array.from({ length: 100 }, () => mkP(W, H));
  ss = Array.from({ length: 35 }, () => mkS(W, H));
}

// ═══ START ═══
async function startApp() {
  const err = document.getElementById('perr');
  err.style.display = 'none';
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }
    );
    document.getElementById('video').srcObject = stream;
    await document.getElementById('video').play();
    document.getElementById('perm').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    resizeCV();
    window.addEventListener('resize', resizeCV);
    startGPS();
    startCompass();
    buildChips();
    loop();
    showToast('⚔️', 'World AR พร้อมแล้ว', 'หันกล้องหา spot');
  } catch (e) {
    err.textContent = 'ไม่สามารถเปิดกล้องได้: ' + e.message;
    err.style.display = 'block';
  }
}

// ═══ GPS ═══
function startGPS() {
  if (!navigator.geolocation) { setDemo(); return; }
  navigator.geolocation.watchPosition(pos => {
    userLat = pos.coords.latitude; userLng = pos.coords.longitude;
    const dot = document.getElementById('gps-dot');
    dot.style.animation = 'none'; dot.style.background = '#4CAF50'; dot.style.boxShadow = '0 0 5px #4CAF50';
    document.getElementById('gps-txt').textContent = 'GPS OK';
    document.getElementById('coord-txt').textContent = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
    updateChips();
  }, () => setDemo(), { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
}
function setDemo() {
  userLat = 14.7998; userLng = 100.6133;
  document.getElementById('gps-txt').textContent = 'Demo';
  document.getElementById('coord-txt').textContent = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
  updateChips();
}

// ═══ COMPASS ═══
function startCompass() {
  const h = e => { rawH = e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : (360 - e.alpha + 360) % 360; };
  if (typeof DeviceOrientationEvent?.requestPermission === 'function')
    DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted') addEventListener('deviceorientation', h); }).catch(() => {});
  else addEventListener('deviceorientation', h);
}

// ═══ COMPASS HUD ═══
function drawCompass() {
  const c = document.getElementById('cmp-cv');
  const x = c.getContext('2d');
  const W = 300, H = 56;
  x.clearRect(0, 0, W, H);
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  for (let d = -180; d <= 180; d++) {
    const deg = (smoothH + d + 360) % 360;
    const px = W / 2 + d * 0.5;
    if (px < 0 || px > W) continue;
    const maj = deg % 45 === 0, mid = deg % 15 === 0;
    if (maj || mid) {
      const th = maj ? 18 : 10, al = maj ? .7 : .28;
      x.beginPath(); x.moveTo(px, H - th); x.lineTo(px, H);
      x.strokeStyle = `rgba(201,168,76,${al})`; x.lineWidth = maj ? 1.5 : .8; x.stroke();
      if (maj) {
        const lbl = dirs[Math.round(deg / 45) % 8];
        x.fillStyle = lbl === 'N' ? 'rgba(255,80,80,.85)' : 'rgba(201,168,76,.65)';
        x.font = 'bold 11px sans-serif'; x.textAlign = 'center';
        x.fillText(lbl, px, H - 22);
      }
    }
  }
  if (userLat) {
    SPOTS.forEach(s => {
      const b = bear(userLat, userLng, s.lat, s.lng);
      const diff = adiff(smoothH, b);
      const px = W / 2 + diff * .5;
      if (px < 8 || px > W - 8) return;
      const isHot = aimedSpot === s.id;
      x.globalAlpha = isHot ? 1 : .5;
      x.font = '14px sans-serif'; x.textAlign = 'center';
      x.fillText(s.icon, px, H - 30);
      x.beginPath(); x.arc(px, H - 4, isHot ? 4 : 2.5, 0, Math.PI * 2);
      x.fillStyle = isHot ? '#F0D080' : 'rgba(201,168,76,.4)'; x.fill();
      x.globalAlpha = 1;
    });
  }
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(4,2,1,.92)'); g.addColorStop(.25, 'rgba(4,2,1,0)');
  g.addColorStop(.75, 'rgba(4,2,1,0)'); g.addColorStop(1, 'rgba(4,2,1,.92)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

// ═══ AIM CHECK ═══
function checkAim() {
  if (!userLat) return;
  let found = null, minD = AIM_DEG;
  SPOTS.forEach(s => {
    const b = bear(userLat, userLng, s.lat, s.lng);
    const d = Math.abs(adiff(smoothH, b));
    if (d < minD) { minD = d; found = s; }
  });

  const aimEl = document.getElementById('aim');
  const pop = document.getElementById('popup');

  if (found) {
    aimedSpot = found.id;
    aimEl.classList.add('hot'); pop.classList.add('show');
    document.getElementById('pop-icon').textContent = found.icon;
    document.getElementById('pop-name').textContent = found.name;
    const dist = hav(userLat, userLng, found.lat, found.lng);
    document.getElementById('pop-dist').textContent = dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`;
    document.getElementById('b-name').textContent = found.name;
    document.getElementById('b-desc').textContent = found.desc;
    document.getElementById('vfx-tag').textContent = VFX_LABELS[found.vfx] || '';

    if (activeVFX !== found.vfx) { activeVFX = found.vfx; spawnParticles(); }
    vfxFade = Math.min(1, vfxFade + .04);

    const dist2 = hav(userLat, userLng, found.lat, found.lng);
    if (dist2 < UNLOCK_M && !unlocked[found.id]) {
      unlocked[found.id] = true;
      showToast(found.icon, found.name, 'พลังปลดล็อคแล้ว!');
    }
  } else {
    aimedSpot = null;
    aimEl.classList.remove('hot'); pop.classList.remove('show');
    vfxFade = Math.max(0, vfxFade - .025);
    if (vfxFade === 0) { activeVFX = null; document.getElementById('vfx-tag').textContent = '◌ SEARCHING...'; }
  }
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('hot', c.dataset.id === aimedSpot));
}

// ═══ VFX RENDERERS ═══
function drawVFX(t) {
  const W = cv.width, H = cv.height, fade = vfxFade;
  ctx.clearRect(0, 0, W, H);
  if (fade <= 0 || !activeVFX) return;

  if (activeVFX === 'golden') vfxGolden(t, W, H, fade);
  else if (activeVFX === 'sacred') vfxSacred(t, W, H, fade);
  else if (activeVFX === 'battle') vfxBattle(t, W, H, fade);

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .18, W / 2, H / 2, H * .85);
  vg.addColorStop(0, 'rgba(5,3,1,0)'); vg.addColorStop(1, `rgba(5,3,1,${.55 * fade})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  if (fade > .5) drawFrame(t, W, H, fade);
}

function vfxGolden(t, W, H, fade) {
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (i - 3.5) * .14, len = H * 1.4;
    const a = (0.02 + .015 * Math.sin(t * .55 + i * 1.1)) * fade;
    const g = ctx.createLinearGradient(W / 2, 0, W / 2 + Math.cos(angle) * len, Math.sin(angle) * len);
    g.addColorStop(0, `rgba(255,220,80,${a * 4})`);
    g.addColorStop(.5, `rgba(220,160,50,${a})`);
    g.addColorStop(1, 'rgba(180,120,30,0)');
    ctx.beginPath();
    const sp = 18 + i * 8;
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2 + Math.cos(angle) * len - sp, Math.sin(angle) * len);
    ctx.lineTo(W / 2 + Math.cos(angle) * len + sp, Math.sin(angle) * len);
    ctx.fillStyle = g; ctx.fill();
  }
  ps.forEach((p, i) => {
    p.x += p.vx + Math.sin(t + p.phase) * .3; p.y += p.vy; p.life += .0045;
    if (p.y < -40 || p.life > p.maxLife) { ps[i] = mkP(W, H); return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .95 * fade;
    const pu = 1 + .35 * Math.sin(t * 2.2 + p.phase);
    if (p.type === 0) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * .9 + p.phase);
      const s = p.size * pu;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * .55, 0); ctx.lineTo(0, s); ctx.lineTo(-s * .55, 0); ctx.closePath();
      ctx.fillStyle = `rgba(255,215,80,${al})`; ctx.fill(); ctx.restore();
    } else if (p.type === 1) {
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * pu * 5);
      gr.addColorStop(0, `rgba(255,230,100,${al})`); gr.addColorStop(1, 'rgba(180,120,30,0)');
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * pu * 5, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = al * .8;
      ctx.fillStyle = '#FFE066'; ctx.font = `${p.size * 3.5}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', 0, 0); ctx.restore();
    }
  });
  const hg = ctx.createLinearGradient(0, H * .6, 0, H);
  hg.addColorStop(0, 'rgba(160,90,10,0)'); hg.addColorStop(1, `rgba(160,70,5,${(.08 + .03 * Math.sin(t * .7)) * fade})`);
  ctx.fillStyle = hg; ctx.fillRect(0, H * .6, W, H * .4);
}

function vfxSacred(t, W, H, fade) {
  const hx = W / 2, hy = H * .27, hr = 80 + 25 * Math.sin(t * .85);
  for (let r = 5; r > 0; r--) {
    const gr = ctx.createRadialGradient(hx, hy, hr * r * .2, hx, hy, hr * r);
    gr.addColorStop(0, 'rgba(255,255,240,0)');
    gr.addColorStop(.7, `rgba(255,255,215,${.07 / r * fade})`);
    gr.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.beginPath(); ctx.arc(hx, hy, hr * r, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  }
  ps.forEach((p, i) => {
    p.x += p.vx * .5 + Math.sin(t * .7 + p.phase) * .2; p.y += p.vy * .55; p.life += .003;
    if (p.y < -40 || p.life > p.maxLife) { ps[i] = mkP(W, H); return; }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .8 * fade;
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
    gr.addColorStop(0, `rgba(255,255,248,${al})`); gr.addColorStop(1, 'rgba(230,225,200,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 6, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
  for (let j = 0; j < 4; j++) {
    const my = H * .45 + j * 85;
    const mg = ctx.createLinearGradient(0, my, 0, my + 130);
    mg.addColorStop(0, 'rgba(210,200,180,0)');
    mg.addColorStop(.5, `rgba(210,200,180,${(.045 + .012 * Math.sin(t + j * .9)) * fade})`);
    mg.addColorStop(1, 'rgba(210,200,180,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, my, W, 130);
  }
}

function vfxBattle(t, W, H, fade) {
  ps.forEach((p, i) => {
    p.x += p.vx + Math.sin(t * 2.8 + p.phase) * .55; p.y += p.vy * 1.7; p.life += .008;
    if (p.y < -40 || p.life > p.maxLife) {
      ps[i] = { ...mkP(W, H), x: W * .1 + Math.random() * W * .8, y: H * .55 + Math.random() * H * .45, vy: -(1.2 + Math.random() * 2.8) };
      return;
    }
    const al = Math.sin(p.life / p.maxLife * Math.PI) * .92 * fade;
    const tc = p.life / p.maxLife;
    const r = 255, g = Math.floor(200 * (1 - tc * .85)), b = Math.floor(40 * (1 - tc));
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4.5);
    gr.addColorStop(0, `rgba(${r},${g},${b},${al})`);
    gr.addColorStop(.6, `rgba(${r},${Math.floor(g * .4)},0,${al * .3})`);
    gr.addColorStop(1, 'rgba(140,25,0,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 4.5, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
  const fl = (.1 + .06 * Math.sin(t * 12 + Math.random() * .4)) * fade;
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .15, W / 2, H / 2, H * 1.2);
  vg.addColorStop(0, 'rgba(100,10,5,0)'); vg.addColorStop(1, `rgba(100,10,5,${fl})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ss.forEach((s, i) => {
    s.x += s.vx + Math.sin(t * .35 + s.phase) * .3; s.y += s.vy; s.life += .002;
    if (s.y < -150 || s.life > 1) { ss[i] = mkS(W, H); return; }
    const a = s.opacity * Math.sin(s.life * Math.PI) * fade;
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
    gr.addColorStop(0, `rgba(75,50,35,${a})`); gr.addColorStop(1, 'rgba(75,50,35,0)');
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
  });
}

function drawFrame(t, W, H, fade) {
  const pu = .55 + .45 * Math.sin(t * 1.3), sz = 68, pad = 18;
  ctx.save();
  ctx.strokeStyle = `rgba(201,168,76,${.8 * pu * fade})`; ctx.lineWidth = 2.2; ctx.lineCap = 'square';
  [[pad, pad, 1, 1], [W - pad, pad, -1, 1], [pad, H - pad, 1, -1], [W - pad, H - pad, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(x, y + dy * sz); ctx.lineTo(x, y); ctx.lineTo(x + dx * sz, y); ctx.stroke();
  });
  ctx.strokeStyle = `rgba(240,208,100,${.28 * pu * fade})`; ctx.lineWidth = .8;
  [[pad + 12, pad + 12, 1, 1], [W - pad - 12, pad + 12, -1, 1], [pad + 12, H - pad - 12, 1, -1], [W - pad - 12, H - pad - 12, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(x, y + dy * 36); ctx.lineTo(x, y); ctx.lineTo(x + dx * 36, y); ctx.stroke();
  });
  ctx.fillStyle = `rgba(240,208,100,${pu * fade})`;
  [[pad, pad], [W - pad, pad], [pad, H - pad], [W - pad, H - pad]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

// ═══ CHIPS ═══
function buildChips() {
  const el = document.getElementById('b-chips');
  SPOTS.forEach(s => {
    el.innerHTML += `<div class="chip" data-id="${s.id}"><div class="cd"></div>${s.icon} ${s.name}<span id="cd-${s.id}" style="margin-left:4px;font-size:9px;opacity:.5">---</span></div>`;
  });
}
function updateChips() {
  if (!userLat) return;
  SPOTS.forEach(s => {
    const d = hav(userLat, userLng, s.lat, s.lng);
    const el = document.getElementById(`cd-${s.id}`);
    if (el) el.textContent = d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`;
  });
}

// ═══ TOAST ═══
function showToast(icon, title, sub) {
  document.getElementById('t-icon').textContent = icon;
  document.getElementById('t-title').textContent = title;
  document.getElementById('t-sub').textContent = sub;
  const el = document.getElementById('toast');
  el.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ═══ MAIN LOOP ═══
function loop() {
  T += .016;
  smoothH = sAngle(smoothH, rawH, .08);
  checkAim();
  drawCompass();
  drawVFX(T);
  requestAnimationFrame(loop);
}
