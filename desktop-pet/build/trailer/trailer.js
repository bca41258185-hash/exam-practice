// 桌面靈寵預告片：render(T) 依時間 T（秒）把整個畫面畫到 1920x1080 的畫布上。
// 角色全部用 ../../draw.js 的 drawPet 畫，所以和程式裡看到的一模一樣。
/* global drawPet */
const W = 1920, H = 1080, DUR = 108;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const KAI = '"AR PL UKai TW","DFKai-SB","BiauKai","KaiTi",serif';
const SANS = '"Noto Sans CJK TC","Microsoft JhengHei","PingFang TC",sans-serif';
const GOLD = '#F6D98A', INK = '#4A3A2A';

// ---------- 小工具 ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const eOut = (p) => 1 - Math.pow(1 - p, 3);
const eIn = (p) => p * p * p;
const eIO = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const eBack = (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const fade = (t, a, b, fi = 0.5, fo = 0.5) => Math.min(seg(t, a, a + fi), 1 - seg(t, b - fo, b));
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

function text(str, x, y, size, o = {}) {
  ctx.save();
  ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  ctx.font = `${o.weight || 'bold'} ${size}px ${o.font || KAI}`;
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.blur || 30; }
  if (o.stroke) { ctx.lineWidth = o.sw || 8; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(str, x, y);
  ctx.restore();
}
// 旁白：一個字一個字浮出來
function narr(str, T, a, b, y = 950, size = 58, color = '#F2EBDD') {
  const al = fade(T, a, b, 0.3, 0.6);
  if (al <= 0) return;
  ctx.save();
  ctx.font = `bold ${size}px ${KAI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const gap = size * 0.08, chars = [...str];
  const ws = chars.map((c) => ctx.measureText(c).width + gap);
  let x = W / 2 - ws.reduce((s, w) => s + w, 0) / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 18;
  chars.forEach((c, i) => {
    const p = seg(T, a + i * 0.07, a + i * 0.07 + 0.35);
    ctx.globalAlpha = al * p; ctx.fillStyle = color;
    ctx.fillText(c, x, y + (1 - eOut(p)) * 14);
    x += ws[i];
  });
  ctx.restore();
}
function pet(o, x, y, s) {
  ctx.save();
  ctx.translate(x - 100 * s, y - 188 * s); ctx.scale(s, s);
  drawPet(ctx, Object.assign({ dir: 1, look: { x: 0, y: 0 } }, o));
  ctx.restore();
}
const FIT = {
  cat: { species: 'cat', hat: 'douli', robe: 'qing', gear: 'sword' },
  fox: { species: 'fox', hat: 'mask', robe: 'fei', gear: 'fan' },
  rabbit: { species: 'rabbit', hat: 'wreath', robe: 'yuebai', gear: 'gourd' },
  panda: { species: 'panda', hat: 'jin', robe: 'mo', gear: 'none' },
  dragon: { species: 'dragon', hat: 'guan', robe: 'jin', gear: 'none' },
};
const fit = (k, extra) => Object.assign({ realm: 0 }, FIT[k], extra);

// ---------- 背景 ----------
function grad(c0, c1, y0 = 0, y1 = H) {
  const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
const STARS = (() => { const r = rng(7); return Array.from({ length: 260 }, () => [r() * W, r() * H * 0.72, r() * 1.8 + 0.4, r() * 6.28]); })();
function stars(T, a = 1) {
  ctx.save(); ctx.fillStyle = '#fff';
  for (const [x, y, r, ph] of STARS) { ctx.globalAlpha = a * (0.45 + 0.4 * Math.sin(T * 1.3 + ph)); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); }
  ctx.restore();
}
function moon(x, y, r, a = 1) {
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3.2);
  g.addColorStop(0, 'rgba(250,236,190,0.30)'); g.addColorStop(1, 'rgba(250,236,190,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#F7EBC4'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  ctx.fillStyle = 'rgba(214,190,140,0.5)';
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.17], [0.25, 0.15, 0.11], [-0.05, 0.4, 0.08]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 6.28); ctx.fill(); }
  ctx.restore();
}
function ridge(base, amp, seed, color, a = 1, shift = 0) {
  const r = rng(seed), ph = [r() * 6, r() * 6, r() * 6];
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) {
    const u = (x + shift) / W;
    ctx.lineTo(x, base - amp * (0.55 * Math.sin(u * 5.1 + ph[0]) + 0.3 * Math.sin(u * 11.3 + ph[1]) + 0.15 * Math.sin(u * 23 + ph[2])));
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); ctx.restore();
}
function nightScene(T, a = 1, drift = 0) {
  grad('#0B1524', '#1E4B52');
  stars(T, a);
  ridge(640, 120, 3, '#1F4F58', a, drift * 0.3);
  ridge(760, 90, 11, '#18424A', a, drift * 0.6);
  ridge(900, 70, 23, '#123239', a, drift);
}
function cloud(x, y, s, a = 1, color = '#F4FAF7') {
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(-60, 6, 34, 0, 6.28); ctx.arc(-18, -16, 44, 0, 6.28); ctx.arc(38, -6, 38, 0, 6.28); ctx.arc(74, 12, 26, 0, 6.28);
  ctx.rect(-86, 6, 180, 34); ctx.fill(); ctx.restore();
}
function lantern(x, y, T, power = 1) {
  const fl = 0.85 + 0.15 * Math.sin(T * 5.3) * Math.sin(T * 2.1);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 4, x, y, 260 * power);
  g.addColorStop(0, `rgba(255,196,96,${0.75 * fl})`); g.addColorStop(0.3, `rgba(255,150,60,${0.25 * fl})`); g.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 260 * power, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#3A2A1E'; ctx.fillRect(x - 3, y - 46, 6, 20); ctx.fillRect(x - 16, y - 28, 32, 6); ctx.fillRect(x - 14, y + 24, 28, 6);
  ctx.fillStyle = `rgba(255,214,130,${fl})`; ctx.beginPath(); ctx.roundRect(x - 13, y - 22, 26, 46, 6); ctx.fill();
  ctx.restore();
}
function mist(x, y, T, a, color = '30,16,44') {
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const px = x + Math.sin(T * 0.5 + i * 1.7) * 150 + (i - 3) * 60, py = y + Math.cos(T * 0.4 + i * 2.3) * 50, r = 120 + (i % 3) * 40;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${color},${0.5 * a})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.28); ctx.fill();
  }
  ctx.restore();
}
function flash(a, color = '255,255,255') { if (a > 0) { ctx.fillStyle = `rgba(${color},${a})`; ctx.fillRect(0, 0, W, H); } }
function vignette(a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// 逐段畫線：segs = [[x1,y1,x2,y2],...]，prog 0~1
function strokeProg(segs, prog, color, lw, glow) {
  const lens = segs.map(([a, b, c, d]) => Math.hypot(c - a, d - b)), total = lens.reduce((s, l) => s + l, 0);
  let left = total * clamp(prog);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 22; }
  ctx.beginPath();
  for (let i = 0; i < segs.length && left > 0; i++) {
    const [a, b, c, d] = segs[i], p = Math.min(1, left / lens[i]);
    ctx.moveTo(a, b); ctx.lineTo(a + (c - a) * p, b + (d - b) * p); left -= lens[i];
  }
  ctx.stroke(); ctx.restore();
}
// 師父留下的圖：一座殿的平面（外牆、柱網、內殿、台階、軸線、尺寸線）
const PLAN = (() => {
  const s = [], R = (x, y, w, h) => s.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]);
  R(-300, -130, 600, 260); R(-270, -100, 540, 200); R(-120, -70, 240, 140);
  for (let i = 0; i <= 6; i++) for (const y of [-100, 100]) { const x = -270 + i * 90; s.push([x - 9, y, x + 9, y], [x, y - 9, x, y + 9]); }
  for (const y of [-70, 70]) for (const x of [-120, 120]) s.push([x - 9, y - 9, x + 9, y + 9], [x - 9, y + 9, x + 9, y - 9]);
  for (let i = 0; i < 4; i++) s.push([-70 - i * 0, 130 + i * 14, 70, 130 + i * 14]);
  s.push([-70, 130, -70, 172], [70, 130, 70, 172]);
  s.push([0, -165, 0, 190], [-340, 0, 340, 0]);
  s.push([-300, -160, 300, -160], [-300, -168, -300, -152], [300, -168, 300, -152], [-335, -130, -335, 130], [-343, -130, -327, -130], [-343, 130, -327, 130]);
  return s;
})();
// 那張圖蓋起來的樣子：重簷大殿的立面
const HALL = (() => {
  const s = [];
  s.push([-330, 0, 330, 0], [-330, 0, -310, -26], [-310, -26, 310, -26], [310, -26, 330, 0]);              // 台基
  for (let i = 0; i <= 6; i++) { const x = -240 + i * 80; s.push([x, -26, x, -150]); }                      // 柱
  s.push([-240, -150, 240, -150], [-240, -128, 240, -128]);
  s.push([-330, -150, -360, -140], [-330, -150, 330, -150], [330, -150, 360, -140]);                        // 下簷
  s.push([-360, -140, -300, -176], [-300, -176, -180, -196], [-180, -196, 180, -196], [180, -196, 300, -176], [300, -176, 360, -140]);
  s.push([-170, -196, -170, -236], [170, -196, 170, -236], [-170, -236, 170, -236]);                        // 上層
  s.push([-240, -236, -270, -226], [-240, -236, 240, -236], [240, -236, 270, -226]);
  s.push([-270, -226, -220, -262], [-220, -262, -120, -300], [-120, -300, 120, -300], [120, -300, 220, -262], [220, -262, 270, -226]);
  s.push([-120, -300, -128, -318], [120, -300, 128, -318], [-120, -304, 120, -304]);                        // 正脊
  s.push([-40, -26, -40, -120], [40, -26, 40, -120], [-40, -120, 40, -120]);                                // 門
  return s;
})();
const at = (segs, x, y, k = 1) => segs.map(([a, b, c, d]) => [x + a * k, y + b * k, x + c * k, y + d * k]);

function cursor(x, y, kind) {
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = kind === 'grab' ? '#FFE9A8' : '#fff'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 40); ctx.lineTo(11, 30); ctx.lineTo(19, 48); ctx.lineTo(27, 44); ctx.lineTo(19, 27); ctx.lineTo(33, 27); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.restore();
}
// 遊戲預告常見的斜角標題條
function banner(str, sub, T, a, b, x = 110, y = 130) {
  const p = eOut(seg(T, a, a + 0.3)), al = fade(T, a, b, 0.12, 0.25);
  if (al <= 0) return;
  ctx.save(); ctx.globalAlpha = al; ctx.translate(x - (1 - p) * 120, y); ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.font = `bold 76px ${KAI}`; const w = ctx.measureText(str).width + 90;
  ctx.fillStyle = 'rgba(12,20,28,0.82)'; ctx.fillRect(0, -58, w, 116);
  ctx.fillStyle = GOLD; ctx.fillRect(0, -58, 12, 116); ctx.fillRect(0, 52, w, 6);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = al;
  text(str, x + 50 - (1 - p) * 120, y, 76, { align: 'left', color: '#FFF8E6', glow: 'rgba(246,217,138,0.6)', blur: 16 });
  if (sub) {
    ctx.font = `500 40px ${SANS}`; const sw = ctx.measureText(sub).width + 56, sx = x + 14 - (1 - p) * 120;
    ctx.fillStyle = 'rgba(12,20,28,0.78)'; ctx.beginPath(); ctx.roundRect(sx, y + 70, sw, 64, 10); ctx.fill();
    text(sub, sx + 28, y + 103, 40, { align: 'left', color: '#F2EBDD', font: SANS, weight: '500' });
  }
  ctx.restore();
}

// ---------- 場景 ----------
// 一、序章：三百年前（0–13.5）
function sPrologue(T) {
  grad('#05080F', '#0C1620');
  stars(T, seg(T, 0.5, 3.5) * 0.9);
  const m = eIO(seg(T, 4, 6.5));
  if (m > 0) {
    ridge(700, 130, 3, '#0F2A33', m); ridge(840, 90, 11, '#0B2028', m); ridge(960, 60, 23, '#08171D', m);
    lantern(1420, 640, T, 0.9 * m);
    mist(1420, 660, T, 0.9 * m * (1 - seg(T, 9, 11) * 0.5));
  }
  const un = eOut(seg(T, 8.8, 10.1));
  if (un > 0) {
    const w = 860 * un, x = W / 2 - w / 2, y = 250;
    ctx.save(); ctx.globalAlpha = fade(T, 8.8, 13.5, 0.3, 0.6);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40;
    ctx.fillStyle = '#EADBB8'; ctx.fillRect(x, y, w, 470);
    ctx.shadowBlur = 0; ctx.fillStyle = '#7A4A2A';
    ctx.beginPath(); ctx.roundRect(x - 22, y - 16, 26, 502, 10); ctx.roundRect(x + w - 4, y - 16, 26, 502, 10); ctx.fill();
    ctx.beginPath(); ctx.rect(x, y, w, 470); ctx.clip();
    strokeProg(at(PLAN, W / 2, y + 232, 1.15), seg(T, 10.1, 13), '#2E4A6B', 3.2);
    ctx.restore();
  }
  narr('三百年前，青雲山的師父，不見了。', T, 0.8, 4.6, 540, 66);
  narr('後山，只留下一盞燈。', T, 5.2, 8.8);
  narr('和一張，沒有人看得懂的圖。', T, 9.6, 13.3);
  vignette(0.6);
  flash(seg(T, 13, 13.5), '0,0,0');
}
// 二、等一位會畫圖的人（13.5–21）
function sWait(T) {
  nightScene(T, 1, (T - 13.5) * 6);
  moon(1420, 290, 150);
  ctx.fillStyle = '#0B2229'; ctx.beginPath(); ctx.ellipse(700, 930, 520, 120, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(0, 928, W, 160);
  const woke = T >= 18.2;
  const state = !woke ? 'sleep' : T < 19.1 ? 'startle' : 'idle';
  const bub = T >= 19.2 ? { text: '喵，你就是道友？', age: Math.min(T - 19.2, 1.4) } : null;
  pet({ state, t: T, st: woke ? T - (T < 19.1 ? 18.2 : 19.1) : T - 13.5, outfit: fit('cat', { hat: 'none', realm: 1 }), look: { x: 60, y: -10 }, bubble: bub }, 700, 842, 3.1);
  narr('師父說——', T, 14.2, 16.2);
  narr('「等一位會畫圖的人。」', T, 16, 18.6, 950, 64, GOLD);
  vignette(0.5);
  flash(1 - seg(T, 13.5, 14.2), '0,0,0');
}
// 三、片名（21–26）
function sTitle(T) {
  nightScene(T, 1, 0);
  moon(1500, 210, 110);
  const order = ['rabbit', 'fox', 'cat', 'panda', 'dragon'];
  order.forEach((k, i) => {
    const a = 22.0 + i * 0.22, p = seg(T, a, a + 0.45);
    if (p <= 0) return;
    const x = 330 + i * 315, y = 900 + (1 - eBack(p)) * 420 + Math.sin(T * 2 + i) * 6;
    cloud(x, y + 12, 1.5);
    pet({ state: T - a < 1.6 ? 'happy' : 'idle', t: T + i, st: Math.max(0, T - a - 0.3), outfit: fit(k) }, x, y, 1.75);
  });
  const p = seg(T, 21, 21.4), sc = lerp(1.7, 1, eOut(p));
  ctx.save(); ctx.translate(W / 2, 360); ctx.scale(sc, sc); ctx.globalAlpha = p;
  text('桌面靈寵', 0, 0, 250, { color: GOLD, glow: 'rgba(246,200,90,0.9)', blur: 60, stroke: 'rgba(60,40,10,0.5)', sw: 6 });
  ctx.restore();
  const s2 = fade(T, 22, 26.2, 0.5, 0.01);
  text('住在你桌面上的仙俠小靈獸', W / 2, 560, 62, { color: '#E6F2EE', alpha: s2, glow: 'rgba(0,0,0,0.8)', blur: 12 });
  flash((1 - seg(T, 21, 21.6)) * 0.95);
  vignette(0.45);
}
// 四、桌面（26–38）
function desktop(T, dim = 0) {
  grad('#CFE6E4', '#F3EBD8');
  ridge(700, 110, 5, 'rgba(120,170,170,0.35)'); ridge(820, 80, 9, 'rgba(100,150,150,0.35)');
  // 一個畫圖的視窗
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#FBFBF8'; ctx.beginPath(); ctx.roundRect(210, 150, 1080, 700, 14); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#2F3B45'; ctx.beginPath(); ctx.roundRect(210, 150, 1080, 54, [14, 14, 0, 0]); ctx.fill();
  text('一層平面圖', 250, 178, 26, { align: 'left', font: SANS, weight: '500', color: '#DDE6EA' });
  for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#E5484D', '#F5B82E', '#59C9A5'][i]; ctx.beginPath(); ctx.arc(1262 - i * 34, 177, 9, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = '#EEF1EE'; ctx.fillRect(210, 204, 70, 646);
  for (let i = 0; i < 7; i++) { ctx.fillStyle = '#C9D2CF'; ctx.beginPath(); ctx.roundRect(226, 224 + i * 56, 38, 38, 8); ctx.fill(); }
  ctx.strokeStyle = 'rgba(46,74,107,0.10)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 300; x < 1290; x += 40) { ctx.moveTo(x, 204); ctx.lineTo(x, 850); }
  for (let y = 224; y < 850; y += 40) { ctx.moveTo(280, y); ctx.lineTo(1290, y); }
  ctx.stroke();
  strokeProg(at(PLAN, 785, 525, 1.35), 1, '#2E4A6B', 3);
  // 工作列
  ctx.fillStyle = 'rgba(28,38,46,0.92)'; ctx.fillRect(0, 1024, W, 56);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#59C9A5', '#F5B82E', '#8E6BD9', '#E5484D', '#7FB7E6', '#C9D2CF'][i]; ctx.beginPath(); ctx.roundRect(40 + i * 62, 1036, 34, 34, 8); ctx.fill(); }
  text('下午 3:27', 1870, 1052, 24, { align: 'right', font: SANS, weight: '500', color: '#DDE6EA' });
  if (dim) flash(dim, '6,10,22');
}
function sDesktop(T) {
  const u = T - 26, G = 1026, S = 2.2;
  desktop(T);
  let x, y = G, state, st, dir = -1, bub = null, cur = null, ck = '';
  const cat = fit('cat', { gear: 'none' });
  if (u < 3) { x = lerp(1760, 1180, u / 3); state = 'walk'; st = u; cur = [lerp(900, 1000, u / 3), lerp(430, 520, u / 3)]; }
  else if (u < 3.7) { x = 1180; state = 'idle'; st = u - 3; const p = eIO(seg(u, 3, 3.6)); cur = [lerp(1000, 1180, p), lerp(520, G - 190, p)]; }
  else if (u < 5.6) { x = 1180; state = 'happy'; st = u - 3.7; cur = [1180, G - 190]; }
  else if (u < 7) {
    const p = eIO(seg(u, 5.7, 6.6)), sw = u > 6.6 ? Math.sin((u - 6.6) * 8) * -60 : 0;
    cur = [lerp(1180, 720, p) + sw, lerp(G - 190, 420, p)]; x = cur[0]; y = cur[1] + 190; state = 'drag'; st = u - 5.6; ck = 'grab'; dir = 1;
  } else if (u < 7.5) { const p = (u - 7) / 0.5; x = lerp(700, 1790, p); y = 570 - Math.sin(p * Math.PI * 0.7) * 170; state = 'fall'; st = u - 7; dir = 1; cur = [760, 400]; }
  else if (u < 8.3) { const p = (u - 7.5) / 0.8; x = lerp(1790, 1480, p); y = lerp(432, G, p * p); state = 'fall'; st = u - 7; cur = [760, 400]; }
  else if (u < 8.65) { const p = (u - 8.3) / 0.35; x = 1480 - p * 50; y = G - Math.sin(p * Math.PI) * 70; state = 'fall'; st = u - 7; cur = [760, 400]; }
  else if (u < 10.3) { x = 1430; state = 'dizzy'; st = u - 8.65; bub = { text: '走火入魔了…', age: Math.min(u - 8.8, 1.2) }; if (u < 8.8) bub = null; cur = [760, 400]; }
  else {
    const p = seg(u, 10.3, 12), q = eIO(p);
    cur = [lerp(760, 300, q) + 0, 430 + Math.sin(p * 9) * 130];
    const pp = eIO(seg(u, 10.45, 12.1));
    x = lerp(1430, 470, pp); y = lerp(G, 560, eOut(seg(u, 10.3, 10.8))) + Math.sin(seg(u, 10.45, 12.1) * 9) * 120; state = 'roll'; st = u - 10.3; cat.gear = 'sword';
  }
  if (state === 'roll') {   // 劍光拖尾
    ctx.save(); ctx.strokeStyle = 'rgba(89,201,165,0.5)'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 14; i++) { const uu = u - i * 0.03, pp = eIO(seg(uu, 10.45, 12.1)); const px = lerp(1430, 470, pp) + 60 + i * 6, py = lerp(G, 560, eOut(seg(uu, 10.3, 10.8))) + Math.sin(seg(uu, 10.45, 12.1) * 9) * 120 - 70; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.restore();
  }
  pet({ state, t: T, st, dir, outfit: cat, look: cur ? { x: (cur[0] - x) / S, y: (cur[1] - y + 120) / S } : undefined, bubble: bub }, x, y, S);
  if (u >= 3.7 && u < 5.4) { const p = (u - 3.7) / 1.7; text('修為 +1', 1180 + 190, G - 300 - p * 110, 64, { color: GOLD, alpha: 1 - eIn(p), stroke: 'rgba(40,28,6,0.85)', sw: 8 }); }
  if (u >= 3.68 && u < 3.95) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(1180, G - 190, (u - 3.68) * 260, 0, 6.28); ctx.stroke(); ctx.restore(); }
  if (u >= 7.5 && u < 7.8) { const p = (u - 7.5) / 0.3; ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${1 - p})`; ctx.lineWidth = 8; for (let i = 0; i < 7; i++) { const a = Math.PI / 2 + (i - 3) * 0.35; ctx.beginPath(); ctx.moveTo(1900 - Math.sin(a) * 30 * p, 300 + Math.cos(a) * 60 * (1 + p)); ctx.lineTo(1900 - Math.sin(a) * (60 + 90 * p), 300 + Math.cos(a) * (120 + 60 * p)); ctx.stroke(); } ctx.restore(); }
  if (cur) cursor(cur[0], cur[1], ck);
  banner('牠就住在你的桌面上', '透明置頂．不擋你工作', T, 26.3, 29.5);
  banner('摸摸頭', '點一下，靈氣四溢', T, 29.6, 31.5);
  banner('抓起來——甩出去！', '撞牆會彈，摔重了會走火入魔', T, 31.6, 36.2);
  banner('御劍飛行', '滾一下滾輪，追著游標飛', T, 36.3, 38.2);
  flash(1 - seg(T, 26, 26.4), '10,20,28');
}
// 五、五位同門（38–50）
const CAST = [
  ['cat', '靈貓', '青雲山守山靈獸', '從今天起，我罩你', '貓', ['#16343B', '#2C6A66'], 'happy'],
  ['fox', '狐仙', '青雲山八尾狐仙', '叫我狐姐姐就好', '狐', ['#3A1A1C', '#8E3B34'], 'idle'],
  ['rabbit', '玉兔', '月宮搗藥玉兔', '不是摔的！是降落', '兔', ['#1E2740', '#56689A'], 'eat'],
  ['panda', '熊貓', '青雲山大師兄．掌廚', '先坐，湯快好了', '熊', ['#1C1E24', '#4A5160'], 'drink'],
  ['dragon', '小青龍', '青雲山小師弟', '絕對不是龍王的兒子', '龍', ['#15351F', '#3F8A5A'], 'roll'],
];
function sCast(T) {
  const i = Math.min(4, Math.floor((T - 38) / 2.4)), u = T - 38 - i * 2.4;
  const [k, name, title, quote, glyph, [c0, c1], state] = CAST[i], left = i % 2 === 0;
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.07; text(glyph, left ? 1300 : 620, 560 + u * 12, 980, { color: '#fff' }); ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3;
  for (let j = 0; j < 26; j++) { const x = ((j * 97 + u * 700) % (W + 400)) - 200; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 320, H); ctx.stroke(); }
  ctx.restore();
  const p = eOut(seg(u, 0, 0.45)), px = left ? lerp(-300, 520, p) : lerp(W + 300, 1400, p);
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px, 905, 300, 34, 0, 0, 6.28); ctx.fill(); ctx.restore();
  pet({ state, t: T, st: Math.max(0, u - 0.3) % (state === 'eat' ? 3 : 99), dir: left ? 1 : -1, outfit: fit(k, { realm: state === 'roll' ? 0 : 2 }), look: { x: left ? 50 : -50, y: 0 } }, px, state === 'roll' ? 800 : 900, 4.3);
  const tx = left ? 1010 : 130, q = eOut(seg(u, 0.15, 0.6));
  ctx.save(); ctx.globalAlpha = q; ctx.translate((1 - q) * (left ? 90 : -90), 0);
  text(name, tx, 400, 230, { align: 'left', color: GOLD, glow: 'rgba(246,200,90,0.7)', blur: 40 });
  ctx.fillStyle = GOLD; ctx.fillRect(tx + 6, 540, 620 * eOut(seg(u, 0.3, 0.9)), 5);
  text(title, tx + 6, 610, 62, { align: 'left', color: '#F2EBDD' });
  ctx.restore();
  ctx.save(); ctx.globalAlpha = seg(u, 0.7, 1.0);
  text(`「${quote}」`, tx - 18, 740, 66, { align: 'left', color: '#fff', glow: 'rgba(0,0,0,0.6)', blur: 10 });
  ctx.restore();
  flash((1 - seg(u, 0, 0.22)) * 0.9);
  vignette(0.4);
}
// 六、功夫（50–62）
const KUNGFU = [
  ['壁虎遊牆功', '貼牆而上，倒掛金鉤', '#27424F'], ['比法術', '連點五下，符咒齊發', '#4A2B58'], ['比劍', '揮動游標，劍氣縱橫', '#5A2A2A'],
  ['降龍十八掌', '化神解鎖．雙擊出招', '#5A4416'], ['縮地成寸', '游標畫三圈，瞬間移動', '#1F3F5A'], ['每日一卦', '三枚銅錢，問今日吉凶', '#2B3A2E'],
];
function speedLines(T, color, cx = W / 2, cy = H / 2) {
  ctx.save(); const r = rng(Math.floor(T * 15) + 3); ctx.fillStyle = color;
  for (let i = 0; i < 46; i++) { const a = r() * 6.28, d0 = 420 + r() * 300, w = 0.012 + r() * 0.02; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0 * 0.6); ctx.lineTo(cx + Math.cos(a - w) * 1500, cy + Math.sin(a - w) * 1500); ctx.lineTo(cx + Math.cos(a + w) * 1500, cy + Math.sin(a + w) * 1500); ctx.fill(); }
  ctx.restore();
}
function sKungfu(T) {
  const i = Math.min(5, Math.floor((T - 50) / 2)), u = T - 50 - i * 2;
  const [name, sub, c] = KUNGFU[i];
  const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1200); g.addColorStop(0, c); g.addColorStop(1, '#070B10'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  speedLines(T, 'rgba(255,255,255,0.07)');
  const S = 3.6, cx = 1260, gy = 770;
  if (i === 0) {
    ctx.fillStyle = '#0D1A20'; ctx.fillRect(1500, 0, 420, H); ctx.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = -200 + (u * 600) % 200; y < H; y += 200) ctx.fillRect(1500, y, 420, 6);
    if (u < 1.3) pet({ state: 'climb', t: T, st: u, dir: 1, outfit: fit('cat', { realm: 3 }) }, 1500 - 36 * S, lerp(1000, 520, u / 1.3), S);
    else { ctx.fillStyle = '#0D1A20'; ctx.fillRect(0, 0, W, 150); pet({ state: 'hang', t: T, st: u - 1.3, dir: -1, outfit: fit('cat', { realm: 3 }) }, 1180, 150 + 62 * S, S); }
  } else if (i === 1) {
    const hit = (u * 3.4) % 1, n = Math.floor(u * 3.4), col = ['#B48CFF', '#FF8A4C', '#7FD4FF'][n % 3];
    pet({ state: hit < 0.45 ? 'struck' : 'spell', t: T, st: hit < 0.45 ? hit : u, dir: -1, outfit: fit('fox', { realm: 4 }) }, cx, gy, S);
    const tx = lerp(330, cx - 60, eIn(clamp(hit * 1.6))), ty = lerp(360, gy - 330, eIn(clamp(hit * 1.6)));
    if (hit < 0.62) { ctx.save(); ctx.translate(tx, ty); ctx.rotate(hit * 9); ctx.shadowColor = col; ctx.shadowBlur = 40; ctx.fillStyle = '#F7D154'; ctx.fillRect(-26, -46, 52, 92); ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-10, -28); ctx.lineTo(10, -10); ctx.lineTo(-10, 8); ctx.lineTo(10, 28); ctx.stroke(); ctx.restore(); }
    else { const p = (hit - 0.62) / 0.38; ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = col; ctx.lineWidth = 14 * (1 - p) + 2; ctx.shadowColor = col; ctx.shadowBlur = 50; ctx.beginPath(); ctx.arc(cx - 40, gy - 320, 60 + p * 260, 0, 6.28); ctx.stroke(); ctx.restore(); flash((1 - p) * 0.25, '255,255,255'); }
    cursor(330, 380); text(`${n + 1} 連擊`, 420, 250, 96, { color: GOLD, stroke: 'rgba(20,10,30,0.9)', sw: 12, align: 'left' });
  } else if (i === 2) {
    pet({ state: 'sword', t: T, st: u, dir: -1, outfit: fit('dragon', { realm: 4 }) }, cx, gy, S);
    for (let j = 0; j < 3; j++) { const p = ((u * 2.6 + j * 0.33) % 1); ctx.save(); ctx.translate(cx - 60, gy - 300); ctx.rotate(j * 2.1 + Math.floor(u * 2.6 + j * 0.33) * 1.3); ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#EAF6FF'; ctx.shadowColor = '#7FD4FF'; ctx.shadowBlur = 40; ctx.lineWidth = 16 * (1 - p) + 2; ctx.beginPath(); ctx.arc(0, 240, 420, -Math.PI / 2 - 0.5 + p * 0.3, -Math.PI / 2 - 0.5 + p * 1.6); ctx.stroke(); ctx.restore(); }
    cursor(lerp(700, 1500, (Math.sin(u * 8) + 1) / 2), 480 + Math.cos(u * 8) * 120);
  } else if (i === 3) {
    pet({ state: 'strike', t: T, st: u % 1.0, dir: -1, outfit: fit('panda', { realm: 4, move: 'palm' }) }, cx, gy, S);
    const p = (u % 1.0); ctx.save(); ctx.globalAlpha = (1 - p) * 0.9; ctx.strokeStyle = GOLD; ctx.shadowColor = GOLD; ctx.shadowBlur = 50; ctx.lineWidth = 18 * (1 - p) + 2;
    for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(cx - 260 - p * 620 - j * 90, gy - 300, 120 + j * 40, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke(); } ctx.restore();
  } else if (i === 4) {
    const a = u < 0.9, bx = a ? 700 : 1300;
    if (u < 1.0) { ctx.save(); ctx.strokeStyle = 'rgba(127,212,255,0.9)'; ctx.lineWidth = 8; ctx.shadowColor = '#7FD4FF'; ctx.shadowBlur = 30; ctx.beginPath(); for (let q = 0; q <= Math.min(1, u / 0.8) * 6.28 * 3; q += 0.15) { const r = 150 + q * 6; ctx.lineTo(1300 + Math.cos(q) * r, 560 + Math.sin(q) * r * 0.7); } ctx.stroke(); ctx.restore(); cursor(1300 + Math.cos(u / 0.8 * 18.8) * 190, 560 + Math.sin(u / 0.8 * 18.8) * 130); }
    if (u < 0.5) pet({ state: 'idle', t: T, st: u, outfit: fit('rabbit', { realm: 5 }) }, 700, gy, S);
    else if (a) pet({ state: 'vanish', t: T, st: u - 0.5, outfit: fit('rabbit', { realm: 5 }) }, 700, gy, S);
    else pet({ state: u < 1.5 ? 'appear' : 'happy', t: T, st: u < 1.5 ? u - 0.9 : u - 1.5, outfit: fit('rabbit', { realm: 5 }) }, 1300, gy, S);
    flash((1 - seg(u, 0.9, 1.15)) * (u >= 0.9 ? 0.5 : 0), '170,225,255'); void bx;
  } else {
    pet({ state: u < 1.0 ? 'divine' : 'hexagram', t: T, st: u < 1 ? u : u - 1, outfit: fit('cat', { hat: 'guan', realm: 2, hex: [1, 1, 1, 0, 1, 1] }) }, cx - 100, gy, S);
    if (u > 1.05) text('大有．元亨', 560, 420, 110, { color: GOLD, alpha: seg(u, 1.05, 1.3), glow: 'rgba(246,200,90,0.7)' });
  }
  // 大字招式名
  const p = eOut(seg(u, 0, 0.25));
  ctx.save(); ctx.translate(120, 900); ctx.transform(1, 0, -0.2, 1, 0, 0); ctx.scale(lerp(1.5, 1, p), lerp(1.5, 1, p)); ctx.globalAlpha = p;
  text(name, 0, 0, 150, { align: 'left', color: '#FFF8E6', stroke: 'rgba(0,0,0,0.85)', sw: 18, glow: GOLD, blur: 30 });
  ctx.restore();
  text(sub, 130, 1010, 48, { align: 'left', color: GOLD, font: SANS, weight: '500', alpha: seg(u, 0.25, 0.5), stroke: 'rgba(0,0,0,0.8)', sw: 8 });
  flash((1 - seg(u, 0, 0.18)) * 0.95);
  vignette(0.5);
}
// 七、陪你工作（62–72）
const CARE = [
  ['今日三件事', '做完一件，蓋一個「成」字印', 'happy', 'cat', ''],
  ['喝口水', '每用電腦一小時', 'drink', 'panda', '道友也喝口水吧'],
  ['遠眺二十秒', '每二十分鐘，護一次眼', 'gaze', 'rabbit', '看看六公尺外'],
  ['起來動一動', '坐太久，牠打太極給你看', 'taichi', 'dragon', '起身活動筋骨'],
];
function sCare(T) {
  const i = Math.min(3, Math.floor((T - 62) / 2.5)), u = T - 62 - i * 2.5;
  const [name, sub, state, k, say] = CARE[i];
  grad('#F6EBD2', '#E9D6B0');
  ctx.save(); ctx.globalAlpha = 0.5; cloud(300 + T * 12 % 400, 240, 2.2, 1, '#FFF8EA'); cloud(1500 - (T * 9) % 300, 330, 1.7, 1, '#FFF8EA'); ctx.restore();
  ctx.fillStyle = '#C9A46A'; ctx.fillRect(0, 900, W, 180); ctx.fillStyle = '#B58F57'; ctx.fillRect(0, 900, W, 10);
  const p = eOut(seg(u, 0, 0.4));
  if (i === 0) {
    const sx = 1000, sy = 250, w = 640, h = 560;
    ctx.save(); ctx.translate(0, (1 - p) * -80); ctx.globalAlpha = p; ctx.shadowColor = 'rgba(80,50,10,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FBF3DD'; ctx.fillRect(sx, sy, w, h); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#7A4A2A'; ctx.beginPath(); ctx.roundRect(sx - 20, sy - 22, w + 40, 30, 12); ctx.roundRect(sx - 20, sy + h - 8, w + 40, 30, 12); ctx.fill();
    text('今日三件事', sx + w / 2, sy + 80, 64, { color: INK });
    ['平面圖定稿', '回覆業主', '準時下班'].forEach((s, j) => {
      const y = sy + 200 + j * 120; text(`${'一二三'[j]}、${s}`, sx + 60, y, 58, { align: 'left', color: INK });
      const q = seg(u, 0.6 + j * 0.5, 0.75 + j * 0.5);
      if (q > 0) { ctx.save(); ctx.translate(sx + w - 90, y); ctx.rotate(-0.15); ctx.scale(lerp(2.2, 1, eOut(q)), lerp(2.2, 1, eOut(q))); ctx.globalAlpha = q * 0.9; ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 6; ctx.strokeRect(-40, -40, 80, 80); text('成', 0, 2, 60, { color: '#C0392B' }); ctx.restore(); }
    });
    ctx.restore();
    pet({ state: u > 1.75 ? 'fireworks' : 'happy', t: T, st: u > 1.75 ? u - 1.75 : (u % 1.2), outfit: fit(k, { realm: 2 }) }, 560, 905, 3.4);
  } else {
    pet({ state, t: T, st: u, dir: 1, outfit: fit(k, { realm: 2, gear: state === 'drink' ? 'gourd' : FIT[k].gear }), bubble: u > 0.5 ? { text: say, age: Math.min(u - 0.5, 1.5) } : null }, i % 2 ? 1300 : 640, 905, 3.6);
  }
  const tx = i === 0 ? 0 : (i % 2 ? 150 : 1040);
  if (i > 0) { ctx.save(); ctx.globalAlpha = p; ctx.translate((1 - p) * -60, 0); text(name, tx, 470, 150, { align: 'left', color: '#5A3A1A' }); ctx.fillStyle = '#C0392B'; ctx.fillRect(tx + 4, 570, 360 * eOut(seg(u, 0.2, 0.7)), 6); text(sub, tx + 4, 640, 50, { align: 'left', color: '#7A5A30', font: SANS, weight: '500' }); ctx.restore(); }
  else text(sub, 560, 1000, 46, { color: '#5A3A1A', font: SANS, weight: '500', alpha: seg(u, 0.4, 0.8) });
  // 上方固定標題
  ctx.fillStyle = 'rgba(90,58,26,0.92)'; ctx.fillRect(0, 60, W, 110);
  text('不只可愛——牠會陪你工作，也勸你休息', W / 2, 116, 62, { color: '#FFF3D6' });
  flash((1 - seg(u, 0, 0.2)) * 0.8, '255,248,230');
  flash(1 - seg(T, 62, 62.3));
}
// 八、九重境界與天劫（72–84）
const REALMS = ['煉氣', '築基', '金丹', '元嬰', '化神', '煉虛', '合體', '大乘', '渡劫'];
const UNLOCK = ['點、拖、甩、吟詩', '腳下靈氣圈', '御劍飛行', '壁虎遊牆功', '降龍十八掌', '縮地成寸', '召喚同門', '腳踏祥雲', '天雷閃避'];
function sRealm(T) {
  const u = T - 72, step = Math.min(8, Math.floor(u / 0.8)), su = u - step * 0.8, storm = u >= 7.2, tu = u - 7.2;
  grad(storm ? '#0A0E18' : '#0E2030', storm ? '#1A2233' : '#1E5A5A');
  stars(T, storm ? 0.2 : 0.8);
  const rise = eOut(seg(u, 0, 7.2));
  ridge(820 + rise * 60, 100, 31, '#143940'); ridge(940 + rise * 40, 70, 41, '#0E2A30');
  if (storm) { for (let j = 0; j < 9; j++) cloud(((j * 260 + T * 40) % (W + 500)) - 250, 120 + (j % 3) * 70, 3.2, 0.9, j % 2 ? '#2A2F45' : '#353A55'); }
  let state = 'idle', st = u, done = false;
  if (!storm && su < 0.5 && step > 0) { state = 'happy'; st = su; }
  if (storm) { if (tu < 1) { state = 'warn'; st = tu; } else if (tu < 3.2) { state = 'tribulation'; st = tu - 1; } else { state = 'happy'; st = tu - 3.2; done = true; } }
  const S = 3.5, py = 830;
  if (state === 'tribulation' && st < 2.3 && (st * 8 % 2) < 1.1) {   // 整個畫面的大閃電
    const r = rng(Math.floor(st * 8) + 5); ctx.save(); ctx.strokeStyle = '#fff'; ctx.shadowColor = '#B48CFF'; ctx.shadowBlur = 60; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.beginPath();
    let x = 960 + (r() - 0.5) * 300; ctx.moveTo(x, 0); for (let y = 60; y < 430; y += 60) { x += (r() - 0.5) * 170; ctx.lineTo(x, y); } ctx.lineTo(960, 440); ctx.stroke(); ctx.restore();
    flash(0.22, '200,180,255');
  }
  if (done) { const g = ctx.createRadialGradient(960, 620, 20, 960, 620, 900); g.addColorStop(0, 'rgba(255,220,130,0.55)'); g.addColorStop(1, 'rgba(255,220,130,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  pet({ state, t: T, st, outfit: fit('cat', { hat: 'guan', realm: step, done }) }, 960, py, S);
  // 境界階梯
  const y0 = 965;
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(200, y0); ctx.lineTo(1720, y0); ctx.stroke();
  ctx.strokeStyle = GOLD; ctx.shadowColor = GOLD; ctx.shadowBlur = 16; ctx.beginPath(); ctx.moveTo(200, y0); ctx.lineTo(200 + 190 * Math.max(0, Math.min(8, step - 1 + eOut(Math.min(1, su / 0.3)))), y0); ctx.stroke(); ctx.restore();
  REALMS.forEach((n, j) => {
    const x = 200 + j * 190, on = j <= step, cur = j === step;
    ctx.save(); ctx.fillStyle = on ? GOLD : '#44606A'; if (cur) { ctx.shadowColor = GOLD; ctx.shadowBlur = 30; }
    ctx.beginPath(); ctx.arc(x, y0, cur ? 18 : 11, 0, 6.28); ctx.fill(); ctx.restore();
    text(n, x, y0 + 56, cur ? 50 : 40, { color: on ? '#FFF3D6' : '#6C8A92' });
  });
  if (!storm || tu < 1) {
    const p = eOut(seg(su, 0, 0.25));
    ctx.save(); ctx.translate(960, 235); ctx.scale(lerp(1.6, 1, p), lerp(1.6, 1, p));
    text(REALMS[step], 0, 0, 190, { color: GOLD, glow: 'rgba(246,200,90,0.9)', blur: 50 }); ctx.restore();
    text(`解鎖　${UNLOCK[step]}`, 960, 380, 58, { color: '#E6F2EE', alpha: seg(su, 0.1, 0.3) });
    flash((1 - seg(su, 0, 0.2)) * (step ? 0.45 : 0));
  } else if (!done) banner('天劫降臨', '烏雲預告三秒——點牠，閃開天雷', T, 80.2, 82.4, 110, 330);
  else { text('渡劫圓滿', 960, 240, 200, { color: GOLD, glow: 'rgba(255,230,150,1)', blur: 70, alpha: seg(tu, 3.2, 3.5) }); flash((1 - seg(tu, 3.2, 3.8)) * 0.9, '255,244,210'); }
  text('九重境界', 110, 90, 62, { align: 'left', color: 'rgba(255,243,214,0.9)' });
  text('好好工作、好好休息，約一週修到渡劫', 110, 150, 34, { align: 'left', color: 'rgba(230,242,238,0.8)', font: SANS, weight: '500' });
  flash(1 - seg(T, 72, 72.3));
  vignette(0.5);
}
// 九、心魔與那張圖（84–101）
function sDemon(T) {
  const u = T - 84;
  desktop(T, 0.72);
  const hits = [5.3, 5.9, 6.5], n = hits.filter((h) => u >= h).length, hp = 3 - n;
  const g = ctx.createRadialGradient(1180, 860, 40, 1180, 860, 520); g.addColorStop(0, 'rgba(255,196,110,0.22)'); g.addColorStop(1, 'rgba(255,196,110,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (hp > 0) mist(1010, 850, T, 0.8 * seg(u, 0.4, 1.6), '60,10,40');
  const last = hits[n - 1], sh = n && u - last < 0.25 ? Math.sin((u - last) * 80) * 10 : 0;
  pet({ state: hp === 0 ? 'happy' : (u > 1 ? 'yawn' : 'idle'), t: T, st: hp === 0 ? u - 6.5 : (u - 1) % 3, dir: 1, outfit: fit('cat', { gear: 'none', realm: 2, lantern: true, demon: hp > 0 && u > 0.6 ? { hp, t0: 0, hitAt: 0 } : null }) }, 1180 + sh, 1026, 2.6);
  const wh = [['圖明天再改……', 1.2, 620, 520], ['業主不會發現……', 2.3, 500, 660], ['再五分鐘就好……', 3.4, 680, 790]];
  if (hp > 0) wh.forEach(([s, a, x, y]) => { const al = fade(u, a, 5.4 + 0.3, 0.6, 0.3); text(s, x + Math.sin(T * 1.3 + a) * 14, y - (u - a) * 10, 66, { color: '#FF7C96', alpha: al, glow: 'rgba(120,10,50,1)', blur: 30 }); });
  hits.forEach((h) => { const p = (u - h) / 0.35; if (p >= 0 && p < 1) { ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${1 - p})`; ctx.lineWidth = 10 * (1 - p) + 2; ctx.beginPath(); ctx.arc(1024, 930, 20 + p * 180, 0, 6.28); ctx.stroke(); ctx.restore(); flash((1 - p) * 0.2); } });
  if (u > 4.9 && hp > 0 || (u - 6.5 < 0.2 && u > 4.9)) cursor(1040, 930);
  text('凌晨 1:12', 1870, 1052, 24, { align: 'right', font: SANS, weight: '500', color: '#DDE6EA' });
  narr('夜深了。心魔，又來了。', T, 84.5, 88.8, 78, 62, '#F2D5DC');
  narr('心魔，是累出來的。', T, 90.6, 93.4, 78, 66, GOLD);
  vignette(0.7);
  flash(1 - seg(T, 84, 84.6), '0,0,0'); flash(seg(T, 93.1, 93.5), '0,0,0');
}
function sHome(T) {
  const u = T - 93.5;
  nightScene(T, 1, u * 5);
  moon(220, 330, 110);
  lantern(1560, 560, T, 1.5);
  // 山頂上，圖蓋成殿
  const hp = seg(u, 3.0, 6.2);
  if (hp > 0) { strokeProg(at(HALL, 960, 590, 1.2), hp, '#FFE9A8', 4.5, 'rgba(255,200,90,0.95)'); if (hp >= 1) { const a = seg(u, 6.2, 7.2); const g = ctx.createRadialGradient(960, 420, 20, 960, 420, 700); g.addColorStop(0, `rgba(255,214,130,${0.35 * a})`); g.addColorStop(1, 'rgba(255,214,130,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } }
  if (u > 2.4 && u < 4.2) { const p = seg(u, 2.4, 4.0); ctx.save(); ctx.globalAlpha = (1 - p) * 0.9; strokeProg(at(PLAN, 960, lerp(880, 520, eIO(p)), lerp(0.5, 1.1, p)), 1, '#FFE9A8', 3, 'rgba(255,200,90,0.9)'); ctx.restore(); }
  ctx.fillStyle = '#0A2026'; ctx.fillRect(0, 960, W, 120);
  ['rabbit', 'fox', 'cat', 'panda', 'dragon'].forEach((k, i) => {
    const x = 340 + i * 310, a = 0.3 + i * 0.15, p = eOut(seg(u, a, a + 0.6));
    pet({ state: u > 6.3 ? 'happy' : 'idle', t: T + i * 0.7, st: (u - 6.3 + i * 0.13) % 1.4, dir: i < 2 ? 1 : i > 2 ? -1 : 1, outfit: fit(k, { realm: 8 }), look: { x: (960 - x) / 6, y: -40 }, bubble: k === 'cat' && u > 5.2 ? { text: '我們一起把家蓋好', age: Math.min(u - 5.2, 1.5) } : null }, x, 985 + (1 - p) * 300, 2.3);
  });
  narr('師父不是去打它——是去陪它休息。', T, 93.9, 97.2, 120, 60);
  narr('那張圖，是一座殿。', T, 97.3, 99.6, 120, 66, GOLD);
  narr('等的那個人，就是你。', T, 99.5, 101.4, 120, 66, GOLD);
  vignette(0.5);
  flash(1 - seg(T, 93.5, 94.2), '0,0,0');
  flash(seg(T, 101, 101.5), '0,0,0');
}
// 十、片尾（101.5–108）
function sEnd(T) {
  const u = T - 101.5;
  nightScene(T, 1, u * 4);
  moon(1500, 210, 110);
  strokeProg(at(HALL, 960, 925, 0.72), 1, 'rgba(255,233,168,0.55)', 3, 'rgba(255,200,90,0.6)');
  pet({ state: 'sleep', t: T, st: u, outfit: fit('cat', { realm: 8 }) }, 960, 1040, 1.25);
  text('桌面靈寵', W / 2, 250, 210, { color: GOLD, glow: 'rgba(246,200,90,0.9)', blur: 60, alpha: seg(u, 0.3, 1.1) });
  text('道友，上山吧。', W / 2, 420, 84, { color: '#fff', alpha: seg(u, 1.2, 2), glow: 'rgba(0,0,0,0.8)', blur: 14 });
  text('五位同門．九重境界．陪你工作，也勸你休息', W / 2, 522, 42, { color: '#E6F2EE', alpha: seg(u, 2, 2.8), font: SANS, weight: '500' });
  text('Windows ／ macOS', W / 2, 588, 36, { color: 'rgba(230,242,238,0.75)', alpha: seg(u, 2.4, 3.2), font: SANS, weight: '500' });
  vignette(0.5);
  flash(1 - seg(T, 101.5, 102.2), '0,0,0');
  flash(seg(T, 106.6, 107.8), '0,0,0');
}

const SCENES = [[0, sPrologue], [13.5, sWait], [21, sTitle], [26, sDesktop], [38, sCast], [50, sKungfu], [62, sCare], [72, sRealm], [84, sDemon], [93.5, sHome], [101.5, sEnd]];
function render(T) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  let fn = SCENES[0][1];
  for (const [a, f] of SCENES) if (T >= a) fn = f;
  ctx.save(); fn(T); ctx.restore();
}
window.render = render; window.DUR = DUR;
