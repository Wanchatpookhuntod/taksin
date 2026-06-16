// ═══ SPOTS ═══
const SPOTS = [
  { id: "prang",    name: "พระปรางค์สามยอด", desc: "ศูนย์กลางพลังขอม",   lat: 14.802964261273392, lng: 100.61404536171183, icon: "🏛️", vfx: "golden" },
  { id: "menument", name: "วงเวียนสระแก้ว",       desc: "ใจกลางเมือง",  lat: 14.799881897215414, lng: 100.634216288860815, icon: "⛩️", vfx: "sacred" },
  { id: "wang",     name: "วังนารายณ์",       desc: "ฐานบัญชาการตากสิน", lat: 14.799821766651421, lng: 100.6106419908688, icon: "⚔️", vfx: "battle" },
  { id: "lotus",    name: "สถานที่บัว",        desc: "ดินแดนแห่งบัวงาม",  lat: 14.80470016742224,  lng: 100.66359567877893, icon: "🪷", vfx: "lotus" },
];
const VFX_LABELS = { golden: "✦ SACRED LIGHT", sacred: "◈ RELIC AURA", battle: "⚔ BATTLE FIRE", lotus: "🪷 LOTUS BLOOM" };
const AIM_DEG = 22, UNLOCK_M = 200;

// ═══ STATE ═══
let userLat = null, userLng = null, rawH = 0, smoothH = 0;
let aimedSpot = null, activeVFX = null, vfxFade = 0;
let unlocked = {}, toastTimer = null, T = 0;
let ps = [], ss = [];
let headingOffset = parseInt(localStorage.getItem('headingOffset') || '0', 10);
let hBuf = [], compassAccuracy = 1;
let hwAccuracy = -1;              // iOS ฮาร์ดแวร์: 0-1 (-1 = ไม่รู้)
let prevRawH = null, turnRate = 0; // ความเร็วหมุน — แยก motion ออกจาก noise
let screenAngle = 0;             // มุมหมุนหน้าจอ — ชดเชย portrait/landscape
let compassUnreliable = false;   // Android fallback ที่ไม่ใช่ทิศเหนือจริง

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
function readScreenAngle() {
  screenAngle = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (window.orientation || 0);
}
function startCompass() {
  readScreenAngle();
  addEventListener('orientationchange', readScreenAngle);

  const handleIOS = e => {
    if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
      // webkitCompassHeading = ทิศจริงที่ขอบบนเครื่องชี้ (CW) — ชดเชยการหมุนจอ
      rawH = (e.webkitCompassHeading + screenAngle + headingOffset + 720) % 360;
      // เก็บความแม่นยำฮาร์ดแวร์แยกไว้ ไม่ให้ถูก variance เขียนทับ
      hwAccuracy = e.webkitCompassAccuracy >= 0
        ? Math.max(0, 1 - e.webkitCompassAccuracy / 45)
        : -1;
    }
  };
  const handleAbsolute = e => {
    if (e.alpha !== null)
      rawH = ((360 - e.alpha) + screenAngle + headingOffset + 720) % 360;
  };

  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    // iOS — requires permission prompt
    DeviceOrientationEvent.requestPermission()
      .then(s => { if (s === 'granted') addEventListener('deviceorientation', handleIOS); })
      .catch(() => {});
  } else {
    // Android — deviceorientationabsolute ให้ทิศเหนือจริง (magnetic north)
    // ถ้าไม่รองรับจึง fallback ไป deviceorientation
    let gotAbsolute = false;
    addEventListener('deviceorientationabsolute', e => {
      gotAbsolute = true;
      handleAbsolute(e);
    });
    setTimeout(() => {
      if (gotAbsolute) return;
      // fallback: deviceorientation ธรรมดาจะอ้างอิงทิศเหนือจริงก็ต่อเมื่อ e.absolute === true
      // ถ้าไม่ absolute ทิศจะเพี้ยน — เตือนผู้ใช้ให้ปรับ offset เอง
      addEventListener('deviceorientation', e => {
        compassUnreliable = !e.absolute;
        handleAbsolute(e);
      });
    }, 500);
  }
}

// ═══ COMPASS ACCURACY ═══
function updateAccuracy() {
  // ความเร็วการหมุน (°/เฟรม) — แยก "ผู้ใช้หมุนเครื่อง" ออกจาก "เซนเซอร์สั่น"
  if (prevRawH !== null) turnRate = turnRate * 0.8 + Math.abs(adiff(prevRawH, rawH)) * 0.2;
  prevRawH = rawH;
  const turning = turnRate > 1.2; // ~>72°/วิ = กำลังหมุนหาสปอตปกติ

  hBuf.push(rawH);
  if (hBuf.length > 20) hBuf.shift();
  if (hBuf.length >= 8 && !turning) {
    // circular mean resultant length — 1=เสถียร 0=สั่น
    const sx = hBuf.reduce((s, h) => s + Math.sin(h * Math.PI / 180), 0);
    const cx = hBuf.reduce((s, h) => s + Math.cos(h * Math.PI / 180), 0);
    const stability = Math.sqrt(sx * sx + cx * cx) / hBuf.length;
    // รวมกับความแม่นยำฮาร์ดแวร์ iOS (ถ้ามี) — ไม่ให้ตัวใดเขียนทับอีกตัว
    const target = hwAccuracy >= 0 ? Math.min(stability, hwAccuracy) : stability;
    compassAccuracy = compassAccuracy * 0.7 + target * 0.3; // เปลี่ยนแบบนุ่มนวล
  }
  // ขณะหมุน: คงค่าเดิม ไม่เตือน calibration ผิดพลาด
  const ok = compassAccuracy >= 0.75 && !compassUnreliable;
  const btn = document.getElementById('cal-btn');
  if (btn) btn.classList.toggle('warn', !ok && !turning);

  // อัปเดต accuracy bar ใน panel
  const bar = document.getElementById('cal-acc-fill');
  if (bar) {
    const pct = compassUnreliable ? Math.min(compassAccuracy, 0.4) : compassAccuracy;
    bar.style.width = `${Math.round(pct * 100)}%`;
    bar.style.background = pct > 0.85 ? '#4CAF50' : pct > 0.65 ? '#FFC107' : '#F44336';
  }
  const calH = document.getElementById('cal-heading');
  if (calH) calH.textContent = `${Math.round(smoothH)}°`;

  // feedback ระหว่างหมุนเลข 8 — ผูกกับค่าความเสถียรจริง
  const hint = document.getElementById('cal-fig8-hint');
  const phone = document.getElementById('cal-phone');
  if (hint) {
    if (compassUnreliable) {
      hint.innerHTML = '⚠ เซนเซอร์ไม่ให้ทิศเหนือจริง<br>ปรับ offset ด้วยมือ';
      hint.style.color = '#F44336';
    } else if (compassAccuracy > 0.85) {
      hint.innerHTML = '✓ เซนเซอร์เสถียรแล้ว';
      hint.style.color = '#7CCF80';
    } else if (compassAccuracy > 0.65) {
      hint.innerHTML = 'เกือบเสถียรแล้ว…<br>หมุนเลข 8 ต่ออีกนิด';
      hint.style.color = '#E0C060';
    } else {
      hint.innerHTML = 'กำลัง calibrate…<br>หมุนโทรศัพท์เป็นรูปเลข 8';
      hint.style.color = '#E08080';
    }
  }
  if (phone) phone.classList.toggle('stable', compassAccuracy > 0.85 && !compassUnreliable);
}

// ═══ CALIBRATION ═══
function openCal() {
  const panel = document.getElementById('cal-panel');
  panel.style.display = 'flex';
  document.getElementById('cal-offset-val').textContent = fmtOffset(headingOffset);
}
function closeCal() {
  document.getElementById('cal-panel').style.display = 'none';
}
function adjustOffset(delta) {
  headingOffset += delta;
  if (headingOffset > 180) headingOffset -= 360;
  if (headingOffset < -180) headingOffset += 360;
  localStorage.setItem('headingOffset', headingOffset);
  document.getElementById('cal-offset-val').textContent = fmtOffset(headingOffset);
}
function resetOffset() {
  headingOffset = 0;
  localStorage.setItem('headingOffset', 0);
  document.getElementById('cal-offset-val').textContent = '0°';
}
function fmtOffset(v) { return `${v > 0 ? '+' : ''}${v}°`; }

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
  else if (activeVFX === 'lotus')  vfxLotus(t, W, H, fade);

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

// วาดกลีบบัวหนึ่งกลีบ (รูปทรงรี-แหลม เหมือนกลีบบัว/ซากุระ)
function drawPetal(ctx, x, y, rx, ry, angle, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  // กลีบบัว: โค้งด้านล่างกว้าง ปลายแหลมด้านบน
  ctx.moveTo(0, -ry);
  ctx.bezierCurveTo( rx * 1.1,  -ry * 0.5,  rx,  ry * 0.6,  0,  ry);
  ctx.bezierCurveTo(-rx,         ry * 0.6, -rx * 1.1, -ry * 0.5,  0, -ry);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // เส้นกลางกลีบ (ลายเส้นบาง)
  ctx.beginPath();
  ctx.moveTo(0, -ry * 0.9);
  ctx.lineTo(0,  ry * 0.8);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

function mkLotus(W, H) {
  const colors = [
    'rgba(255,182,215,1)', // ชมพูอ่อน
    'rgba(240,160,200,1)', // ชมพูกลาง
    'rgba(255,210,230,1)', // ชมพูซีด
    'rgba(220,130,180,1)', // ม่วงชมพู
    'rgba(255,240,248,1)', // ขาวชมพู
  ];
  return {
    x: Math.random() * W,
    y: -20 - Math.random() * 60,
    vx: (Math.random() - 0.5) * 0.8,
    vy: 0.6 + Math.random() * 1.0,
    rx: 5 + Math.random() * 7,
    ry: 9 + Math.random() * 10,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.04,
    swing: (Math.random() - 0.5) * 0.012,
    phase: Math.random() * Math.PI * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: 0.5 + Math.random() * 0.5,
    life: 0,
  };
}

function vfxLotus(t, W, H, fade) {
  // พื้นหลังรัศมีสีชมพูอ่อน
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, H * 0.05, W / 2, H * 0.4, H * 0.9);
  bg.addColorStop(0, `rgba(255,200,230,${0.08 * fade})`);
  bg.addColorStop(0.5, `rgba(220,140,190,${0.05 * fade})`);
  bg.addColorStop(1, 'rgba(180,80,140,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // reinit เป็นกลีบบัวถ้า ps[] ยังเป็น particle แบบเดิม
  if (!ps.length || ps[0].rx === undefined) {
    ps = Array.from({ length: 80 }, () => { const p = mkLotus(W, H); p.y = Math.random() * H; return p; });
  }

  ps.forEach((p, i) => {
    p.angle += p.spin;
    p.vx    += p.swing * Math.sin(t * 0.9 + p.phase);
    p.x     += p.vx + Math.sin(t * 0.6 + p.phase) * 0.4;
    p.y     += p.vy;
    p.life  += 0.004;

    if (p.y > H + 30) { ps[i] = mkLotus(W, H); return; }

    const al = Math.min(1, p.life * 8) * p.alpha * fade;
    drawPetal(ctx, p.x, p.y, p.rx, p.ry, p.angle, p.color, al);
  });

  // ประกายแสงลอยขึ้น (shimmer)
  ss.forEach((s, i) => {
    s.x += s.vx + Math.sin(t * 0.5 + s.phase) * 0.3; s.y += s.vy; s.life += 0.003;
    if (s.y < -80 || s.life > 1) { ss[i] = mkS(W, H); return; }
    const a = s.opacity * Math.sin(s.life * Math.PI) * fade * 0.6;
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
    gr.addColorStop(0, `rgba(255,200,230,${a})`); gr.addColorStop(1, 'rgba(220,140,190,0)');
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
  // smoothing แบบ adaptive — ห่างมากตามเร็ว (ไม่หน่วง), ใกล้แล้วตามช้า (นิ่ง)
  const d = Math.abs(adiff(smoothH, rawH));
  const k = d > 30 ? 0.30 : d > 10 ? 0.16 : 0.07;
  smoothH = sAngle(smoothH, rawH, k);
  updateAccuracy();
  checkAim();
  drawCompass();
  drawVFX(T);
  requestAnimationFrame(loop);
}
