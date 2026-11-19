// 畫面端：只負責畫圖與把滑鼠事件回報給主程序，行為邏輯都在 main.js。
const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { willReadFrequently: true });

let S = { state: 'idle', dir: 1, outfit: {} };
let stStart = performance.now();
let look = { x: 0, y: 0 };
let bubble = null;

function resize() {
  cv.width = Math.round(innerWidth * devicePixelRatio);
  cv.height = Math.round(innerHeight * devicePixelRatio);
}
addEventListener('resize', resize);
resize();

let fx = [], trail = [], lastSpar = null, counterSince = 0, kick = { t0: 0, mag: 0, dx: 0 };
pet.onState((s) => {
  if (s.state !== S.state) stStart = performance.now();
  const sp = s.outfit && s.outfit.spar, was = lastSpar;
  if (sp) {
    const at = cursorLogical();
    if (was && sp.hits > was.hits) {
      sparFx(sp, at, sp.hits - was.hits);
      kick = { t0: performance.now(), mag: 1.5 + Math.min(4, sp.combo / 6), dx: at.x < 100 ? 1 : -1 };   // 震一下、往遠離游標的方向後仰
    }
    if (was && sp.crits > was.crits) {
      fx.push({ kind: 'text', x: at.x, y: at.y - 22, text: '暴擊！', col: '#F5B82E', size: 24, t0: performance.now() });
      for (let i = 0; i < 14; i++) fx.push({ kind: 'spark', x: at.x, y: at.y, a: Math.random() * 6.28, v: 70 + Math.random() * 80, col: i % 2 ? '#F5B82E' : '#FFFFFF', t0: performance.now() });
      kick.mag += 3; beep(sp, 'crit');
    }
    if (was && sp.combo >= 10 && Math.floor(sp.combo / 10) > Math.floor(was.combo / 10)) {
      const n = Math.floor(sp.combo / 10) * 10, names = { 10: '十', 20: '二十', 30: '三十', 40: '四十', 50: '五十' };
      fx.push({ kind: 'milestone', text: `${names[n] || n}連擊！`, t0: performance.now() });
      beep(sp, 'milestone', n);
    }
    if (was && was.combo >= 5 && sp.combo === 1) fx.push({ kind: 'text', x: 100, y: 60, text: '連擊中斷', col: '#8A7A66', size: 15, t0: performance.now() });
    if (sp.counter && !(was && was.counter)) counterSince = performance.now();
    if (was && sp.hearts < was.hearts) { fx.push({ kind: 'hurt', t0: performance.now() }); beep(sp, 'hurt'); kick = { t0: performance.now(), mag: 7, dx: 0 }; }
    if (was && sp.blocks > was.blocks) { fx.push({ kind: 'block', x: at.x, y: at.y, t0: performance.now() }); beep(sp, 'block'); }
  }
  if (!sp && was && s.state === 'fireworks') beep(was, 'win');
  lastSpar = sp || null;
  S = s;
});
// ---- 鬥法回饋：在游標的位置爆出火花；法術是從游標飛向牠的符，劍是一道劍痕
let mouseAt = null;
addEventListener('mousemove', (e) => {
  const k = innerWidth / 200;
  mouseAt = { x: e.clientX / k, y: e.clientY / k, t: performance.now() };
  if (S.state === 'sword') { trail.push({ x: mouseAt.x, y: mouseAt.y, t: mouseAt.t }); if (trail.length > 24) trail.shift(); }
});
function cursorLogical() {
  if (mouseAt && performance.now() - mouseAt.t < 600) return mouseAt;
  if (cursorAt) { const k = innerWidth / 200; return { x: cursorAt.x / k, y: cursorAt.y / k }; }
  return { x: 100, y: 120 };
}
const ELEM = [['#B48CFF', '雷'], ['#FF7A45', '火'], ['#7FD8FF', '冰']];
function sparFx(sp, at, n) {
  const t0 = performance.now();
  if (sp.kind === 'spell') {
    const [col, name] = ELEM[sp.hits % 3];
    fx.push({ kind: 'bolt', x0: at.x, y0: at.y, col, name, t0 });
    beep(sp, 'zap');
  } else {
    for (let i = 0; i < 8; i++) fx.push({ kind: 'spark', x: at.x, y: at.y, a: Math.random() * 6.28, v: 40 + Math.random() * 60, col: i % 2 ? '#FFFFFF' : '#F5B82E', t0 });
    beep(sp, 'clang');
  }
  if (n > 1) fx.push({ kind: 'text', x: at.x, y: at.y - 10, text: '擋！', col: '#59C9A5', t0 });
}
// 小小的音效（WebAudio，不用音檔）；右鍵「鬥法音效」可以關
let ac = null;
function beep(sp, kind, n) {
  if (!sp || !sp.sound) return;
  try {
    ac = ac || new AudioContext();
    const t = ac.currentTime, g = ac.createGain(); g.connect(ac.destination);
    const tone = (type, f0, f1, dur, vol, delay = 0) => {
      const o = ac.createOscillator(), gg = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
      gg.gain.setValueAtTime(vol, t + delay); gg.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(gg); gg.connect(g); o.start(t + delay); o.stop(t + delay + dur + 0.02);
    };
    const up = 1 + Math.min(30, sp.combo || 0) * 0.025;   // 連擊越高，聲音越高越亮
    if (kind === 'zap') tone('square', 900 * up, 180 * up, 0.12, 0.05);
    else if (kind === 'clang') { tone('triangle', 2400 * up, 1800 * up, 0.18, 0.07); tone('sine', 3700 * up, 3300 * up, 0.12, 0.04); }
    else if (kind === 'crit') { tone('sawtooth', 300, 60, 0.3, 0.08); tone('triangle', 1800, 2600, 0.2, 0.06, 0.03); }
    else if (kind === 'milestone') { const base = 440 * (1 + (n || 10) / 40); [1, 1.25, 1.5, 2].forEach((m, i) => tone('triangle', base * m, base * m, 0.14, 0.07, i * 0.06)); }
    else if (kind === 'block') { tone('sine', 880, 880, 0.12, 0.08); tone('sine', 1320, 1320, 0.18, 0.06, 0.08); }
    else if (kind === 'hurt') tone('sine', 220, 90, 0.25, 0.12);
    else if (kind === 'win') [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.18, 0.07, i * 0.1));
  } catch { /* 沒有音效裝置就算了 */ }
}
let blinkSeen = 0, blinkFx = 0, puffs = [];
function drawMotion(ctx, now) {
  const sp = S.outfit && S.outfit.spar;
  if (!sp) { puffs = []; return; }
  if (sp.blinkAt && sp.blinkAt !== blinkSeen) { blinkSeen = sp.blinkAt; blinkFx = now; }
  const vx = sp.vx || 0, vy = sp.vy || 0, v = Math.hypot(vx, vy);
  ctx.save();
  if (v > 3) {   // 殘影：身後兩三個半透明的影子，越遠越淡
    const ux = vx / v, uy = vy / v;
    for (let i = 3; i >= 1; i--) {
      ctx.save(); ctx.globalAlpha = 0.12 * (4 - i);
      ctx.translate(-ux * i * Math.min(16, v * 1.2), -uy * i * Math.min(16, v * 1.2));
      drawPet(ctx, { state: S.state, dir: S.dir, outfit: S.outfit, look: { x: 0, y: 0 }, t: now / 1000, st: 1, mini: true });
      ctx.restore();
    }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#59C9A5'; ctx.lineWidth = 2; ctx.lineCap = 'round';   // 氣流
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * 12, x = 100 - ux * 30 + -uy * off, y = 150 - uy * 30 + ux * off;
      const len = Math.min(60, v * 4) * (0.6 + 0.4 * Math.sin(now / 60 + i));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * len, y - uy * len); ctx.stroke();
    }
  }
  if (sp.running && Math.random() < 0.5) puffs.push({ x: 100 + (Math.random() - 0.5) * 30, y: 186, t0: now });   // 踏雲：腳下冒小雲
  puffs = puffs.filter((p) => now - p.t0 < 500);
  for (const p of puffs) {
    const q = (now - p.t0) / 500;
    ctx.globalAlpha = 0.7 * (1 - q); ctx.fillStyle = '#F3F7F2'; ctx.strokeStyle = '#9CC9BE'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x - (sp.vx || 0) * q * 3, p.y - q * 8, 5 + q * 7, 0, 6.28); ctx.fill(); ctx.stroke();
  }
  if (now - blinkFx < 600) {   // 縮地成寸：出現的地方一圈結界、八道光
    const q = (now - blinkFx) / 600;
    ctx.globalAlpha = 1 - q; ctx.strokeStyle = '#59C9A5'; ctx.lineWidth = 4 * (1 - q) + 1;
    ctx.beginPath(); ctx.arc(100, 150, 18 + q * 70, 0, 6.28); ctx.stroke();
    ctx.strokeStyle = '#F5B82E'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(100 + Math.cos(a) * 20, 150 + Math.sin(a) * 20); ctx.lineTo(100 + Math.cos(a) * (30 + q * 60), 150 + Math.sin(a) * (30 + q * 60)); ctx.stroke(); }
  }
  ctx.restore();
}
function drawSparHud(ctx, now) {
  const sp = S.outfit && S.outfit.spar;
  // 特效：火花、符、劍痕
  fx = fx.filter((f) => now - f.t0 < (f.kind === 'milestone' ? 1000 : 700));
  for (const f of fx) {
    const p = (now - f.t0) / (f.kind === 'milestone' ? 1000 : 700);
    ctx.save();
    if (f.kind === 'spark') {
      ctx.globalAlpha = 1 - p; ctx.fillStyle = f.col;
      ctx.beginPath(); ctx.arc(f.x + Math.cos(f.a) * f.v * p, f.y + Math.sin(f.a) * f.v * p, 3 * (1 - p) + 1, 0, 6.28); ctx.fill();
    } else if (f.kind === 'bolt') {   // 一張符從游標飛到牠身上，炸開
      const q = Math.min(1, p * 3), x = f.x0 + (100 - f.x0) * q, y = f.y0 + (140 - f.y0) * q;
      if (q < 1) { ctx.translate(x, y); ctx.rotate(q * 8); ctx.fillStyle = '#F7D154'; ctx.strokeStyle = '#4A3A2A'; ctx.lineWidth = 1.5; ctx.fillRect(-5, -8, 10, 16); ctx.strokeRect(-5, -8, 10, 16); }
      else {
        const r = (p - 0.33) * 60; ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(100, 140, r, 0, 6.28); ctx.stroke();
        ctx.fillStyle = f.col; ctx.font = 'bold 16px "Microsoft JhengHei"'; ctx.textAlign = 'center'; ctx.fillText(f.name, 100 + r * 0.6, 140 - r * 0.6);
      }
    } else if (f.kind === 'text' || f.kind === 'block') {
      ctx.globalAlpha = 1 - p; ctx.fillStyle = f.col || '#59C9A5'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
      ctx.font = `bold ${f.size || 18}px "Microsoft JhengHei"`; ctx.textAlign = 'center';
      const sc = f.size && f.size > 20 ? 1 + Math.max(0, 0.3 - p) : 1;
      ctx.translate(f.x, f.y - p * 20); ctx.scale(sc, sc);
      ctx.strokeText(f.text || '擋！', 0, 0); ctx.fillText(f.text || '擋！', 0, 0);
    } else if (f.kind === 'milestone') {
      ctx.globalAlpha = 1 - p * p; ctx.strokeStyle = '#F5B82E'; ctx.lineWidth = 5 * (1 - p);
      ctx.beginPath(); ctx.arc(100, 140, 20 + p * 90, 0, 6.28); ctx.stroke();
      ctx.font = 'bold 26px "DFKai-SB","KaiTi","Microsoft JhengHei"'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#FFFFFF';
      ctx.fillStyle = '#E5484D'; const s2 = 1 + Math.max(0, 0.25 - p) * 2;
      ctx.translate(100, 56); ctx.scale(s2, s2); ctx.strokeText(f.text, 0, 0); ctx.fillText(f.text, 0, 0);
    } else if (f.kind === 'hurt') {   // 被打中：整個畫面邊緣紅一下
      ctx.globalAlpha = (1 - p) * 0.5; ctx.strokeStyle = '#E5484D'; ctx.lineWidth = 10; ctx.strokeRect(4, 4, 192, 192);
    }
    ctx.restore();
  }
  // 劍痕
  trail = trail.filter((p) => now - p.t < 260);
  if (S.state === 'sword' && trail.length > 1) {
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = 1 - (now - trail[i].t) / 260;
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1 + a * 6;
      ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
    }
    ctx.restore();
  }
  if (!sp) return;
  // 上方：進度條、連擊數、三顆心
  ctx.save();
  const pr = Math.min(1, sp.hits / sp.need);
  ctx.fillStyle = 'rgba(74,58,42,0.55)'; ctx.beginPath(); ctx.roundRect(40, 6, 120, 8, 4); ctx.fill();
  ctx.fillStyle = pr >= 1 ? '#F5B82E' : '#59C9A5'; ctx.beginPath(); ctx.roundRect(40, 6, 120 * pr, 8, 4); ctx.fill();
  const big = 1 + Math.min(0.8, sp.hits / 30);
  ctx.font = `bold ${Math.round(15 * big)}px "Microsoft JhengHei"`; ctx.textAlign = 'right';
  ctx.lineWidth = 3; ctx.strokeStyle = '#FFFFFF'; ctx.fillStyle = sp.hits >= sp.need ? '#E5484D' : '#4A3A2A';
  const cb = sp.combo || 0, bigc = 1 + Math.min(0.9, cb / 25);
  ctx.font = `bold ${Math.round(15 * bigc)}px "Microsoft JhengHei"`; ctx.fillStyle = cb >= 20 ? '#E5484D' : cb >= 10 ? '#C9901A' : '#4A3A2A';
  ctx.strokeText(`${cb}連擊`, 196, 34); ctx.fillText(`${cb}連擊`, 196, 34);
  ctx.font = 'bold 11px "Microsoft JhengHei"'; ctx.fillStyle = '#4A3A2A'; ctx.strokeText(`共 ${sp.hits}`, 196, 48); ctx.fillText(`共 ${sp.hits}`, 196, 48);
  ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i < sp.hearts ? '#E5484D' : 'rgba(74,58,42,0.3)'; ctx.fillText('♥', 6 + i * 14, 30); }
  // 反擊預告：紅光一圈，越來越亮，提醒你快出手
  if (sp.counter) {
    const q = Math.min(1, (now - counterSince) / 800);
    ctx.globalAlpha = 0.35 + q * 0.5; ctx.strokeStyle = '#E5484D'; ctx.lineWidth = 3 + q * 4;
    ctx.beginPath(); ctx.arc(100, 140, 62 - q * 14, 0, 6.28); ctx.stroke();
    ctx.globalAlpha = 1; ctx.font = 'bold 15px "Microsoft JhengHei"'; ctx.textAlign = 'center'; ctx.fillStyle = '#E5484D';
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
    const tip = sp.kind === 'spell' ? '快點！擋！' : '快揮！擋！';
    ctx.strokeText(tip, 100, 78); ctx.fillText(tip, 100, 78);
  }
  ctx.restore();
}
pet.onCursor((c) => { look = c; });
let cursorAt = null;   // 游標在視窗裡的位置（主程序每格送來），滑鼠沒動時也知道
pet.onCursorAt((c) => { cursorAt = c; });
pet.onSay((text) => { bubble = { text, start: performance.now() }; });

let due = 0;   // 下一格該畫的時間
function frame(now) {
  requestAnimationFrame(frame);
  // 每秒 90 格：用時間累計決定這一格要不要畫，144 Hz 螢幕上會隔一格、隔兩格交錯，平均剛好 90；螢幕更慢時就照螢幕
  if (now < due - 1) return;
  due += 1000 / 90;
  if (now - due > 1000 / 90) due = now;   // 落後太多（例如視窗剛被叫醒）就從現在重新算，不要一口氣補畫
  const k = cv.width / 200;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 200, 200);   // 先清乾淨，再抖
  const kp = (now - kick.t0) / 140;   // 被打中的一瞬間：畫面抖一下、身體往後仰
  if (kp < 1) {
    const m = kick.mag * (1 - kp);
    ctx.translate((Math.random() - 0.5) * m + kick.dx * m * 0.8, (Math.random() - 0.5) * m);
  }
  if (bubble && now - bubble.start > 3200) bubble = null;
  drawMotion(ctx, now);   // 鬥法移動時的殘影、氣流、踏雲（畫在牠身後）
  drawPet(ctx, {
    state: S.state, dir: S.dir, outfit: S.outfit, look,
    t: now / 1000, st: (now - stStart) / 1000,
    bubble: bubble && { text: bubble.text, age: (now - bubble.start) / 1000 },
  });
  drawSparHud(ctx, now);
  pet.send('frame');   // 請主程序把視窗移到這一格的位置
  // 滑鼠不動、角色自己走到游標底下（或走開）時不會有 mousemove，所以每格用游標位置再判斷一次
  if (!down && cursorAt) {
    const h = opaqueXY(cursorAt.x, cursorAt.y);
    if (h !== hit) { hit = h; pet.send('hit', h); }
  }
}
requestAnimationFrame(frame);

// 只有游標在角色的不透明像素上才攔截滑鼠，其餘區域點擊會穿透到桌面。
function opaqueAt(e) { return opaqueXY(e.clientX, e.clientY); }
function opaqueXY(cx, cy) {
  const x = Math.round(cx * devicePixelRatio), y = Math.round(cy * devicePixelRatio);
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return false;
  return ctx.getImageData(x, y, 1, 1).data[3] > 20;
}

let hit = null, down = null, dragging = false;
addEventListener('mousemove', (e) => {
  if (down && !dragging && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
    dragging = true; clearTimeout(holdTimer);
    pet.send('drag-start');
  }
  if (down) return;
  const h = opaqueAt(e);
  if (h !== hit) { hit = h; pet.send('hit', h); }
  if (h) watchSwipe(e);
});
// 游標在身上左右揮：方向一換、而且這一趟走了 30 以上，就算揮一劍
let swipeX = null, swipeDir = 0, swipeFrom = 0, swipeT = 0;
function watchSwipe(e) {
  const x = e.clientX / (innerWidth / 200), t = performance.now();
  if (swipeX === null || t - swipeT > 400) { swipeX = x; swipeFrom = x; swipeDir = 0; swipeT = t; return; }
  const d = x - swipeX;
  if (Math.abs(d) < 2) return;
  const dir = d > 0 ? 1 : -1;
  if (swipeDir && dir !== swipeDir) {
    if (Math.abs(swipeX - swipeFrom) >= 30) pet.send('swipe');
    swipeFrom = swipeX;
  }
  swipeDir = dir; swipeX = x; swipeT = t;
}
addEventListener('mouseleave', () => {
  if (down || hit === false) return;
  if (cursorAt && opaqueXY(cursorAt.x, cursorAt.y)) return;   // 游標其實還在身上（例如換游標造型時的假離開）
  hit = false; pet.send('hit', false);
});
// 按住不放半秒（沒有拖動）：叫出快捷輪盤。滑鼠中鍵點牠：直接施展奧義
let holdTimer = null, held = false;
addEventListener('mousedown', (e) => {
  if (e.button === 1 && opaqueAt(e)) { e.preventDefault(); pet.send('ult'); return; }
  if (e.button !== 0 || !opaqueAt(e)) return;
  down = { x: e.screenX, y: e.screenY };
  dragging = false; held = false;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { if (down && !dragging) { held = true; pet.send('hold'); } }, 500);
});
// 點到身體的哪個部位（角色座標：身體中心約在 (0,-32)，臉朝 +x）
function zoneAt(e) {
  const k = innerWidth / 200, x = e.clientX / k, y = e.clientY / k;
  const lx = (x - 100) * (S.dir < 0 ? -1 : 1), ly = y - 186;
  const sp = (S.outfit && S.outfit.species) || 'cat';
  const laugh = {   // 每個角色藏一個笑穴
    cat: lx > -1 && lx < 13 && ly > -24 && ly < -15,      // 下巴
    fox: lx < -58,                                         // 尾巴尖
    rabbit: ly < -86,                                      // 耳朵尖
    panda: Math.abs(lx) < 8 && ly > -14 && ly < -4,        // 肚臍
    dragon: ly < -66 && Math.abs(lx) < 26,                 // 龍角
  }[sp];
  if (laugh) return 'laugh';
  if (lx < -38) return 'tail';
  if (ly < -56) return 'ear';
  if (Math.abs(lx - 6) < 12 && ly < -43) return 'head';
  if (ly > -8) return 'feet';
  if (Math.abs(lx) < 26 && ly > -24) return 'belly';
  return 'body';
}
addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !down) return;
  clearTimeout(holdTimer);
  if (dragging) pet.send('drag-end'); else if (!held) pet.send('click', zoneAt(e));
  down = null; dragging = false; held = false;
});

// 游標造型：平常移到身上是一隻摸頭的手；鬥法時變成一把劍
function cursorImg(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'sword') {
    g.translate(4, 4); g.rotate(Math.PI / 4);
    g.fillStyle = '#E8F4F8'; g.strokeStyle = '#4A3A2A'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -2); g.lineTo(26, -2); g.lineTo(30, 0); g.lineTo(26, 2); g.lineTo(0, 2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#F5B82E'; g.fillRect(-3, -6, 4, 12); g.strokeRect(-3, -6, 4, 12);
    g.fillStyle = '#5FB7A0'; g.fillRect(-9, -2, 6, 4);
    return `url(${c.toDataURL()}) 4 4, crosshair`;
  }
  if (kind === 'talisman') {   // 黃符：比法術時
    g.translate(16, 16); g.rotate(-0.4);
    g.fillStyle = '#F7D154'; g.strokeStyle = '#4A3A2A'; g.lineWidth = 1.5;
    g.fillRect(-6, -13, 12, 26); g.strokeRect(-6, -13, 12, 26);
    g.strokeStyle = '#E5484D'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-2, -9); g.lineTo(2, -5); g.lineTo(-2, -1); g.lineTo(2, 3); g.lineTo(-2, 7); g.stroke();
    return `url(${c.toDataURL()}) 16 16, pointer`;
  }
  g.fillStyle = '#FFF3D6'; g.strokeStyle = '#4A3A2A'; g.lineWidth = 1.6;   // 手掌
  g.beginPath(); g.ellipse(16, 19, 9, 8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  for (const [x, y] of [[9, 9], [14, 6], [19, 6], [24, 9]]) { g.beginPath(); g.ellipse(x, y + 2, 2.8, 4.2, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.fillStyle = '#FFB4A8'; g.beginPath(); g.ellipse(16, 20, 4, 3, 0, 0, Math.PI * 2); g.fill();
  return `url(${c.toDataURL()}) 16 16, pointer`;
}
const CURSOR = { hand: cursorImg('hand'), sword: cursorImg('sword'), talisman: cursorImg('talisman') };
let cursorNow = '';
setInterval(() => {   // 只有真的要換造型時才換（一直重設會讓視窗以為滑鼠離開了）
  const want = S.state === 'sword' ? CURSOR.sword : S.state === 'spell' ? CURSOR.talisman : CURSOR.hand;
  if (want !== cursorNow) { cursorNow = want; document.body.style.cursor = want; }
}, 150);
addEventListener('contextmenu', (e) => { e.preventDefault(); pet.send('menu'); });
addEventListener('wheel', (e) => { if (opaqueAt(e)) pet.send('roll', e.deltaY > 0 ? 1 : -1); }, { passive: true });
