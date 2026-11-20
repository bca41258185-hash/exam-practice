// 幾何風格的技能特效（平塗色塊、片間留縫、線框、幾何粒子），和碎片青龍同一套語言。
// fx.html 先畫這裡有的招式，沒有的（龍吟）照舊用 fx.html 裡的畫法。
// 全部不記狀態：給第幾秒就畫得出來，預告片可以任意跳格。
(function (root) {
  const TAU = Math.PI * 2;
  const hash = (i, j) => { const x = Math.sin(i * 91.7 + j * 47.3 + 13.1) * 43758.5453; return x - Math.floor(x); };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);

  // ── 把一張「用平塗色塊畫好的圖」切成三角碎片 ──
  // paint(c) 在 w×h 的小畫布上畫圖；每片三角取它中心點的顏色，再隨機深淺一點，看起來像切面。
  // 回傳的座標以圖高為 1、圖中心為原點。
  const cache = {};
  function shardify(key, w, h, cell, paint, vary) {
    if (cache[key]) return cache[key];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); paint(c);
    const d = c.getImageData(0, 0, w, h).data, V = vary == null ? 0.1 : vary;
    const px = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return null; const i = (y * w + x) * 4; return d[i + 3] > 140 ? [d[i], d[i + 1], d[i + 2]] : null; };
    const rows = Math.ceil(h / (cell * 0.866)) + 3, cols = Math.ceil(w / cell) + 3, P = [];
    for (let r = 0; r < rows; r++) { const row = []; for (let q = 0; q < cols; q++) row.push([(q - 1 + (r % 2) * 0.5) * cell + (hash(r, q) - 0.5) * cell * 0.5, (r - 1) * cell * 0.866 + (hash(q, r + 7) - 0.5) * cell * 0.45]); P.push(row); }
    const T = [];
    const add = (a, b, e) => {
      const cx = (a[0] + b[0] + e[0]) / 3, cy = (a[1] + b[1] + e[1]) / 3, col = px(cx, cy); if (!col) return;
      const kk = hash(cx * 0.37, cy * 0.53), f = (kk - 0.5) * 2 * V;
      const rgb = col.map((v) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
      T.push({ p: [a, b, e].map((q) => [(q[0] - w / 2) / h, (q[1] - h / 2) / h]), c: [(cx - w / 2) / h, (cy - h / 2) / h], f: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, k: kk });
    };
    for (let r = 0; r < rows - 1; r++) for (let q = 0; q < cols - 1; q++) {
      if (r % 2 === 0) { add(P[r][q], P[r][q + 1], P[r + 1][q]); add(P[r][q + 1], P[r + 1][q + 1], P[r + 1][q]); }
      else { add(P[r][q], P[r + 1][q + 1], P[r + 1][q]); add(P[r][q], P[r][q + 1], P[r + 1][q + 1]); }
    }
    return (cache[key] = T);
  }

  // drawShards(ctx, 碎片, x, y, 大小(像素，等於原圖的高), { flip, rot, pivot:[px,py](以圖高為單位，x,y 就是這點), scatter 0~1, spread, lift, alpha, color, gap, glimmer, t })
  function drawShards(ctx, T, x, y, S, o) {
    o = o || {};
    const fl = o.flip ? -1 : 1, sc = clamp(o.scatter || 0), gap = o.gap == null ? Math.max(0.7, S * 0.005) : o.gap;
    const ga0 = ctx.globalAlpha, cr = Math.cos(o.rot || 0), sr = Math.sin(o.rot || 0), pv = o.pivot || [0, 0], base = ctx.globalAlpha * (o.alpha == null ? 1 : o.alpha), t = o.t || 0;
    for (const s of T) {
      const lx = (s.c[0] - pv[0]) * S * fl, ly = (s.c[1] - pv[1]) * S;
      let gx = x + lx * cr - ly * sr, gy = y + lx * sr + ly * cr, rot = 0, a = 1;
      if (sc > 0) {
        const ang = s.k * TAU * 3.7 + (o.seed || 0), dist = sc * sc * (0.25 + s.k * 0.9) * S * (o.spread || 1);
        gx += Math.cos(ang) * dist + (gx - x) * sc * 0.5; gy += Math.sin(ang) * dist + (gy - y) * sc * 0.5 - (o.lift || 0) * sc * S;
        rot = sc * (s.k - 0.5) * 7; a = 1 - sc;
      }
      if (a <= 0.01) continue;
      const rc = Math.cos(rot), rs = Math.sin(rot);
      ctx.globalAlpha = base * a;
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        let vx = (s.p[j][0] - s.c[0]) * S * fl, vy = (s.p[j][1] - s.c[1]) * S;
        const dd = Math.hypot(vx, vy) || 1, f = Math.max(0, 1 - gap / dd); vx *= f; vy *= f;
        const wx = vx * cr - vy * sr, wy = vx * sr + vy * cr, X = gx + wx * rc - wy * rs, Y = gy + wx * rs + wy * rc;
        j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.closePath(); ctx.fillStyle = o.color || s.f; ctx.fill();
      if (o.glimmer) { const g = Math.sin(t * 3 + s.k * 40); if (g > 0.6) { ctx.globalAlpha = base * a * o.glimmer * (g - 0.6) / 0.4; ctx.fillStyle = '#FFFFFF'; ctx.fill(); } }
    }
    ctx.globalAlpha = ga0;
  }

  // ── 小工具 ──
  function ngon(ctx, x, y, r, n, rot, sy) { ctx.beginPath(); for (let j = 0; j <= n; j++) { const a = rot + j / n * TAU; j ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * (sy || 1)) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * (sy || 1)); } ctx.closePath(); }
  // 多面寶石：中心扇形切成 n 片，每片一個色
  function gem(ctx, x, y, R, rot, cols, n, sy) {
    n = n || 6; sy = sy || 1;
    for (let j = 0; j < n; j++) {
      const a0 = rot + j / n * TAU, a1 = rot + (j + 1) / n * TAU;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R * sy); ctx.lineTo(x + Math.cos(a1) * R, y + Math.sin(a1) * R * sy); ctx.closePath();
      ctx.fillStyle = cols[j % cols.length]; ctx.fill();
    }
  }
  // 隨機形狀的小三角（填色或線框）
  function tri(ctx, x, y, r, rot, seed, fill, stroke, lw) {
    ctx.beginPath();
    for (let j = 0; j < 3; j++) { const a = rot + j * 2.094 + (hash(seed, j + 1) - 0.5) * 1.1, rr = r * (0.7 + hash(seed, j + 4) * 0.5); j ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  }
  // 低多邊形雲：一圈扇形三角，上面鼓、下面平
  function lowCloud(ctx, x, y, R, seed, cols, alpha) {
    const m = 8 + Math.floor(hash(seed, 1) * 4), pts = [], base = ctx.globalAlpha;
    for (let j = 0; j < m; j++) { const an = j / m * TAU, rr = R * (0.65 + hash(seed, 10 + j) * 0.45); pts.push([Math.cos(an) * rr * 1.6, Math.sin(an) * rr * (an > Math.PI ? 0.85 : 0.42)]); }
    ctx.globalAlpha = base * (alpha == null ? 1 : alpha);
    const ox = (hash(seed, 2) - 0.5) * R * 0.3, oy = -R * 0.15;
    for (let j = 0; j < m; j++) { const a = pts[j], b = pts[(j + 1) % m]; ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + a[0], y + a[1]); ctx.lineTo(x + b[0], y + b[1]); ctx.closePath(); ctx.fillStyle = cols[(j + seed) % cols.length]; ctx.fill(); }
    ctx.globalAlpha = base;
  }
  // 四角星（細長菱形十字）
  function star4(ctx, x, y, r, col) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.2, y - r * 0.2); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.2, y + r * 0.2); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.2, y + r * 0.2); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.2, y - r * 0.2); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
  // 碎片噴發：f 0~1，三角片從 (x,y) 往外飛、轉、落、淡出
  function spray(ctx, x, y, f, n, R, seed, cols, o) {
    if (f <= 0 || f >= 1) return; o = o || {};
    const base = ctx.globalAlpha;
    for (let i = 0; i < n; i++) {
      const an = (o.a0 == null ? 0 : o.a0) + (o.arc == null ? TAU : o.arc) * hash(seed + i, 1), sp = R * (0.35 + hash(seed + i, 2) * 0.65), e = ease(f);
      const px = x + Math.cos(an) * sp * e, py = y + Math.sin(an) * sp * e + (o.fall || 0) * f * f;
      ctx.globalAlpha = base * (1 - f) * (o.alpha == null ? 1 : o.alpha);
      const r = (o.size || 10) * (0.5 + hash(seed + i, 3)) * (1 - f * 0.5);
      if (i % 4 === 0 && o.wire !== false) tri(ctx, px, py, r, f * 6 * (hash(seed + i, 4) - 0.5) + i, seed + i, null, cols[i % cols.length], Math.max(1, r * 0.15));
      else tri(ctx, px, py, r, f * 6 * (hash(seed + i, 4) - 0.5) + i, seed + i, cols[i % cols.length]);
    }
    ctx.globalAlpha = base;
  }
  // 一圈斷開的多邊形環（每條邊各自一段，邊角帶小三角刻度）
  function brokenRing(ctx, x, y, r, n, rot, sy, col, lw, crack) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'butt';
    for (let j = 0; j < n; j++) {
      const a0 = rot + j / n * TAU, a1 = rot + (j + 1) / n * TAU, am = (a0 + a1) / 2, cx = Math.cos(am) * crack * r, cy = Math.sin(am) * crack * r * sy;
      const p0 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r * sy], p1 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r * sy];
      const s = 0.06; ctx.beginPath();
      ctx.moveTo(p0[0] + (p1[0] - p0[0]) * s + cx, p0[1] + (p1[1] - p0[1]) * s + cy); ctx.lineTo(p1[0] - (p1[0] - p0[0]) * s + cx, p1[1] - (p1[1] - p0[1]) * s + cy); ctx.stroke();
      const tx = Math.cos(a0), ty = Math.sin(a0), tr = lw * 1.6; ctx.beginPath(); ctx.moveTo(p0[0] + tx * tr * 2, p0[1] + ty * tr * 2 * sy); ctx.lineTo(p0[0] - ty * tr, p0[1] + tx * tr); ctx.lineTo(p0[0] + ty * tr, p0[1] - tx * tr); ctx.closePath(); ctx.fill();
    }
  }

  // ── 造型（先用平塗色塊畫，再切碎片） ──
  const SHAPES = {
    // 奔跑的貓（側面朝右）
    cat: (c) => {
      c.fillStyle = '#34323D'; c.strokeStyle = '#34323D';
      c.beginPath(); c.ellipse(100, 70, 56, 22, -0.06, 0, TAU); c.fill();
      c.beginPath(); c.arc(160, 50, 23, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(144, 36); c.lineTo(149, 12); c.lineTo(162, 30); c.fill();
      c.beginPath(); c.moveTo(163, 29); c.lineTo(178, 12); c.lineTo(180, 40); c.fill();
      c.lineCap = 'round'; c.lineWidth = 12;
      c.beginPath(); c.moveTo(130, 80); c.lineTo(160, 104); c.stroke();   // 前腳往前伸
      c.beginPath(); c.moveTo(70, 82); c.lineTo(40, 106); c.stroke();     // 後腳往後蹬
      c.lineWidth = 10; c.beginPath(); c.moveTo(50, 62); c.bezierCurveTo(26, 50, 22, 26, 6, 18); c.stroke();
      c.fillStyle = '#4C4A5C'; c.beginPath(); c.ellipse(108, 78, 40, 10, -0.06, 0, TAU); c.fill();   // 肚子亮一點
      c.fillStyle = '#24222B'; c.beginPath(); c.ellipse(96, 54, 40, 7, -0.08, 0, TAU); c.fill();     // 背脊暗一點
    },
    // 一條狐尾（根部在下、尾尖在上，尾尖白）
    tail: (c) => {
      c.save(); c.beginPath(); c.moveTo(60, 296); c.bezierCurveTo(10, 230, 6, 120, 40, 40); c.quadraticCurveTo(58, 2, 72, 30); c.bezierCurveTo(112, 110, 100, 220, 60, 296); c.closePath(); c.clip();
      c.fillStyle = '#3F6FD8'; c.fillRect(0, 0, 120, 300);
      c.fillStyle = '#4FB6FF'; c.beginPath(); c.ellipse(64, 150, 18, 110, 0.04, 0, TAU); c.fill();
      c.fillStyle = '#2A3F8F'; c.fillRect(0, 250, 120, 50);
      c.fillStyle = '#E6FBFF'; c.fillRect(0, 0, 120, 78); c.fillStyle = '#FFB3D1'; c.fillRect(0, 70, 120, 14);
      c.restore();
    },
    // 坐著的兔子剪影（月中）
    rabbit: (c) => {
      c.fillStyle = '#2C3E78';
      c.beginPath(); c.ellipse(100, 160, 52, 46, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(132, 104, 30, 0, TAU); c.fill();
      c.save(); c.translate(122, 78); c.rotate(-0.35); c.beginPath(); c.ellipse(0, -40, 11, 44, 0, 0, TAU); c.fill(); c.restore();
      c.save(); c.translate(140, 80); c.rotate(0.1); c.beginPath(); c.ellipse(0, -40, 10, 42, 0, 0, TAU); c.fill(); c.restore();
      c.beginPath(); c.arc(48, 178, 14, 0, TAU); c.fill();
      c.fillStyle = '#3B5296'; c.beginPath(); c.ellipse(110, 176, 34, 24, 0, 0, TAU); c.fill();
    },
    // 月亮（右下有一片暗面、幾個坑）
    moon: (c) => {
      c.save(); c.beginPath(); c.arc(120, 120, 116, 0, TAU); c.clip();
      c.fillStyle = '#FFF4C4'; c.fillRect(0, 0, 240, 240);
      c.fillStyle = '#F2E2A6'; c.beginPath(); c.arc(170, 160, 120, 0, TAU); c.fill();
      c.fillStyle = '#FFF9DE'; c.beginPath(); c.arc(80, 70, 70, 0, TAU); c.fill();
      c.fillStyle = '#E3CF8E'; for (const [x, y, r] of [[84, 92, 20], [150, 140, 15], [112, 186, 11], [176, 86, 9]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      c.restore();
    },
    // 太極
    taiji: (c) => {
      const R = 116, x = 120, y = 120;
      c.fillStyle = '#F4F1EA'; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
      c.fillStyle = '#2E2A33'; c.beginPath(); c.arc(x, y, R, -Math.PI / 2, Math.PI / 2); c.arc(x, y + R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true); c.arc(x, y - R / 2, R / 2, Math.PI / 2, -Math.PI / 2); c.fill();
      c.fillStyle = '#F4F1EA'; c.beginPath(); c.arc(x, y - R / 2, R / 6.5, 0, TAU); c.fill();
      c.fillStyle = '#2E2A33'; c.beginPath(); c.arc(x, y + R / 2, R / 6.5, 0, TAU); c.fill();
    },
  };
  const get = (name) => ({
    cat: () => shardify('cat', 200, 120, 12, SHAPES.cat, 0.14),
    catLo: () => shardify('catLo', 200, 120, 20, SHAPES.cat, 0.1),
    tail: () => shardify('tail', 120, 300, 17, SHAPES.tail, 0.1),
    rabbit: () => shardify('rabbit', 200, 220, 10, SHAPES.rabbit, 0.12),
    moon: () => shardify('moon', 240, 240, 24, SHAPES.moon, 0.05),
    taiji: () => shardify('taiji', 240, 240, 15, SHAPES.taiji, 0.07),
  })[name]();

  const PAL = {
    cat: ['#F5B82E', '#FFE08A', '#34323D', '#5A5868', '#8C8AA0'],
    fox: ['#2A3F8F', '#3F6FD8', '#4FB6FF', '#9FE0FF', '#E6FBFF', '#FFB3D1'],
    moon: ['#FFF4C4', '#FFE7A0', '#F5B82E', '#C9D3F0', '#F2C6D8'],
    panda: ['#2E2A33', '#F4F1EA', '#E5484D', '#F5B82E', '#FFC23C'],
    rain: ['#8FDCFF', '#BFEFFF', '#4FB6FF', '#E6FBFF'],
  };
  // 八卦：每卦三爻，1 陽（整條）0 陰（中間斷）
  const TRIGRAMS = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]];

  // ════════ 九命貓影用的零件：低多邊形貓 ════════
  // 每隻貓由約六十片大三角組成（身體三列×六欄、頭一圈八片、耳、腿、尾巴一串），每格依骨架直接算出來，
  // 所以跑步、撲擊都是連續動作；片與片之間留縫，和碎片青龍同一套語言。
  // 圖框座標：KW×KH，貓頭朝右，腳底在 y=KFOOT，(KPX,KPY) 是錨點（畫到畫面上時 x,y 就是這一點）。
  const KW = 380, KH = 240, KFOOT = 226, KPX = 190, KPY = 150;
  const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t)).toString(16).padStart(2, '0')).join(''); };
  const shadeHex = (h, f) => f > 0 ? mixHex(h, '#FFFFFF', f) : mixHex(h, '#000000', -f);
  const hexA = (h, a) => { const c = hexRGB(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  // 九種貓都從同一個色調家族取色（偏墨青、略減飽和），金色只留給眼睛、爪痕、命燈和終幕
  const KBASE = { hr: 1, cheek: 1, bt: 1, leg: 1, tw: 15, tailLen: 1, ear: 1, eyeS: 1, sz: 1, pupil: 0.8, earIn: '#C99AA0' };
  const BREEDS = [
    { dark: '#A9622F', mid: '#CF8A4C', light: '#EADBC2', stripe: '#9A5428', socks: true, brow: true, eye: ['#EDC35A', '#EDC35A'], hr: 1.12, cheek: 1.18, bt: 1.14 },                       // 一命 橘貓：橘白、條紋、圓胖臉
    { dark: '#C4C3BA', mid: '#E6E2D7', light: '#F4F1EA', calico: ['#CF8A4C', '#2C3238'], eye: ['#A9C76E', '#A9C76E'] },                                                       // 二命 三花：白底，橘黑兩組色塊
    { dark: '#1C2229', mid: '#272F38', light: '#323C47', rim: '#6FA3A8', eye: ['#F2C14E', '#F2C14E'], eyeS: 1.22, pupil: 0.45, earIn: '#3E4A55' },                            // 三命 黑貓：背上一道冷光
    { dark: '#C2CECC', mid: '#E6EBE8', light: '#F6F7F4', eye: ['#78B8DA', '#F2C14E'], eyeS: 1.1 },                                                                          // 四命 白貓：異色瞳
    { dark: '#C7B69B', mid: '#E2D6C0', light: '#F1E9DA', point: '#4A3B34', eye: ['#78B8DA', '#78B8DA'], hr: 0.94, bt: 0.9, tw: 12, leg: 0.92, earIn: '#4A3B34' },               // 五命 暹羅：臉、耳、腳、尾深色
    { dark: '#6E6655', mid: '#8F8571', light: '#CBC2AE', stripe: '#3B3833', M: true, eye: ['#B9C85E', '#B9C85E'] },                                                          // 六命 虎斑：條紋＋額頭 M
    { dark: '#626E7B', mid: '#7D8996', light: '#97A2AD', eye: ['#E39A48', '#E39A48'], eyeS: 1.16, pupil: 0.55, hr: 1.2, cheek: 1.24, bt: 1.24, leg: 1.18, tw: 19, tailLen: 0.8, ear: 0.72 }, // 七命 英短：藍灰圓臉、銅眼
    { dark: '#5F4C39', mid: '#8A6C4F', light: '#E1D4BD', stripe: '#4E3B2B', ruff: true, tuft: true, bushy: true, eye: ['#CDBF55', '#CDBF55'], ear: 1.18, sz: 1.14, tw: 23, tailLen: 0.92 }, // 八命 緬因：大、圍脖、耳尖簇毛、蓬尾
    { dark: '#B4A182', mid: '#D6C4A4', light: '#F0E6D3', stripe: '#BFA77F', fold: true, eye: ['#EDC35A', '#EDC35A'], eyeS: 1.36, pupil: 0.4, hr: 1.16, cheek: 1.1 },           // 九命 折耳：耳朵往前摺、大圓眼
    { dark: '#C98A1E', mid: '#EDB13C', light: '#FFE4A0', stripe: '#FFD36B', eye: ['#FFF6DA', '#FFF6DA'], earIn: '#FFD36B', hr: 1.06, cheek: 1.08 },                          // 終幕：九命合一的金貓
  ].map((b) => Object.assign({}, KBASE, b));
  const KGOLD = ['#FFE7A6', '#F5C451', '#E9A21E', '#C98A12'];

  // 姿勢：腿的角度從垂直往下量，正＝往前；[大腿, 小腿]。tl＝尾巴三個控制點（相對尾根）
  const KGAL = [
    { bx: KPX, by: 140, tilt: -0.04, st: 1.1, arch: -0.05, fn: [1.2, 1.5], ff: [1.0, 1.3], bn: [-1.1, -1.55], bf: [-0.9, -1.35], hd: [24, -30], tl: [[-28, -10], [-62, -26], [-96, -46]] },   // 騰空伸展
    { bx: KPX, by: 150, tilt: 0.08, st: 1.0, arch: 0, fn: [0.3, 0.05], ff: [0.7, 0.85], bn: [-0.55, -1.05], bf: [-0.25, -0.75], hd: [24, -26], tl: [[-26, -16], [-56, -42], [-80, -70]] },     // 前腳著地
    { bx: KPX, by: 146, tilt: 0.02, st: 0.88, arch: 0.3, fn: [-0.6, -0.9], ff: [-0.35, -0.55], bn: [0.7, 0.2], bf: [0.95, 0.5], hd: [22, -30], tl: [[-22, -24], [-38, -62], [-22, -96]] },  // 四腳收攏、背拱
    { bx: KPX, by: 144, tilt: -0.1, st: 1.0, arch: 0.05, fn: [0.7, 1.05], ff: [0.4, 0.7], bn: [-0.3, -0.2], bf: [-0.6, -0.65], hd: [26, -32], tl: [[-26, -18], [-58, -40], [-84, -70]] },   // 後腳蹬地
  ];
  const KPOSE = {
    pounce: { bx: KPX, by: 132, tilt: -0.42, st: 1.08, arch: 0, fn: [1.5, 1.75], ff: [1.25, 1.6], bn: [-0.25, -0.35], bf: [-0.45, -0.55], hd: [24, -28], tl: [[-30, 6], [-64, 2], [-96, -22]] },   // 撲：前爪往前伸
    crouch: { bx: KPX, by: 168, tilt: 0.08, st: 0.95, arch: 0.12, fn: [0.9, -0.6], ff: [1.05, -0.45], bn: [1.0, -0.25], bf: [1.15, -0.1], hd: [30, -16], tl: [[-30, -4], [-62, -4], [-92, -14]] }, // 伏低
    sit: { bx: KPX, by: 170, tilt: -0.55, st: 0.86, arch: 0.05, fn: [0.42, 0.5], ff: [0.55, 0.62], bn: [1.45, -0.9], bf: [1.55, -0.8], hd: [10, -34], tl: [[-24, 4], [-58, 4], [-94, -8]] },        // 坐下
    leap: Object.assign({}, KGAL[0], { st: 1.16, by: 136, tl: [[-30, -6], [-66, -14], [-104, -24]] }),
  };
  const mixPose = (a, b, t) => Array.isArray(a) ? a.map((v, i) => mixPose(v, b[i], t)) : typeof a === 'number' ? a + (b - a) * t : (a && typeof a === 'object') ? Object.fromEntries(Object.keys(a).map((k) => [k, b && k in b ? mixPose(a[k], b[k], t) : a[k]])) : a;
  const smooth = (x) => x * x * (3 - 2 * x);
  // 跑步：相位連續，四個關鍵姿勢之間平順內插
  const gallop = (ph) => { const x = ((ph % 1) + 1) % 1 * 4, i = Math.floor(x); return mixPose(KGAL[i], KGAL[(i + 1) % 4], smooth(x - i)); };

  // 依品種與姿勢組出一隻貓的三角片（圖框座標）。回傳 { F: [{p:[3點], c:色}], eyes }
  function catMesh(B, p) {
    const ct = Math.cos(p.tilt), st = Math.sin(p.tilt), rx = 74 * p.st, ry = 26 * B.bt, g = p.look || 1, ar = (p.arch || 0) * 22;
    const L = (lx, ly) => [p.bx + lx * ct - ly * st, p.by + lx * st + ly * ct];
    const F = [], add = (a, b, c, col) => F.push({ p: [a, b, c], c: col });
    const quad = (a, b, c, d, c1, c2, flip) => { if (flip) { add(a, b, d, c1); add(b, c, d, c2 || c1); } else { add(a, b, c, c1); add(a, c, d, c2 || c1); } };
    const off = (q, n, s) => [q[0] + n[0] * s, q[1] + n[1] * s];
    const nrm = (u, v, w) => { const dx = v[0] - u[0], dy = v[1] - u[1], d = Math.hypot(dx, dy) || 1; return [-dy / d * w, dx / d * w]; };
    const dk = B.dark, md = B.mid, lt = B.light, pt = B.point, belly = B.rim ? shadeHex(md, 0.06) : lt;
    // ── 腿：大腿、小腿各一個楔形（兩片），腳掌一片尖三角 ──
    const l1 = 34, l2 = 37, legPts = (o, a) => { const kn = [o[0] + Math.sin(a[0]) * l1, o[1] + Math.cos(a[0]) * l1]; return [o, kn, [kn[0] + Math.sin(a[1]) * l2, kn[1] + Math.cos(a[1]) * l2]]; };
    const sh = L(rx * 0.6, ry * 0.25), hip = L(-rx * 0.62, ry * 0.15);
    const legs = { fn: legPts(sh, p.fn), ff: legPts([sh[0] - 8, sh[1] - 4], p.ff), bn: legPts(hip, p.bn), bf: legPts([hip[0] + 8, hip[1] - 4], p.bf) };
    const leg = (Lg, w1, cU, cL) => {
      const [a, b, c] = Lg, n1 = nrm(a, b, w1 * B.leg), n2 = nrm(a, c, 8.5 * B.leg), n3 = nrm(b, c, 6.5 * B.leg);
      quad(off(a, n1, 1), off(b, n2, 1), off(b, n2, -1), off(a, n1, -1), cU, shadeHex(cU, -0.07));
      quad(off(b, n2, 1), off(c, n3, 1), off(c, n3, -1), off(b, n2, -1), cL, shadeHex(cL, -0.09));
      add(off(c, n3, 1.25), off(c, n3, -1.25), [c[0] + 13 * B.leg, c[1] + 1], shadeHex(cL, 0.07));
    };
    const lowCol = (near) => pt ? (near ? pt : shadeHex(pt, -0.25)) : B.socks ? (near ? lt : shadeHex(lt, -0.18)) : (near ? md : dk);
    leg(legs.ff, 11, dk, lowCol(false)); leg(legs.bf, 13, dk, lowCol(false));
    // ── 尾巴：一串逐漸變細的楔形 ──
    const tr = L(-rx * 0.95, -ry * 0.3), tl = p.tl.map(([a, b]) => { const x = a * B.tailLen, y = b * B.tailLen; return [tr[0] + x * ct - y * st, tr[1] + x * st + y * ct]; });
    const bez = (t) => { const m = 1 - t, P0 = tr, [P1, P2, P3] = tl; return [0, 1].map((k) => m * m * m * P0[k] + 3 * m * m * t * P1[k] + 3 * m * t * t * P2[k] + t * t * t * P3[k]); };
    const TN = 6, tq = [], tn = [];
    for (let j = 0; j <= TN; j++) tq.push(bez(j / TN));
    for (let j = 0; j <= TN; j++) { const t = j / TN, w = B.bushy ? B.tw * (0.62 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.2 + t))) : B.tw * 0.55 * (1 - 0.62 * t); tn.push(nrm(tq[Math.max(0, j - 1)], tq[Math.min(TN, j + 1)], w)); }
    for (let j = 0; j < TN; j++) {
      let c = B.stripe && j % 2 ? B.stripe : md;
      if (pt) c = pt; if (B.calico && j >= 3) c = B.calico[1];
      if (j < TN - 1) quad(off(tq[j], tn[j], 1), off(tq[j + 1], tn[j + 1], 1), off(tq[j + 1], tn[j + 1], -1), off(tq[j], tn[j], -1), shadeHex(c, 0.05), shadeHex(c, -0.08));
      else add(off(tq[j], tn[j], 1), tq[TN], off(tq[j], tn[j], -1), shadeHex(c, 0.03));
      if (B.bushy && j > 0 && j < TN - 1) for (const s of [1, -1]) { const m = [(tq[j][0] + tq[j + 1][0]) / 2, (tq[j][1] + tq[j + 1][1]) / 2], n = [(tn[j][0] + tn[j + 1][0]) / 2, (tn[j][1] + tn[j + 1][1]) / 2]; add(off(tq[j], tn[j], s * 0.9), off(m, n, s * 1.65), off(tq[j + 1], tn[j + 1], s * 0.9), shadeHex(c, s > 0 ? 0.1 : -0.12)); }
    }
    // ── 身體：上中下三列 × 六欄 ──
    const xs = [-1.02, -0.74, -0.42, -0.08, 0.26, 0.6, 0.92], ty = [-0.3, -1.0, -1.08, -1.02, -1.0, -0.95, -0.72], by_ = [0.5, 0.95, 0.9, 0.72, 0.82, 0.95, 0.62];
    const ta = [0.2, 0.7, 1, 1, 0.8, 0.5, 0.2], ba = [0, 0.1, 0.3, 0.5, 0.3, 0.1, 0];
    const T = xs.map((x, i) => L(x * rx + (i % 6 ? (hash(i, 7) - 0.5) * 8 : 0), ty[i] * ry - ar * ta[i])), Bt = xs.map((x, i) => L(x * rx + (i % 6 ? (hash(i, 8) - 0.5) * 10 : 0), by_[i] * ry - ar * ba[i] * 0.5));
    const M = T.map((q, i) => [q[0] + (Bt[i][0] - q[0]) * (0.4 + hash(i, 4) * 0.14) + (hash(i, 9) - 0.5) * 12, q[1] + (Bt[i][1] - q[1]) * (0.4 + hash(i, 4) * 0.14)]);
    for (let i = 0; i < 6; i++) {
      let cTop = shadeHex(dk, (i % 2) * 0.05), cMid = shadeHex(md, ((i + 1) % 2) * 0.05), cBot = shadeHex(belly, -(i % 2) * 0.05);
      if (B.stripe && i % 2 === 0) { cTop = B.stripe; cMid = shadeHex(B.stripe, 0.12); }
      if (B.calico) { if (i === 1 || i === 2) { cTop = B.calico[0]; cMid = shadeHex(B.calico[0], 0.08); } if (i === 4) cTop = B.calico[1]; }
      if (B.socks && i >= 4) cBot = lt;
      quad(T[i], T[i + 1], M[i + 1], M[i], cTop, shadeHex(cTop, -0.07), i % 2);
      quad(M[i], M[i + 1], Bt[i + 1], Bt[i], cMid, shadeHex(cMid, -0.06), (i + 1) % 2);
      add(Bt[i], Bt[i + 1], L((xs[i] + xs[i + 1]) / 2 * rx, (by_[i] + by_[i + 1]) / 2 * ry + 7), cBot);   // 肚子下緣一片
      if (B.rim) add(T[i], T[i + 1], [(T[i][0] + T[i + 1][0]) / 2, (T[i][1] + T[i + 1][1]) / 2 + 5], B.rim);   // 黑貓背上冷光
    }
    add(T[0], M[0], L(-rx * 1.16, ry * 0.05), shadeHex(dk, 0.04));   // 屁股
    // ── 近側兩條腿 ──
    leg(legs.bn, 15, md, lowCol(true)); leg(legs.fn, 12, md, lowCol(true));
    // ── 頭：一圈八片，耳朵兩片 ──
    const neck = L(rx * 0.78, -ry * 0.5), hr = 36 * B.hr, hd = [neck[0] + p.hd[0] + 2, neck[1] + p.hd[1] - 2], H = (x, y) => [hd[0] + g * x * hr, hd[1] + y * hr];
    const ring = [[-0.86, -0.22], [-0.48, -0.82], [0.16, -0.94], [0.8, -0.52], [B.cheek, 0.1], [0.6, 0.62], [-0.06, 0.78], [-0.86 * B.cheek, 0.38]].map(([x, y]) => H(x, y)), fc = H(0.14, 0.04);
    quad(T[5], T[6], ring[6], ring[7], shadeHex(md, -0.04), dk);                     // 脖子
    add(T[6], Bt[6], ring[6], B.ruff ? lt : (B.socks ? lt : md));
    const ear = (a, b, tip, inner) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; add(a, tip, m, dk); add(m, tip, b, inner); };
    const earIn = pt || B.earIn;
    if (!B.fold) {
      ear(ring[0], ring[1], H(-0.7, -1.0 - 0.55 * B.ear), shadeHex(earIn, -0.15));
      ear(ring[2], ring[3], H(0.62, -1.02 - 0.62 * B.ear), earIn);
      if (B.tuft) { const t1 = H(-0.7, -1.0 - 0.55 * B.ear), t2 = H(0.62, -1.02 - 0.62 * B.ear); for (const q of [t1, t2]) add([q[0] - 3, q[1] + 2], [q[0] + 3, q[1] + 2], [q[0] + g * 2, q[1] - 0.42 * hr], '#2A2018'); }
    }
    const fcol = [md, shadeHex(md, 0.07), shadeHex(md, 0.12), md, lt, shadeHex(lt, -0.06), shadeHex(md, -0.06), dk];
    if (B.rim) { fcol[4] = shadeHex(md, 0.1); fcol[5] = md; }
    if (pt) { fcol[3] = shadeHex(pt, 0.08); fcol[4] = pt; fcol[5] = shadeHex(pt, -0.1); fcol[2] = mixHex(md, pt, 0.35); }
    if (B.calico) { fcol[0] = B.calico[1]; fcol[1] = shadeHex(B.calico[1], 0.08); fcol[7] = shadeHex(B.calico[1], -0.05); fcol[3] = B.calico[0]; }
    for (let i = 0; i < 8; i++) add(fc, ring[i], ring[(i + 1) % 8], fcol[i]);
    if (B.fold) { add(H(0.02, -0.96), H(0.78, -0.6), H(0.46, -0.42), dk); add(H(-0.78, -0.36), H(-0.3, -0.9), H(-0.22, -0.52), shadeHex(dk, -0.08)); }   // 折耳：兩片往前摺的小楔
    const sliver = (x, col) => add(H(x - 0.07, -0.86), H(x + 0.07, -0.86), H(x + 0.02, -0.5), col);
    if (B.M) { sliver(-0.18, B.stripe); sliver(0.08, B.stripe); sliver(0.34, B.stripe); add(H(-0.12, -0.5), H(0.32, -0.5), H(0.1, -0.36), B.stripe); }
    if (B.brow) { sliver(-0.12, B.stripe); sliver(0.16, B.stripe); }
    if (B.ruff) for (let j = 0; j < 5; j++) { const a = mixPose(ring[6], Bt[6], j / 4), b = mixPose(ring[6], Bt[6], (j + 0.7) / 4); add(a, b, [(a[0] + b[0]) / 2 + 3, (a[1] + b[1]) / 2 + 13 + (j % 2) * 5], j % 2 ? lt : shadeHex(lt, -0.08)); }
    const es = B.eyeS;
    return { F, eyes: [{ c: H(0.5, -0.1), r: 0.23 * hr * es, col: B.eye[0] }, { c: H(-0.17, -0.12), r: 0.19 * hr * es, col: B.eye[1] }], legs };
  }

  // 寶石貓眼：四片菱形，瞳孔是一道細細的深色菱形；open 0 閉～1 開，slit 0 圓～1 一條縫
  function gemEye(ctx, x, y, r, col, open, slit, glow) {
    if (glow > 0) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2); gr.addColorStop(0, hexA(col, 0.45 * glow)); gr.addColorStop(1, hexA(col, 0)); ctx.fillStyle = gr; ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4); }
    const sy = 0.74 * Math.max(0.06, open);
    gem(ctx, x, y, r, 0, [shadeHex(col, 0.28), shadeHex(col, -0.05), shadeHex(col, -0.3), shadeHex(col, 0.06)], 4, sy);
    if (open < 0.15) return;
    const ph = r * sy * 0.92, pw = r * (0.42 - 0.34 * slit);
    ctx.fillStyle = '#0D1418'; ctx.beginPath(); ctx.moveTo(x, y - ph); ctx.lineTo(x + pw, y); ctx.lineTo(x, y + ph); ctx.lineTo(x - pw, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.08); ctx.lineTo(x - r * 0.2, y - r * 0.36 * sy / 0.74); ctx.lineTo(x - r * 0.24, y - r * 0.02); ctx.closePath(); ctx.fill();
  }

  // 畫一隻貓。o：{ a 拼起來 0～1, d 散成光點 0～1（飛向 to）, e 炸開 0～1, glow, slit, eyeOpen, seed }
  function drawCat(ctx, B, pose, x, y, S, dir, th, o) {
    o = o || {};
    const M = catMesh(B, pose), s = S / KH, rot = -dir * th, cr = Math.cos(rot), sr = Math.sin(rot);
    const W2 = (q) => { const lx = (q[0] - KPX) * s * dir, ly = (q[1] - KPY) * s; return [x + lx * cr - ly * sr, y + lx * sr + ly * cr]; };
    const a = o.a == null ? 1 : o.a, d = o.d || 0, e = o.e || 0, gap = Math.max(1.1, S * 0.0065), base = ctx.globalAlpha, seed = o.seed || 0;
    M.F.forEach((f, i) => {
      const h = hash(i + seed * 17, 5), P = f.p.map(W2), cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3;
      let gx = cx, gy = cy, rr = 0, sc = 1, al = 1, col = f.c;
      if (a < 1) {   // 拼起來：每片錯開時間，從四周旋轉飛進來
        const q = clamp((a - h * 0.45) / 0.55); if (q <= 0) return;
        const eq = ease(q), an = h * TAU * 3.1 + seed; gx += (1 - eq) * (Math.cos(an) * S * 0.32); gy += (1 - eq) * (Math.sin(an) * S * 0.22 - S * 0.12); rr = (1 - eq) * (h - 0.5) * 6; sc = 0.35 + 0.65 * eq; al = eq;
      }
      if (d > 0) {   // 散成光點：一片片沿弧線飛向命燈，越飛越小、越金
        const q = clamp((d - h * 0.35) / 0.65); if (q >= 1) return;
        const eq = q * q * (3 - 2 * q), tx = o.to ? o.to[0] : cx, ty = o.to ? o.to[1] : cy - S, kx = x + (cx - x) * 0.3 + (h - 0.5) * S * 0.12, ky = y - S * 0.55, m = 1 - eq;
        gx = m * m * cx + 2 * m * eq * kx + eq * eq * tx; gy = m * m * cy + 2 * m * eq * ky + eq * eq * ty; rr = eq * (h - 0.5) * 6; sc = Math.max(0.12, 1 - 1.7 * Math.sqrt(eq)); al *= 1 - Math.pow(q, 3); col = mixHex(col, KGOLD[i % 3], eq * 3);
      }
      if (e > 0) {   // 炸開：往外噴、轉、落、淡
        const an = h * TAU * 3.7 + seed, dist = e * (0.35 + h * 0.9) * S * 1.1; gx += Math.cos(an) * dist + (cx - x) * e * 0.6; gy += Math.sin(an) * dist + (cy - y) * e * 0.6 + e * e * S * 0.3; rr = e * (h - 0.5) * 8; al *= 1 - e; sc = 1 - e * 0.3;
      }
      if (al <= 0.01) return;
      const rc = Math.cos(rr), rs = Math.sin(rr);
      ctx.globalAlpha = base * al; ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        let vx = P[j][0] - cx, vy = P[j][1] - cy; const dd = Math.hypot(vx, vy) || 1, ff = Math.max(0, 1 - gap / dd) * sc; vx *= ff; vy *= ff;
        const X = gx + vx * rc - vy * rs, Y = gy + vx * rs + vy * rc; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    });
    const ea = clamp((a - 0.7) / 0.3) * (1 - clamp(d / 0.18)) * (1 - e);
    if (ea > 0) { ctx.globalAlpha = base * ea; M.eyes.forEach((E) => { const w = W2(E.c); gemEye(ctx, w[0], w[1], E.r * s, E.col, o.eyeOpen == null ? 1 : o.eyeOpen, o.slit == null ? B.pupil : o.slit, o.glow || 0); }); }
    ctx.globalAlpha = base;
    return { M, W2 };
  }

  // 肉球：扁六角掌墊＋四顆小菱形趾頭
  function pawHex(ctx, x, y, r, rot, sy, c1, c2) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, sy); ctx.rotate(rot);
    gem(ctx, 0, r * 0.28, r * 0.5, Math.PI / 6, [c1, c2, c1, c2, c1, c2], 6, 0.8);
    for (let j = 0; j < 4; j++) { const an = -Math.PI / 2 + (j - 1.5) * 0.55; gem(ctx, Math.cos(an) * r * 0.74, Math.sin(an) * r * 0.62 + r * 0.04, r * 0.2, Math.PI / 2, [c2, c1], 4, 1.3); }
    ctx.restore();
  }
  // 三道金色爪痕：每道是兩片尖楔；f＝劃下後幾秒：一劃而下、停一下、斷開飛散
  function clawWedges(ctx, x, y, ang, len, f, seed) {
    if (f <= 0 || f >= 0.8) return;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, drawn = ease(f / 0.08), brk = clamp((f - 0.24) / 0.5), base = ctx.globalAlpha;
    if (f < 0.2) { ctx.globalAlpha = base * (1 - f / 0.2); star4(ctx, x, y, len * 0.42 * (0.5 + drawn * 0.5), '#FFF4CF'); }
    for (let s = -1; s <= 1; s++) {
      const sl = len * (s ? 0.8 : 1) * drawn, o = s * len * 0.2, A = [x + nx * o - ux * len * 0.5 + ux * Math.abs(s) * len * 0.08, y + ny * o - uy * len * 0.5 + uy * Math.abs(s) * len * 0.08];
      const E = [A[0] + ux * sl, A[1] + uy * sl], Mx = A[0] + ux * sl * 0.42 + nx * len * 0.05, My = A[1] + uy * sl * 0.42 + ny * len * 0.05, w = len * 0.085;
      const parts = [[A, [Mx + nx * w, My + ny * w], [Mx - nx * w * 0.35, My - ny * w * 0.35], KGOLD[0]], [[Mx + nx * w, My + ny * w], E, [Mx - nx * w * 0.35, My - ny * w * 0.35], KGOLD[1]]];
      parts.forEach((q, j) => {
        const h = hash(seed * 5 + s + 2, j), cx = (q[0][0] + q[1][0] + q[2][0]) / 3, cy = (q[0][1] + q[1][1] + q[2][1]) / 3, bb = ease(brk);
        const gx = cx + (nx * s * 0.6 + (h - 0.5)) * len * 0.55 * bb, gy = cy + (ny * s * 0.6) * len * 0.55 * bb + len * 0.35 * brk * brk, rr = (h - 0.5) * 4 * bb, rc = Math.cos(rr), rs = Math.sin(rr);
        ctx.globalAlpha = base * (1 - brk); ctx.beginPath();
        q.slice(0, 3).forEach((v, k) => { let vx = v[0] - cx, vy = v[1] - cy; const dd = Math.hypot(vx, vy) || 1, ff = Math.max(0, 1 - 1.6 / dd); vx *= ff; vy *= ff; const X = gx + vx * rc - vy * rs, Y = gy + vx * rs + vy * rc; k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.closePath(); ctx.fillStyle = q[3]; ctx.fill();
      });
    }
    ctx.globalAlpha = base;
    spray(ctx, x, y, brk, 12, len * 0.7, seed * 13, KGOLD, { size: len * 0.045, fall: len * 0.4 });
  }
  // 命燈：六角寶石燈，點亮後轉成金色切面，燈心一個六角肉球
  function lifeLantern(ctx, x, y, R, lit, flare, u, i) {
    ctx.save(); ctx.translate(x, 0); ctx.rotate(Math.sin(u * 2.1 + i * 1.3) * 0.05); ctx.translate(0, y);
    const base = ctx.globalAlpha;
    ctx.strokeStyle = 'rgba(120,150,150,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -y); ctx.lineTo(0, -R * 1.25); ctx.stroke();
    if (lit > 0) { const gr = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * (2.4 + flare * 1.4)); gr.addColorStop(0, `rgba(255,200,100,${0.3 * lit + 0.3 * flare})`); gr.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = gr; ctx.fillRect(-R * 4, -R * 4, R * 8, R * 8); }
    const pop = 1 + 0.18 * flare; ctx.scale(pop, pop);
    gem(ctx, 0, -R * 1.2, R * 0.26, Math.PI / 2, ['#3B5560', '#2A4049'], 4, 1);
    gem(ctx, 0, 0, R, -Math.PI / 2, ['#2F4A54', '#28414B', '#20363F', '#1B2F37', '#20363F', '#28414B'], 6, 1.15);
    if (lit > 0) { ctx.globalAlpha = base * lit; gem(ctx, 0, 0, R, -Math.PI / 2, ['#FFE7A6', '#F5C451', '#E9A21E', '#C98A12', '#E9A21E', '#F5C451'], 6, 1.15); ctx.globalAlpha = base; }
    pawHex(ctx, 0, R * 0.04, R * 0.5, 0, 1, lit > 0.5 ? '#9A6516' : '#152730', lit > 0.5 ? '#B47A1E' : '#1A2E37');
    ctx.fillStyle = lit > 0.5 ? KGOLD[2] : '#2A4049'; ctx.beginPath(); ctx.moveTo(-R * 0.18, R * 1.2); ctx.lineTo(R * 0.18, R * 1.2); ctx.lineTo(0, R * 1.85); ctx.closePath(); ctx.fill();
    if (flare > 0.05) { ctx.globalAlpha = base * flare; star4(ctx, 0, 0, R * 1.6, '#FFF4CF'); }
    ctx.restore();
  }
  // 天上的大貓眼：杏仁形，虹膜一圈金色切面，瞳孔由圓收成直縫
  function skyEye(c, x, y, w, h, open, slit) {
    const a = w / 2, b = h / 2 * open;
    const almond = (aa, bb) => { c.beginPath(); c.moveTo(x - aa, y); c.lineTo(x - aa * 0.45, y - bb * 0.92); c.lineTo(x + aa * 0.45, y - bb * 0.92); c.lineTo(x + aa, y); c.lineTo(x + aa * 0.45, y + bb * 0.92); c.lineTo(x - aa * 0.45, y + bb * 0.92); c.closePath(); };
    if (open <= 0.04) { c.fillStyle = '#0E1A20'; almond(a, h * 0.03); c.fill(); return; }
    c.fillStyle = '#0E1A20'; almond(a + h * 0.1, b + h * 0.08); c.fill();
    c.save(); almond(a, b); c.clip();
    c.fillStyle = '#B9780E'; c.fillRect(x - a, y - h, w, h * 2);
    gem(c, x, y, h * 0.66, 0.3, ['#FFE7A6', '#F5C451', '#E9A21E', '#FFD36B', '#F5C451', '#C98A12', '#FFF0C0', '#E9A21E', '#F5C451', '#FFD36B'], 10);
    gem(c, x, y, h * 0.36, 0.0, ['#F5C451', '#E9A21E', '#C98A12', '#E9A21E', '#FFD36B', '#E9A21E', '#C98A12', '#E9A21E'], 8);
    const pw = h * 0.3 * (1 - 0.86 * slit) + 1.5, ph = h * (0.4 + 0.08 * slit);
    c.fillStyle = '#0D1418'; c.beginPath(); c.moveTo(x, y - ph); c.lineTo(x + pw, y); c.lineTo(x, y + ph); c.lineTo(x - pw, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.moveTo(x - h * 0.32, y - h * 0.2); c.lineTo(x - h * 0.15, y - h * 0.3); c.lineTo(x - h * 0.2, y - h * 0.1); c.closePath(); c.fill();
    c.restore();
  }
  const skyEyeShards = () => shardify('k9:eye2', 400, 200, 22, (c) => skyEye(c, 200, 100, 380, 170, 1, 1), 0.04);

  root.GeoFx = { hash, shardify, drawShards, gem, tri, lowCloud, star4, spray, ngon, brokenRing, get, PAL };

  // G 由 fx.html 每一格更新：{ ctx, P, W, H }
  root.makeGeoFx = function (G) {
    return {
      // ── 靈貓．鈴音鎮魂：金色八角音環一圈圈盪開，到外圈裂成一段段，鈴鐺是一顆多面金鈴 ──
      bellwave(u, A, k) {
        const { ctx, P, W, H } = G, far = Math.hypot(W, H), bx = P.x, by = P.y - 96 * k, sw = Math.sin(u * 14) * 0.35 * Math.max(0, 1 - u / 1.6);
        ctx.save(); ctx.globalAlpha *= A;
        for (let i = 0; i < 6; i++) {
          const p = (u - i * 0.26) / 1.5; if (p <= 0 || p >= 1) continue;
          ctx.globalAlpha = A * Math.pow(1 - p, 1.1) * 0.95;
          brokenRing(ctx, P.x, P.y, 40 * k + p * far * 0.72, 8, i * 0.2 + p * 0.5, 0.82, i % 2 ? '#34323D' : '#F5B82E', (7 - p * 4.5) * k, Math.max(0, p - 0.55) * 0.35);
        }
        ctx.globalAlpha = A;
        for (let i = 0; i < 3; i++) spray(ctx, P.x, P.y, (u - i * 0.5) / 1.4, 18, far * 0.45, 30 + i * 40, PAL.cat, { size: 11 * k });
        // 金鈴：倒過來的八邊形寶石＋鈴舌
        ctx.save(); ctx.translate(bx, by); ctx.rotate(sw);
        ctx.fillStyle = '#E5484D'; ctx.fillRect(-4 * k, -40 * k, 8 * k, 14 * k);
        gem(ctx, 0, 0, 30 * k, Math.PI / 8 + u * 0.8, ['#FFE08A', '#F5B82E', '#E9A21E', '#FFF6D0', '#F5B82E', '#C98A12', '#FFE08A', '#E9A21E'], 8, 0.92);
        gem(ctx, 0, 30 * k, 8 * k, u * 3, ['#34323D', '#5A5868', '#34323D', '#8C8AA0'], 4);
        ctx.restore();
        ctx.restore();
      },

      // ── 靈貓．九命貓影（以 4.2 秒排時間，D 不同就等比伸縮）──
      // 開場：夜色暗下，九對寶石貓眼沿著一道拱依序睜開（由中間往兩側），瞳孔由圓收成直縫。
      // 九命：每 0.2 秒一隻，由碎片拼出來、跑兩步、撲上拱上自己那一點，留下三道金爪痕；
      //       撲完一片片化成金光飛回頂上自己那盞命燈。一隻在中間、之後左右交替往外，像一把扇子打開。
      // 終幕：命燈依序一亮（喘一口氣），光流下來拼成金色大貓，從角色頭上躍過、落地坐起抬頭；
      //       天上睜開一隻大貓眼、眨一下，全部碎成金屑。
      shadows(u, A, k, D) {
        const { ctx, P, W, H } = G, T = u * 4.2 / D;
        const S0 = Math.min(330 * k, H * 0.44), gyOf = (s) => P.ground - (KFOOT - KPY) / KH * s;
        const LS = Math.min(112 * k, (W - 40) / 9), LR = Math.min(LS * 0.24, 17 * k), lan = (i) => [W / 2 + (i - 4) * LS, 16 * k + hash(i, 31) * 12 * k + LR * 1.3];
        const lanBot = 28 * k + LR * 3.2 + 6 * k;
        // 拱上九個撲擊點：中間最高，兩端貼近地面
        const cx = clamp(P.x, W * 0.42, W * 0.58), rxA = Math.max(60 * k, Math.min(cx, W - cx) - 0.5 * S0), ay = Math.max(lanBot + 0.34 * S0, H * 0.3), byA = P.ground - 0.62 * S0;
        const slot = (a) => { const an = Math.PI + a / 8 * Math.PI; return [cx + rxA * Math.cos(an), byA + (byA - ay) * Math.sin(an)]; };
        // 出場順序：中、左中、右中、最左、最右……相鄰兩隻總在不同區；靠中間的兩點從外側往內撲，其餘從內側往外撲
        const cats = [4, 3, 5, 0, 8, 2, 6, 1, 7].map((a, i) => {
          const B = BREEDS[i], S = S0 * B.sz, K = slot(a), d = a === 4 ? (P.x < W / 2 ? 1 : -1) : (a === 3 || a === 5) ? (a < 4 ? 1 : -1) : (a < 4 ? -1 : 1);
          const pv = [K[0] - d * 0.45 * S, K[1] + 0.12 * S], xt = pv[0] - d * 0.4 * S;   // 每隻就在自己那一點底下現身，短跑一段就撲，彼此不擠
          return { i, B, S, K, d, pv, xt, xs: clamp(xt - d * 0.25 * S, 0.5 * S, W - 0.5 * S), gy: gyOf(S), t0: 0.36 + 0.2 * i };
        });
        const RUN = 0.26, HIT = 0.5;
        const stateOf = (c, t) => {
          const S = c.S; let x, y, th = 0, pose;
          if (t < RUN) { const q = t / RUN; x = c.xs + (c.xt - c.xs) * q * (0.6 + 0.4 * q); y = c.gy - Math.sin(t * 3.3 * TAU) * 0.015 * S; pose = gallop(t * 3.3); }
          else if (t < HIT) {
            const q = (t - RUN) / (HIT - RUN); x = c.xt + (c.pv[0] - c.xt) * (1 - (1 - q) * (1 - q)); y = c.gy + (c.pv[1] - c.gy) * Math.sin(q * Math.PI / 2) - 0.1 * S * Math.sin(Math.PI * q);
            pose = mixPose(gallop(RUN * 3.3 + q * 0.35), KPOSE.pounce, smooth(clamp(q / 0.55))); th = Math.atan2(c.gy - c.pv[1], Math.abs(c.pv[0] - c.xt)) * 0.45 * (1 - q);
          } else { const q = t - HIT; x = c.pv[0] + c.d * 0.07 * S * ease(q / 0.25); y = c.pv[1] + 0.04 * S * ease(q / 0.3); pose = mixPose(KPOSE.pounce, KPOSE.leap, smooth(clamp(q / 0.3)) * 0.5); th = -0.12 * ease(q / 0.3); }
          return { x, y, th, pose, a: clamp(t / 0.2), d: clamp((t - 0.54) / 0.27) };
        };
        const eyesOf = (B, st, S, dir) => { const s = S / KH, rot = -dir * st.th, cr = Math.cos(rot), sr = Math.sin(rot); return catMesh(B, st.pose).eyes.map((E) => { const lx = (E.c[0] - KPX) * s * dir, ly = (E.c[1] - KPY) * s; return { x: st.x + lx * cr - ly * sr, y: st.y + lx * sr + ly * cr, r: E.r * s, col: E.col }; }); };
        // 終幕：大貓、天眼
        const Sb = Math.min(H * 0.6, 480 * k), gyb = gyOf(Sb), bdir = P.x < W / 2 ? 1 : -1;
        const bx0 = clamp(P.x - bdir * 0.7 * Sb, 0.8 * Sb, W - 0.8 * Sb), bx1 = clamp(P.x + bdir * 1.0 * Sb, 0.75 * Sb, W - 0.75 * Sb);
        const apex = Math.max(lanBot + 0.42 * Sb, Math.min(P.y - 120 * k - 0.33 * Sb, gyb - 0.3 * Sb));
        const EW = Math.min(W * 0.32, 520 * k, H * 0.72), EH = EW * 170 / 380, ex = clamp(bx1 + (bx1 < W / 2 ? 1 : -1) * (0.6 * Sb + EW * 0.55), EW * 0.55, W - EW * 0.55), ey = Math.max(lanBot + EH * 0.62 + 10 * k, H * 0.28);
        const shat = clamp((T - 3.8) / 0.38), FB = 2.88;
        const bigState = (fb) => {
          const st = { x: bx0, y: gyb, th: 0, pose: KPOSE.crouch };
          if (fb >= 0.22 && fb < 0.52) {
            const q = (fb - 0.22) / 0.3; st.x = bx0 + (bx1 - bx0) * smooth(q); st.y = gyb - Math.sin(Math.PI * q) * (gyb - apex);
            st.th = Math.atan2(Math.PI * Math.cos(Math.PI * q) * (gyb - apex), Math.max(1, Math.abs(bx1 - bx0))) * 0.5;
            st.pose = q < 0.5 ? mixPose(gallop(0.75), KPOSE.leap, smooth(q / 0.5)) : mixPose(KPOSE.leap, KGAL[1], smooth((q - 0.5) / 0.5));
          } else if (fb >= 0.52) { const q = fb - 0.52; st.x = bx1 + bdir * 0.06 * Sb * ease(q / 0.2); st.pose = mixPose(KGAL[1], KPOSE.sit, smooth(clamp(q / 0.16))); if (q > 0.1) st.pose = Object.assign({}, st.pose, { look: -1, hd: [-6, -46] }); }   // 落地坐下、回頭望天眼
          return st;
        };

        if (T < 0.5) skyEyeShards();   // 天眼碎片趁開場先切好（只切一次），免得終幕卡一下
        ctx.save(); ctx.globalAlpha *= A; const A0 = ctx.globalAlpha;
        // 夜色：墨青，天眼睜開時再沉一點
        ctx.globalAlpha = A0 * (0.3 * ease(T / 0.3) + 0.1 * clamp((T - 3.3) / 0.2)); ctx.fillStyle = '#04111A'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = A0;

        // 命燈
        for (let i = 0; i < 9; i++) {
          const c = cats[i], [lx, ly] = lan(i), lit = ease((T - c.t0) / 0.16);
          const fl = Math.max(clamp(1 - Math.abs(T - (c.t0 + 0.84)) / 0.12), 0.7 * clamp(1 - Math.abs(T - (2.66 + 0.028 * i)) / 0.09));
          if (shat < 1) { ctx.globalAlpha = A0 * (1 - shat); lifeLantern(ctx, lx, ly, LR, lit, fl, T, i); }
          ctx.globalAlpha = A0; spray(ctx, lx, ly, shat, 9, 80 * k, 500 + i * 17, KGOLD, { size: 7 * k, fall: 50 * k });
        }

        // 天上的大貓眼
        const eo = ease((T - 3.36) / 0.16);
        if (eo > 0) {
          const blink = clamp(1 - Math.abs(T - 3.68) / 0.06), open = eo * (1 - 0.97 * blink), slit = ease((T - 3.42) / 0.18);
          ctx.globalAlpha = A0 * 0.6 * eo * (1 - shat); brokenRing(ctx, ex, ey, EW * 0.6, 12, T * 0.35, 0.5, '#E9A21E', 2.5 * k, 0.04 + shat * 0.3);
          ctx.globalAlpha = A0 * 0.35 * eo * (1 - shat); brokenRing(ctx, ex, ey, EW * 0.7, 12, -T * 0.25 + 0.13, 0.46, '#6FA3A8', 1.5 * k, 0.04);
          ctx.globalAlpha = A0; spray(ctx, ex, ey, (T - 3.36) / 0.5, 18, EW * 0.65, 777, KGOLD, { size: 8 * k });
          if (shat <= 0) skyEye(ctx, ex, ey, EW, EH, open, slit);
          else drawShards(ctx, skyEyeShards(), ex, ey, EH * 200 / 170, { scatter: shat, spread: 1.5, lift: 0.1, seed: 9, gap: Math.max(1.2, EH * 0.012) });
        }

        // 肉球腳印（跑步時一路蓋下，起跳時一對）
        for (const c of cats) {
          for (let j = 0; j < 5; j++) {
            const tj = j < 4 ? 0.04 + j * 0.065 : RUN, age = T - c.t0 - tj; if (age < 0 || age > 0.8) continue;
            const st = stateOf(c, tj), pop = 1 + 0.5 * Math.max(0, 1 - age / 0.07);
            ctx.globalAlpha = A0 * (1 - age / 0.8) * 0.9;
            pawHex(ctx, st.x + c.d * (j % 2 ? 0.3 : -0.16) * c.S, P.ground + (j % 2 ? 3 : -3) * k, 0.062 * c.S * pop, c.d * Math.PI / 2, 0.5, '#C98896', '#E2A9B4');
          }
        }
        const fbL = T - FB - 0.52;
        if (fbL > 0 && fbL < 0.9) { ctx.globalAlpha = A0 * (1 - fbL / 0.9) * (1 - shat); for (const s of [-1, 1]) pawHex(ctx, bx1 + bdir * (0.1 + s * 0.22) * Sb, P.ground + s * 4 * k, 0.055 * Sb, bdir * Math.PI / 2, 0.5, KGOLD[2], KGOLD[1]); }

        // 開場：九對眼睛在拱上依序睜開；輪到那隻貓時，那對眼睛滑到牠臉上
        for (const c of cats) {
          const e0 = 0.02 + 0.034 * c.i, t = T - c.t0; if (T < e0 || t > 0.16) continue;
          const st = stateOf(c, 0), E = eyesOf(c.B, st, c.S, c.d), mx = (E[0].x + E[1].x) / 2, my = (E[0].y + E[1].y) / 2;
          const g = ease(clamp((t + 0.14) / 0.22)), m = 1.6 - 0.6 * g;
          ctx.globalAlpha = A0 * (1 - clamp((t - 0.06) / 0.1));
          E.forEach((e) => { const ox = (e.x - mx) * m, oy = (e.y - my) * m, x = c.K[0] + ox + (e.x - c.K[0] - ox) * g, y = c.K[1] + oy + (e.y - c.K[1] - oy) * g; gemEye(ctx, x, y, e.r * m, e.col, ease((T - e0) / 0.1), ease((T - e0 - 0.08) / 0.3) * 0.9, 1); });
        }
        ctx.globalAlpha = A0;

        // 九隻貓
        for (const c of cats) {
          const t = T - c.t0; if (t < 0 || t > 0.82) continue;
          const st = stateOf(c, t);
          drawCat(ctx, c.B, st.pose, st.x, st.y, c.S, c.d, st.th, { a: st.a, d: st.d, to: lan(c.i), glow: clamp(1 - t / 0.3) * 0.8, seed: c.i });
        }
        // 爪痕
        for (const c of cats) clawWedges(ctx, c.K[0], c.K[1], Math.atan2(1, -c.d * 0.5), 0.42 * c.S, T - c.t0 - HIT, c.i + 1);

        // 終幕：九盞燈的光流下來，拼成金色大貓
        const tx = bx0, ty = gyb - 0.15 * Sb;
        for (let i = 0; i < 9; i++) {
          const [lx, ly] = lan(i), kx = (lx + tx) / 2, ky = ly + (ty - ly) * 0.15;
          for (let j = 0; j < 7; j++) {
            const q = ease(clamp((T - 2.74 - i * 0.012 - j * 0.02) / 0.3)); if (q <= 0 || q >= 1) continue;
            const m = 1 - q, x = m * m * lx + 2 * m * q * kx + q * q * tx, y = m * m * ly + 2 * m * q * ky + q * q * ty;
            ctx.globalAlpha = A0 * (0.5 + 0.5 * (1 - q)); tri(ctx, x, y, (9 - j * 0.7) * k, T * 9 + j + i, i * 30 + j, KGOLD[(i + j) % 4]);
          }
        }
        ctx.globalAlpha = A0;
        const fb = T - FB;
        if (fb > 0) {
          const st = bigState(fb);
          drawCat(ctx, BREEDS[9], st.pose, st.x, st.y, Sb, bdir, st.th, { a: clamp(fb / 0.28), e: shat, glow: 0.5, slit: fb > 0.52 ? 0.3 + 0.6 * clamp((T - 3.42) / 0.2) : 0.85, seed: 3 });
          if (shat > 0 && root.drawHexBurst) root.drawHexBurst(ctx, st.x, st.y - 0.15 * Sb, 240 * k, shat, { palette: 'qingci', alpha: 0.8 });
        }
        ctx.restore();
      },

      // ── 狐仙．狐火：九顆藍色多面晶焰繞身轉，螺旋射向四周，最後各自炸成碎晶 ──
      foxfire(u, A, k, D) {
        const { ctx, P, W, H } = G, far = Math.hypot(W, H) * 0.55, cols = ['#2A3F8F', '#3F6FD8', '#4FB6FF', '#E6FBFF'];
        const crystal = (x, y, s, rot, al) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = al;
          const pts = [[0, -30], [12, -2], [0, 14], [-12, -2]].map(([a, b]) => [a * s, b * s]), c = [0, -6 * s];
          for (let j = 0; j < 4; j++) { const a = pts[j], b = pts[(j + 1) % 4]; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fillStyle = cols[[3, 2, 1, 2][j]]; ctx.fill(); }
          ctx.restore();
        };
        ctx.save(); ctx.globalAlpha *= A;
        const endT = D - 0.55;
        for (let i = 0; i < 9; i++) {
          const out = clamp((u - 0.6) / (endT - 0.6)), a = u * 3.2 + i * TAU / 9, r = 70 * k + out * out * far;
          const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r * 0.62, fl = 1 + Math.sin(u * 22 + i) * 0.1;
          if (u < endT) {
            for (let j = 1; j <= 5; j++) { const aj = a - j * 0.1, rj = 70 * k + out * out * far * (1 - j * 0.02); ctx.globalAlpha = A * (0.55 - j * 0.09); tri(ctx, P.x + Math.cos(aj) * rj, P.y + Math.sin(aj) * rj * 0.62, (9 - j) * k, u * 4 + j, i * 11 + j, j % 2 ? '#4FB6FF' : '#9FE0FF'); }
            crystal(x, y, (1.1 + out * 0.9) * k * fl, a + Math.PI / 2 + Math.sin(u * 5 + i) * 0.2, A);
          } else {
            const ex = P.x + Math.cos(endT * 3.2 + i * TAU / 9) * (70 * k + far), ey = P.y + Math.sin(endT * 3.2 + i * TAU / 9) * (70 * k + far) * 0.62;
            ctx.globalAlpha = A; spray(ctx, ex, ey, (u - endT) / 0.55, 14, 170 * k, 300 + i * 20, PAL.fox, { size: 12 * k });
          }
        }
        ctx.restore();
      },

      // ── 狐仙．千面幻化：低多邊形煙一湧，身後扇開九條碎片狐尾，滿天菱形星；收尾尾巴碎開、再一陣煙 ──
      morph(u, A, k, D) {
        const { ctx, P, W, H } = G, TAIL = get('tail');
        ctx.save(); ctx.globalAlpha *= A;
        const r = (i, j) => hash(i, j);
        for (let i = 0; i < 46; i++) { const tw = 0.5 + 0.5 * Math.sin(u * 4 + i * 1.7); ctx.globalAlpha = A * tw * 0.85; star4(ctx, r(i, 1) * W, r(i, 2) * H * 0.85, (6 + r(i, 3) * 12) * k * (0.6 + tw * 0.4), ['#FFD6E8', '#FFF4C4', '#D9C8F2', '#9FE0FF'][i % 4]); }
        ctx.globalAlpha = A;
        const open = ease((u - 0.55) / 0.7), close = clamp((u - (D - 1.5)) / 0.6), S = 380 * k * (0.55 + 0.45 * open);
        if (open > 0 && close < 1) {
          for (let i = 0; i < 9; i++) {
            const ang = (i - 4) / 4 * 1.45 * open + Math.sin(u * 2.2 + i * 0.8) * 0.07;
            drawShards(ctx, TAIL, P.x, P.y + 10 * k, S, { rot: ang, pivot: [0, 0.48], scatter: close, spread: 1.4, lift: 0.3, alpha: 0.95 });
          }
        }
        if (open > 0.02 && open < 1 && root.drawHexBurst) root.drawHexBurst(ctx, P.x, P.y - 40 * k, 360 * k, clamp((u - 0.55) / 0.9), { palette: 'cuiyu', alpha: 0.8 });
        for (const at of [0.15, D - 1.25]) {
          const p = (u - at) / 1.0; if (p <= 0 || p >= 1) continue;
          for (let i = 0; i < 14; i++) { const a = i * 0.9 + at, d = (30 + ease(p) * 260) * k * (0.6 + (i % 4) * 0.15); lowCloud(ctx, P.x + Math.cos(a) * d, P.y - 10 * k + Math.sin(a) * d * 0.6, (50 - p * 12) * k, i + Math.round(at * 10), ['#FFFFFF', '#F1ECFA', '#E2EEFF', '#FFE9F2', '#D9C8F2'], (1 - p) * 0.95); }
        }
        ctx.restore();
      },

      // ── 玉兔．玉杵搗藥：一顆顆六面金丹噴出來，落地彈兩下，每次落地一圈扁六角漣漪 ──
      pound(u, A, k) {
        const { ctx, P, W } = G, bx = P.x + P.dir * 50 * k, gy = P.ground, g = 1500 * k;
        ctx.save(); ctx.globalAlpha *= A;
        spray(ctx, bx, gy - 20 * k, u / 0.9, 16, 160 * k, 77, ['#FFE08A', '#F5B82E', '#FFFFFF', '#F2C6D8'], { size: 9 * k, a0: Math.PI, arc: Math.PI });
        for (let i = 0; i < 34; i++) {
          const born = hash(i, 1) * 1.5, tt = u - born, vx = (hash(i, 2) - 0.5) * W * 0.5, vy = -(380 + hash(i, 3) * 520) * k;
          if (tt < 0) continue;
          const tl = (-vy + Math.sqrt(vy * vy + 2 * g * 10 * k)) / g;
          let x = bx + vx * tt, y = gy - 10 * k + vy * tt + 0.5 * g * tt * tt;
          if (y > gy) { const over = (y - gy) % (160 * k); y = gy - Math.abs(Math.sin(over / (160 * k) * Math.PI)) * 40 * k * Math.max(0, 1 - tt / 2.2); }
          const rp = (tt - tl) / 0.45;
          if (rp > 0 && rp < 1) { ctx.globalAlpha = A * (1 - rp) * 0.8; ctx.strokeStyle = '#F5B82E'; ctx.lineWidth = 2 * k; ngon(ctx, bx + vx * tl, gy, (10 + rp * 40) * k, 6, 0, 0.3); ctx.stroke(); }
          ctx.globalAlpha = A; gem(ctx, x, y, 11 * k, tt * 5 * (i % 2 ? 1 : -1), ['#FFE08A', '#F5B82E', '#E9A21E', '#FFF6D0', '#F5B82E', '#C98A12'], 6);
        }
        ctx.restore();
      },

      // ── 玉兔．月華：螢幕暗下，一輪多面月亮升起（月中有碎片兔影），三角月光灑下，多邊形桂花飄落 ──
      moonlight(u, A, k) {
        const { ctx, P, W, H } = G, MOON = get('moon'), RAB = get('rabbit');
        ctx.save(); ctx.globalAlpha = A * 0.36; ctx.fillStyle = '#0B1630'; ctx.fillRect(0, 0, W, H);
        const rise = ease(u / 1.2), mr = 130 * k, mx = P.x, my = Math.max(160 * k, P.y - 440 * k) + (1 - rise) * 180 * k;
        // 月光：幾道三角光束
        for (let i = 0; i < 5; i++) { const sw = Math.sin(u * 0.8 + i) * 30 * k, w0 = mr * 0.25, x0 = mx + (i - 2) * mr * 0.32; ctx.globalAlpha = A * (0.07 + (i % 2) * 0.06) * rise; ctx.fillStyle = '#FFF4C4'; ctx.beginPath(); ctx.moveTo(x0 - w0, my); ctx.lineTo(x0 + w0, my); ctx.lineTo(x0 + (i - 2) * 160 * k + sw + 90 * k, H); ctx.lineTo(x0 + (i - 2) * 160 * k + sw - 90 * k, H); ctx.closePath(); ctx.fill(); }
        // 外圈兩道反向旋轉的十二邊形
        ctx.globalAlpha = A * 0.7 * rise; ctx.strokeStyle = '#F5B82E'; ctx.lineWidth = 2 * k; ngon(ctx, mx, my, mr * 1.22, 12, u * 0.3); ctx.stroke();
        ctx.globalAlpha = A * 0.45 * rise; ctx.strokeStyle = '#C9D3F0'; ngon(ctx, mx, my, mr * 1.36, 12, -u * 0.22 + 0.13); ctx.stroke();
        ctx.globalAlpha = A;
        drawShards(ctx, MOON, mx, my, mr * 2, { scatter: 1 - rise, spread: 0.8, glimmer: 0.3, t: u, gap: mr * 0.006 });
        drawShards(ctx, RAB, mx + mr * 0.08, my + mr * 0.12, mr * 1.05, { alpha: 0.5 * rise, scatter: 1 - rise, color: '#7D8CC2', gap: 0 });
        // 桂花（五瓣小多邊形）與菱形星
        for (let i = 0; i < 46; i++) {
          const sp = 40 + hash(i, 4) * 80, x = hash(i, 5) * W + Math.sin(u * 1.3 + i) * 18 * k, y = (hash(i, 6) * H + u * sp * k) % H;
          ctx.globalAlpha = A * (0.5 + 0.4 * Math.sin(u * 3 + i));
          if (i % 3) gem(ctx, x, y, (4 + hash(i, 7) * 5) * k, u * 2 + i, i % 2 ? ['#FFE7A0', '#F5B82E'] : ['#FFF4C4', '#FFE7A0'], 5);
          else star4(ctx, x, y, (5 + hash(i, 8) * 6) * k, '#FFF4C4');
        }
        ctx.restore();
      },

      // ── 熊貓．掌勺：三角火舌往上竄成火柱，多面食材拋上半空再落下 ──
      wok(u, A, k) {
        const { ctx, P, H } = G, bx = P.x + P.dir * 52 * k, gy = P.y;
        ctx.save(); ctx.globalAlpha *= A;
        const fc = ['#E5484D', '#FF8A4C', '#FFC23C', '#FFF2B0'];
        for (let i = 0; i < 54; i++) {
          const p = (u * (0.8 + hash(i, 1) * 0.8) + hash(i, 2)) % 1, sx = (hash(i, 3) - 0.5) * 80 * k, x = bx + sx * (1 + p * 0.6), y = gy - p * (300 + hash(i, 4) * 380) * k, s = (1.4 - p) * (14 + hash(i, 5) * 14) * k;
          ctx.globalAlpha = A * (1 - p);
          ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x + s * 0.6, y + s * 0.4); ctx.lineTo(x - s * 0.6, y + s * 0.4); ctx.closePath(); ctx.fillStyle = fc[i % 4]; ctx.fill();
        }
        ctx.globalAlpha = A; spray(ctx, bx, gy, u / 0.8, 14, 140 * k, 91, fc, { size: 10 * k, a0: Math.PI, arc: Math.PI });
        const food = [[6, ['#7CC878', '#5AAE5A', '#A8E0A0']], [5, ['#E5484D', '#C83A3F', '#FF7A7E']], [4, ['#FFFFFF', '#EDE6D6', '#F8F3E8']], [6, ['#F5B82E', '#E9A21E', '#FFE08A']]];
        for (let i = 0; i < 22; i++) {
          const born = hash(i, 6) * 1.2, tt = (u - born) % 2.4, vx = (hash(i, 7) - 0.5) * 520 * k, vy = -(520 + hash(i, 8) * 420) * k;
          if (u < born) continue;
          const x = bx + vx * tt, y = gy - 20 * k + vy * tt + 0.5 * 1300 * k * tt * tt; if (y > H) continue;
          const [n, c] = food[i % 4]; gem(ctx, x, y, (10 + (i % 3) * 3) * k, tt * 6 * (i % 2 ? 1 : -1), c, n);
        }
        ctx.restore();
      },

      // ── 熊貓．太極推手：碎片拼成的太極越轉越大，外圈八卦卦爻反向旋轉；最後卦爻四散、一圈圈六角波紋 ──
      taiji(u, A, k, D) {
        const { ctx, P, W, H } = G, TJ = get('taiji'), far = Math.hypot(W, H) * 0.6, p = clamp(u / (D - 0.6)), r = 34 * k + p * p * far;
        const cx = P.x + P.dir * 60 * k * (1 - p), cy = P.y, a = A * (0.92 - p * 0.55);
        ctx.save(); ctx.globalAlpha *= a;
        drawShards(ctx, TJ, cx, cy, r * 2, { rot: u * 2.6, scatter: Math.max(0, (p - 0.82) / 0.18) * 0.6, spread: 0.6 });
        // 八卦
        const br = r * 1.22 + 20 * k, fly = Math.max(0, p - 0.7) / 0.3, bl = Math.max(14 * k, r * 0.2), bt = Math.max(3 * k, r * 0.028);
        for (let i = 0; i < 8; i++) {
          const an = -u * 1.3 + i * TAU / 8, rr = br * (1 + fly * fly * 1.2), tg = TRIGRAMS[i];
          ctx.save(); ctx.translate(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); ctx.rotate(an + Math.PI / 2 + fly * (hash(i, 1) - 0.5) * 4); ctx.globalAlpha = a * (1 - fly);
          for (let j = 0; j < 3; j++) { const yy = (j - 1) * bt * 2.2; ctx.fillStyle = j === 1 ? '#E5484D' : '#F5B82E'; if (tg[j]) ctx.fillRect(-bl / 2, yy - bt / 2, bl, bt); else { ctx.fillRect(-bl / 2, yy - bt / 2, bl * 0.42, bt); ctx.fillRect(bl * 0.08, yy - bt / 2, bl * 0.42, bt); } }
          ctx.restore();
        }
        ctx.restore();
        ctx.save();
        for (let i = 0; i < 3; i++) { const q = (u - 0.5 - i * 0.5) / 1.6; if (q > 0 && q < 1) { ctx.globalAlpha = A * (1 - q) * 0.85; ctx.strokeStyle = i % 2 ? '#2E2A33' : '#F4F1EA'; ctx.lineWidth = (7 - q * 5) * k; ngon(ctx, P.x, P.y, 60 * k + q * far, 6, q * 0.8 + i); ctx.stroke(); } }
        ctx.restore();
      },

      // ── 小青龍．喚雨：上方飄來低多邊形烏雲，細長三角雨絲落下，地上一圈圈扁六角漣漪 ──
      rain(u, A, k) {
        const { ctx, P, W, H } = G;
        ctx.save(); ctx.globalAlpha = A * 0.16; ctx.fillStyle = '#16304A'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 170; i++) {
          const x = hash(i, 1) * (W + 200) - 100, sp = 700 + hash(i, 2) * 500, y = (hash(i, 3) * H + u * sp) % H, len = (18 + hash(i, 4) * 24) * k, w = (1.5 + hash(i, 5) * 1.5) * k;
          ctx.globalAlpha = A * (0.35 + hash(i, 6) * 0.5); ctx.fillStyle = PAL.rain[i % 4];
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.22 + w, y + len); ctx.lineTo(x - len * 0.22 - w, y + len); ctx.closePath(); ctx.fill();
        }
        for (let i = 0; i < 14; i++) { const x = hash(i, 7) * W, p = (u * 1.3 + hash(i, 8)) % 1; ctx.globalAlpha = A * (1 - p) * 0.75; ctx.strokeStyle = '#8FDCFF'; ctx.lineWidth = 2 * k; ngon(ctx, x, P.ground + (hash(i, 9) - 0.5) * 20 * k, (4 + p * 46) * k, 6, 0, 0.24); ctx.stroke(); }
        ctx.globalAlpha = A;
        const n = Math.ceil(W / (300 * k)) + 2;
        for (let i = 0; i < n; i++) { const x = ((i * 300 * k + u * 40 * k) % (n * 300 * k)) - 200 * k, y = (70 + (i % 3) * 34) * k; lowCloud(ctx, x, y, (95 + (i % 2) * 25) * k, i * 3, i % 2 ? ['#7E8CA3', '#6E7B91', '#8E9BB0', '#9AA9BD'] : ['#9AA9BD', '#8E9BB0', '#B8C4D4', '#7E8CA3'], 0.95); }
        ctx.restore();
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
