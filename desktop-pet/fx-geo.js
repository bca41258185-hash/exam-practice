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

  // ════════ 九命貓影用的零件 ════════
  // 貓的造型：身體側面朝右跑、臉轉四分之三朝看的人（兩隻眼睛都看得到）。
  // 圖框 KW×KH，腳底在 y=KFOOT，(KPX,KPY) 是錨點：畫到畫面上時 x,y 就是這一點。
  const KW = 380, KH = 240, KFOOT = 226, KPX = 190, KPY = 150;
  const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const hexA = (h, a) => { const c = hexRGB(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const KBASE = { hr: 1, cheek: 1.06, bt: 1, leg: 1, tw: 15, tailLen: 1, ear: 1, eyeS: 1, sz: 1, pupil: 0.72, earIn: '#F3A2B6', nose: '#F29AAA', whisk: '#FFF8EE', lid: '#1A161F' };
  // 九命九種貓（第十隻是終幕九命合一的金貓）。patch：[部位, x, y, 半徑, 色]，head 的座標以頭半徑為單位
  const BREEDS = [
    // 一命 橘貓：橘底深橘虎紋、白胸白襪、圓胖臉
    { base: '#F2963A', shade: '#BF6823', belly: '#FFF2DF', muzzle: '#FFF7EC', stripe: '#C2581A', nStripe: 7, socks: '#FFF2DF', eye: ['#F4C53C', '#F4C53C'], hr: 1.14, cheek: 1.24, bt: 1.16, leg: 1.06, tw: 16, brow: true },
    // 二命 三花：白底、橘黑兩色大塊斑
    { base: '#F7F3EC', shade: '#D2CBC2', belly: '#FFFFFF', muzzle: '#FFFFFF', eye: ['#9BD35A', '#9BD35A'], whisk: '#8A8276',
      patch: [['body', -40, -14, 31, '#E98B35'], ['body', 26, -18, 22, '#2E2A30'], ['body', -8, -30, 12, '#2E2A30'], ['head', -0.45, -0.55, 0.58, '#2E2A30'], ['head', 0.62, -0.7, 0.45, '#E98B35'], ['tail', 0.45, 1, 0, '#2E2A30']] },
    // 三命 黑貓：全黑、背上一道冷光、金色大圓眼
    { base: '#2B2833', shade: '#17151C', back: '#4A4660', belly: '#34313D', muzzle: '#38353F', eye: ['#FFD23F', '#FFD23F'], eyeS: 1.24, pupil: 0.3, nose: '#4C3E4C', whisk: '#E6E4EE', earIn: '#5A4458', lid: '#0C0A10' },
    // 四命 白貓：全白、異色瞳（近藍遠金）
    { base: '#F6F4F1', shade: '#CBC7D2', back: '#E4E1EA', belly: '#FFFFFF', muzzle: '#FFFFFF', eye: ['#5DB8F5', '#F5C23A'], eyeS: 1.1, nose: '#F7A3B5', whisk: '#9A96A4', earIn: '#F7B0C0' },
    // 五命 暹羅：奶油色身體，臉罩、耳、腳、尾深棕，藍眼
    { base: '#F0E4CD', shade: '#C9B696', belly: '#F8F1E3', muzzle: '#F8F1E3', point: '#4A3329', pointFar: '#2E211A', eye: ['#5AB8F7', '#5AB8F7'], nose: '#33221C', whisk: '#F4EEE4', earIn: '#6A4A3C', hr: 0.94, cheek: 0.96, bt: 0.9, tw: 12, leg: 0.92 },
    // 六命 虎斑：灰褐底黑條紋，額頭一個 M
    { base: '#9C8A70', shade: '#6B5D49', belly: '#D9CDB5', muzzle: '#E6DCC8', stripe: '#2F2721', nStripe: 9, eye: ['#A9D44E', '#A9D44E'], M: true, nose: '#C47A6C', whisk: '#F4EFE4' },
    // 七命 英國短毛：藍灰、圓臉大餅、銅色眼、短胖
    { base: '#8C96A8', shade: '#666F82', back: '#7E889B', belly: '#9EA8B8', muzzle: '#A9B2C1', eye: ['#EE8A2A', '#EE8A2A'], eyeS: 1.16, pupil: 0.5, hr: 1.2, cheek: 1.3, bt: 1.24, leg: 1.2, tw: 19, tailLen: 0.78, ear: 0.76, nose: '#6A6C7E', whisk: '#E4E8F0', earIn: '#B98A98' },
    // 八命 緬因：大隻長毛、耳尖簇毛、白圍脖、蓬鬆大尾巴
    { base: '#8C6844', shade: '#5F4428', belly: '#EFE3CC', muzzle: '#F2E8D6', stripe: '#4B321F', nStripe: 6, eye: ['#CFC54A', '#CFC54A'], fur: true, tuft: true, ear: 1.2, sz: 1.15, tw: 22, tailLen: 0.92, bushy: true, nose: '#B9736A', whisk: '#FFF6E6' },
    // 九命 折耳：奶油色圓臉、耳朵往前摺、大圓眼
    { base: '#E3CDA8', shade: '#B89E76', belly: '#FBF4E8', muzzle: '#FFFAF0', stripe: '#C9A878', nStripe: 5, eye: ['#F2B33A', '#F2B33A'], eyeS: 1.32, pupil: 0.38, fold: true, hr: 1.16, cheek: 1.14, nose: '#E79AA0', whisk: '#8C7A62' },
    // 終幕：九命合一的金貓
    { base: '#F5B82E', shade: '#C98A12', back: '#E9A21E', belly: '#FFF0B8', muzzle: '#FFF6D0', stripe: '#FFE08A', nStripe: 7, eye: ['#FFF8E0', '#FFF8E0'], nose: '#E5484D', whisk: '#FFF6D0', earIn: '#FFD25A', lid: '#7A4A08', hr: 1.06, cheek: 1.12 },
  ].map((b) => Object.assign({}, KBASE, { back: mixHex(b.base, b.shade, 0.42) }, b));

  // 姿勢：腿的角度從垂直往下量，正＝往前（朝鼻子那邊）；[大腿, 小腿]。tl＝尾巴三個控制點（相對尾根）
  const KGAL = [
    { bx: KPX, by: 140, tilt: -0.04, st: 1.1, arch: -0.05, fn: [1.2, 1.5], ff: [1.0, 1.3], bn: [-1.1, -1.55], bf: [-0.9, -1.35], hd: [24, -30], tl: [[-28, -10], [-62, -26], [-96, -46]] },   // 騰空伸展
    { bx: KPX, by: 150, tilt: 0.08, st: 1.0, arch: 0, fn: [0.3, 0.05], ff: [0.7, 0.85], bn: [-0.55, -1.05], bf: [-0.25, -0.75], hd: [24, -26], tl: [[-26, -16], [-56, -42], [-80, -70]] },     // 前腳著地
    { bx: KPX, by: 146, tilt: 0.02, st: 0.88, arch: 0.3, fn: [-0.6, -0.9], ff: [-0.35, -0.55], bn: [0.7, 0.2], bf: [0.95, 0.5], hd: [22, -30], tl: [[-22, -24], [-38, -62], [-22, -96]] },  // 四腳收攏、背拱
    { bx: KPX, by: 144, tilt: -0.1, st: 1.0, arch: 0.05, fn: [0.7, 1.05], ff: [0.4, 0.7], bn: [-0.3, -0.2], bf: [-0.6, -0.65], hd: [26, -32], tl: [[-26, -18], [-58, -40], [-84, -70]] },   // 後腳蹬地
  ];
  const KPOSE = {
    pounce: { bx: KPX, by: 132, tilt: -0.42, st: 1.08, arch: 0, fn: [1.5, 1.75], ff: [1.25, 1.6], bn: [-0.25, -0.35], bf: [-0.45, -0.55], hd: [24, -28], tl: [[-30, 6], [-64, 10], [-98, -6]] },   // 撲：前爪高舉張開
    crouch: { bx: KPX, by: 168, tilt: 0.08, st: 0.95, arch: 0.12, fn: [0.9, -0.6], ff: [1.05, -0.45], bn: [1.0, -0.25], bf: [1.15, -0.1], hd: [30, -16], tl: [[-30, -4], [-62, -4], [-92, -14]] }, // 伏低準備撲
    leap: Object.assign({}, KGAL[0], { st: 1.16, by: 136, tl: [[-30, -6], [-66, -14], [-104, -24]] }),   // 長跳
    land: KGAL[1],
  };
  const mixPose = (a, b, t) => Array.isArray(a) ? a.map((v, i) => mixPose(v, b[i], t)) : typeof a === 'number' ? a + (b - a) * t : a;

  // 骨架：算出各部位在圖框裡的座標（畫圖和畫臉共用）
  function catRig(B, p) {
    const ct = Math.cos(p.tilt), st = Math.sin(p.tilt), rx = 74 * p.st, ry = 26 * B.bt, g = p.look || 1, l1 = 34, l2 = 37;
    const L = (lx, ly) => [p.bx + lx * ct - ly * st, p.by + lx * st + ly * ct];
    const leg = (o, a) => { const kn = [o[0] + Math.sin(a[0]) * l1, o[1] + Math.cos(a[0]) * l1]; return [o, kn, [kn[0] + Math.sin(a[1]) * l2, kn[1] + Math.cos(a[1]) * l2]]; };
    const sh = L(rx * 0.6, ry * 0.2), hip = L(-rx * 0.62, ry * 0.1), neck = L(rx * 0.78, -ry * 0.5), hr = 33 * B.hr;
    const hd = [neck[0] + p.hd[0], neck[1] + p.hd[1]], H = (x, y) => [hd[0] + x * hr, hd[1] + y * hr], es = B.eyeS;
    const tr = L(-rx * 0.94, -ry * 0.35), tl = p.tl.map(([a, b]) => { const x = a * B.tailLen, y = b * B.tailLen; return [tr[0] + x * ct - y * st, tr[1] + x * st + y * ct]; });
    const tail = (t) => { const m = 1 - t, P0 = tr, [P1, P2, P3] = tl; return [m * m * m * P0[0] + 3 * m * m * t * P1[0] + 3 * m * t * t * P2[0] + t * t * t * P3[0], m * m * m * P0[1] + 3 * m * m * t * P1[1] + 3 * m * t * t * P2[1] + t * t * t * P3[1]]; };
    return {
      p, g, rx, ry, L, hr, hd, H, neck, tail,
      legs: { fn: leg(sh, p.fn), ff: leg([sh[0] - 7, sh[1] - 4], p.ff), bn: leg(hip, p.bn), bf: leg([hip[0] + 7, hip[1] - 4], p.bf) },
      eyes: [{ c: H(g * 0.56, -0.06), rx: 0.19 * es * hr, ry: 0.22 * es * hr }, { c: H(-g * 0.14, -0.08), rx: 0.155 * es * hr, ry: 0.215 * es * hr }],
      nose: H(g * 0.27, 0.27),
      ears: [{ b: H(g * 0.5, -0.7), t: H(g * 0.8, -0.7 - 0.72 * B.ear), w: 0.33 * B.ear * hr }, { b: H(-g * 0.36, -0.78), t: H(-g * 0.52, -0.78 - 0.66 * B.ear), w: 0.3 * B.ear * hr }],
    };
  }
  const earTri = (c, E, sh) => { const dx = E.t[0] - E.b[0], dy = E.t[1] - E.b[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d * E.w * sh, ny = dx / d * E.w * sh, bx = E.b[0] + dx * (1 - sh) * 0.25, by = E.b[1] + dy * (1 - sh) * 0.25; c.beginPath(); c.moveTo(bx + nx, by + ny); c.lineTo(E.t[0] - dx * (1 - sh) * 0.3, E.t[1] - dy * (1 - sh) * 0.3); c.lineTo(bx - nx, by - ny); c.closePath(); c.fill(); };

  // 平塗一隻貓（之後切碎片）；回傳骨架
  function paintCat(c, B, p) {
    const R = catRig(B, p), g = R.g, hr = R.hr, rx = R.rx, ry = R.ry, ar = (p.arch || 0) * 22;
    const n = document.createElement('canvas'); n.width = KW; n.height = KH; const d = n.getContext('2d');
    const seg = (x, a, b, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); };
    const paw = (x, q, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(q[0] + 3, q[1] - 1, 9.5 * B.leg, 6.5 * B.leg, 0, 0, TAU); x.fill(); };
    const drawLeg = (x, Lg, col, low) => { seg(x, Lg[0], Lg[1], 17 * B.leg, col); seg(x, Lg[1], Lg[2], 12.5 * B.leg, low || col); paw(x, Lg[2], low || col); };
    const lower = (x, Lg, col, from) => { const a = Lg[1], b = Lg[2], f = from == null ? 0.55 : from; seg(x, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], b, 13.5 * B.leg, col); paw(x, b, col); };
    const body = (x, fn) => { x.save(); x.translate(p.bx, p.by); x.rotate(p.tilt); fn(x); x.restore(); };
    const tailBlobs = (x, col, from, to) => {
      x.fillStyle = col;
      for (let j = 0; j <= 30; j++) {
        const t = j / 30; if (t < (from || 0) || t > (to == null ? 1 : to)) continue;
        const q = R.tail(t), r = B.bushy ? B.tw * (0.62 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95))) : B.tw * 0.5 * (1 - 0.35 * t * t);
        x.beginPath(); x.arc(q[0], q[1], r, 0, TAU); x.fill();
        if (B.bushy && j % 2 === 0 && j > 2) { const q2 = R.tail(Math.min(1, t + 0.03)), dx = q2[0] - q[0], dy = q2[1] - q[1], dd = Math.hypot(dx, dy) || 1, nx = -dy / dd, ny = dx / dd; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(q[0] + nx * s * r * 0.6 - dx / dd * 6, q[1] + ny * s * r * 0.6 - dy / dd * 6); x.lineTo(q[0] + nx * s * (r + 9) - dx / dd * 9, q[1] + ny * s * (r + 9) - dy / dd * 9); x.lineTo(q[0] + nx * s * r * 0.6 + dx / dd * 6, q[1] + ny * s * r * 0.6 + dy / dd * 6); x.fill(); } }
      }
    };
    // ── 遠側：兩條腿暗一階，直接畫在底圖 ──
    const farLow = B.point ? B.pointFar : B.socks ? mixHex(B.socks, B.shade, 0.4) : null;
    for (const Lg of [R.legs.ff, R.legs.bf]) { drawLeg(c, Lg, B.shade); if (farLow) lower(c, Lg, farLow); }
    // ── 近側：剪影先用底色畫，再用 source-atop 上花紋 ──
    tailBlobs(d, B.base);
    d.fillStyle = B.base;
    body(d, (x) => {
      x.beginPath(); x.moveTo(-rx, 4);
      x.bezierCurveTo(-rx * 0.95, -ry * 1.3 - ar, rx * 0.5, -ry * 1.25 - ar * 0.6, rx * 0.98, -ry * 0.45);
      x.bezierCurveTo(rx * 1.15, ry * 0.3, rx * 0.85, ry * 1.05, rx * 0.45, ry * 1.0);
      x.bezierCurveTo(rx * 0.1, ry * 0.8 - ar * 0.4, -rx * 0.4, ry * 1.1, -rx * 0.8, ry * 1.0);
      x.bezierCurveTo(-rx * 1.12, ry * 0.85, -rx * 1.1, ry * 0.1, -rx, 4); x.fill();
      x.beginPath(); x.ellipse(-rx * 0.6, ry * 0.32, ry * 0.95, ry * 1.08, 0.3, 0, TAU); x.fill();   // 後腿大腿肉
      if (B.fur) for (let j = 0; j < 9; j++) { const xx = -rx * 0.75 + j * rx * 0.17; x.beginPath(); x.moveTo(xx - 8, ry * 0.75); x.lineTo(xx + 8, ry * 0.75); x.lineTo(xx + 1, ry * 0.95 + 13 + (j % 2) * 5); x.fill(); }   // 長毛肚邊
    });
    drawLeg(d, R.legs.fn, B.base); drawLeg(d, R.legs.bn, B.base);
    seg(d, R.L(rx * 0.5, -ry * 0.2), R.neck, ry * 1.7, B.base);
    seg(d, R.neck, R.hd, hr * 1.05, B.base);
    d.fillStyle = B.base;
    if (!B.fold) earTri(d, R.ears[1], 1);
    d.beginPath(); d.arc(R.hd[0], R.hd[1], hr * 0.95, 0, TAU); d.fill();
    d.beginPath(); d.ellipse(R.hd[0] + g * 0.12 * hr, R.hd[1] + 0.16 * hr, hr * B.cheek, hr * 0.8, 0, 0, TAU); d.fill();
    if (B.fur) {   // 長毛：臉頰毛、胸前圍脖
      for (let j = 0; j < 7; j++) { const a = Math.PI * (0.15 + j * 0.12), cx = R.hd[0] + g * 0.12 * hr, cy = R.hd[1] + 0.16 * hr; d.beginPath(); d.moveTo(cx + Math.cos(a - 0.2) * hr * B.cheek * 0.95, cy + Math.sin(a - 0.2) * hr * 0.76); d.lineTo(cx + Math.cos(a) * hr * (B.cheek + 0.3), cy + Math.sin(a) * hr * 1.05); d.lineTo(cx + Math.cos(a + 0.2) * hr * B.cheek * 0.95, cy + Math.sin(a + 0.2) * hr * 0.76); d.fill(); }
      const ch = R.L(rx * 0.86, ry * 0.4); for (let j = 0; j < 5; j++) { const xx = ch[0] - 18 + j * 9; d.beginPath(); d.moveTo(xx - 7, ch[1] - 8); d.lineTo(xx + 7, ch[1] - 8); d.lineTo(xx + 2, ch[1] + 18 + (j % 2) * 6); d.fill(); }
    }
    if (!B.fold) earTri(d, R.ears[0], 1);
    else {   // 折耳：耳朵往前摺，貼在頭頂像兩片小帽簷
      d.fillStyle = mixHex(B.base, B.shade, 0.7);
      for (const [a, b, e] of [[[g * 0.08, -0.94], [g * 0.8, -0.74], [g * 0.62, -0.46]], [[-g * 0.66, -0.66], [-g * 0.02, -0.98], [-g * 0.2, -0.64]]]) { const A1 = R.H(a[0], a[1]), A2 = R.H(b[0], b[1]), A3 = R.H(e[0], e[1]); d.beginPath(); d.moveTo(A1[0], A1[1]); d.quadraticCurveTo((A1[0] + A2[0]) / 2, Math.min(A1[1], A2[1]) - hr * 0.2, A2[0], A2[1]); d.lineTo(A3[0], A3[1]); d.closePath(); d.fill(); }
    }
    // ── 花紋（只畫在剪影上）──
    d.globalCompositeOperation = 'source-atop';
    body(d, (x) => {
      x.fillStyle = B.back; x.beginPath(); x.ellipse(0, -ry * 0.95, rx * 0.95, ry * 0.45, 0, 0, TAU); x.fill();
      x.fillStyle = B.belly; x.beginPath(); x.ellipse(rx * 0.05, ry * 0.95, rx * 0.72, ry * 0.42, 0, 0, TAU); x.fill();
      x.beginPath(); x.arc(rx * 0.86, ry * 0.32, ry * 0.78, 0, TAU); x.fill();
      if (B.stripe) { x.fillStyle = B.stripe; const m = B.nStripe; for (let j = 0; j < m; j++) { const xl = -rx * 0.8 + j * (rx * 1.52 / (m - 1)); x.beginPath(); x.moveTo(xl - 7, -ry * 1.6); x.lineTo(xl + 7, -ry * 1.6); x.lineTo(xl + 6, ry * 0.25); x.lineTo(xl + 1, ry * 0.42); x.closePath(); x.fill(); } }
    });
    if (B.patch) for (const [w, a, b, r, col] of B.patch) {
      d.fillStyle = col;
      if (w === 'body') body(d, (x) => { x.beginPath(); x.arc(a, b, r, 0, TAU); x.fill(); });
      else if (w === 'head') { const q = R.H(g * a, b); d.beginPath(); d.arc(q[0], q[1], r * hr, 0, TAU); d.fill(); }
      else tailBlobs(d, col, a, b);
    }
    if (B.stripe) {   // 尾巴環紋、腿上橫紋
      d.strokeStyle = B.stripe; d.lineWidth = 7; d.lineCap = 'butt';
      for (const t of [0.3, 0.5, 0.7, 0.88]) { const q = R.tail(t), q2 = R.tail(t + 0.02), dx = q2[0] - q[0], dy = q2[1] - q[1], dd = Math.hypot(dx, dy) || 1, w = B.tw * (B.bushy ? 1.4 : 0.8); d.beginPath(); d.moveTo(q[0] - dy / dd * w, q[1] + dx / dd * w); d.lineTo(q[0] + dy / dd * w, q[1] - dx / dd * w); d.stroke(); }
      for (const Lg of [R.legs.fn, R.legs.bn]) for (const [s, f] of [[0, 0.55], [1, 0.35]]) { const a = Lg[s], b = Lg[s + 1], q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy) || 1; d.beginPath(); d.moveTo(q[0] - dy / dd * 10, q[1] + dx / dd * 10); d.lineTo(q[0] + dy / dd * 10, q[1] - dx / dd * 10); d.stroke(); }
    }
    if (B.socks) for (const Lg of [R.legs.fn, R.legs.bn]) lower(d, Lg, B.socks, 0.45);
    d.fillStyle = B.muzzle; d.beginPath(); d.ellipse(R.nose[0] - g * 0.02 * hr, R.nose[1] + 0.12 * hr, 0.42 * hr, 0.3 * hr, 0, 0, TAU); d.fill();
    d.beginPath(); d.ellipse(R.hd[0] + g * 0.2 * hr, R.hd[1] + 0.62 * hr, 0.36 * hr, 0.2 * hr, 0, 0, TAU); d.fill();   // 下巴
    if (B.fur) { d.fillStyle = B.belly; const ch = R.L(rx * 0.86, ry * 0.3); d.beginPath(); d.ellipse(ch[0] + 6, ch[1] + 4, 24, 30, 0, 0, TAU); d.fill(); }
    if (B.point) {   // 暹羅：臉罩、耳朵、四腳、尾巴深色
      d.fillStyle = B.point; d.beginPath(); d.ellipse(R.hd[0] + g * 0.26 * hr, R.hd[1] + 0.2 * hr, 0.6 * hr, 0.58 * hr, 0, 0, TAU); d.fill();
      for (const E of R.ears) earTri(d, E, 1);
      tailBlobs(d, B.point);
      for (const Lg of [R.legs.fn, R.legs.bn]) lower(d, Lg, B.point, 0.3);
    }
    d.globalCompositeOperation = 'source-over';
    if (!B.fold) { d.fillStyle = B.earIn; for (const E of R.ears) earTri(d, E, 0.55); }
    c.drawImage(n, 0, 0);
    return R;
  }

  // 一隻眼睛：open 0 閉～1 開；slit 0 圓瞳～1 一條直縫；glow 外面一圈光暈
  function catEye(c, x, y, rx, ry, col, open, slit, glow, lid) {
    if (glow > 0) { const gr = c.createRadialGradient(x, y, 0, x, y, ry * 3.4); gr.addColorStop(0, hexA(col, 0.6 * glow)); gr.addColorStop(1, hexA(col, 0)); c.fillStyle = gr; c.fillRect(x - ry * 3.4, y - ry * 3.4, ry * 6.8, ry * 6.8); }
    if (open <= 0.04) { c.strokeStyle = lid; c.lineWidth = Math.max(1.2, ry * 0.22); c.lineCap = 'round'; c.beginPath(); c.moveTo(x - rx, y); c.quadraticCurveTo(x, y + ry * 0.4, x + rx, y); c.stroke(); return; }
    const ey = ry * open;
    c.save(); c.beginPath(); c.ellipse(x, y, rx, ey, 0, 0, TAU); c.fillStyle = col; c.fill(); c.clip();
    c.fillStyle = mixHex(col, '#000000', 0.2); c.fillRect(x - rx, y + ry * 0.18, rx * 2, ry);   // 下半暗一階，像寶石切面
    c.fillStyle = '#120E16'; c.beginPath(); c.ellipse(x, y, Math.max(0.6, rx * (0.72 - 0.6 * slit)), ry * (0.78 + 0.14 * slit), 0, 0, TAU); c.fill();
    c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(x - rx * 0.3, y - ry * 0.4, ry * 0.2, 0, TAU); c.fill();
    c.restore();
    c.strokeStyle = lid; c.lineWidth = Math.max(1, ry * 0.15); c.beginPath(); c.ellipse(x, y, rx, ey, 0, 0, TAU); c.stroke();
  }
  // 貓臉細節（眼、鼻、嘴、鬍鬚、花紋），用向量畫在碎片上面才清楚；座標＝圖框座標
  function catFace(c, R, B, o) {
    const g = R.g, hr = R.hr, H = R.H, nz = R.nose;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (B.M) {   // 虎斑額頭的 M＋眼角兩道
      c.strokeStyle = B.stripe; c.lineWidth = hr * 0.085; c.lineJoin = 'miter'; c.beginPath();
      [[-0.3, -0.34], [-0.17, -0.7], [0, -0.44], [0.17, -0.7], [0.3, -0.34]].forEach(([a, b], j) => { const q = H(g * (0.22 + a), b); j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke();
      c.lineWidth = hr * 0.07; c.lineJoin = 'round';
      for (const [a, b, e, f] of [[-0.42, 0.06, -0.86, 0.0], [-0.4, 0.22, -0.82, 0.24]]) { const q1 = H(g * a, b), q2 = H(g * e, f); c.beginPath(); c.moveTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]); c.stroke(); }
    }
    if (B.brow) { c.strokeStyle = B.stripe; c.lineWidth = hr * 0.1; for (const dx of [-0.2, 0, 0.2]) { const q1 = H(g * (0.22 + dx * 1.1), -0.9), q2 = H(g * (0.22 + dx * 0.8), -0.55); c.beginPath(); c.moveTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]); c.stroke(); } }
    if (B.tuft) { c.fillStyle = '#2A1C12'; for (const E of R.ears) { const dx = E.t[0] - E.b[0], dy = E.t[1] - E.b[1], dd = Math.hypot(dx, dy); c.beginPath(); c.moveTo(E.t[0] - dy / dd * 3, E.t[1] + dx / dd * 3); c.lineTo(E.t[0] + dx / dd * hr * 0.42, E.t[1] + dy / dd * hr * 0.42); c.lineTo(E.t[0] + dy / dd * 3, E.t[1] - dx / dd * 3); c.fill(); } }
    if (B.fold) { c.strokeStyle = mixHex(B.shade, '#000000', 0.25); c.lineWidth = hr * 0.06; for (const [a, b] of [[[g * 0.2, -0.84], [g * 0.66, -0.7]], [[-g * 0.52, -0.66], [-g * 0.08, -0.86]]]) { const q1 = H(a[0], a[1]), q2 = H(b[0], b[1]); c.beginPath(); c.moveTo(q1[0], q1[1]); c.quadraticCurveTo((q1[0] + q2[0]) / 2, Math.min(q1[1], q2[1]) - hr * 0.08, q2[0], q2[1]); c.stroke(); } }
    R.eyes.forEach((e, j) => catEye(c, e.c[0], e.c[1], e.rx, e.ry, B.eye[j], o.open == null ? 1 : o.open, o.slit == null ? B.pupil : o.slit, o.glow || 0, B.lid));
    // 鼻子、嘴
    c.fillStyle = B.nose; c.beginPath(); c.moveTo(nz[0] - hr * 0.1, nz[1] - hr * 0.06); c.lineTo(nz[0] + hr * 0.1, nz[1] - hr * 0.06); c.lineTo(nz[0], nz[1] + hr * 0.07); c.closePath(); c.fill();
    c.strokeStyle = B.lid; c.lineWidth = Math.max(1, hr * 0.045);
    if (o.mouth) { c.fillStyle = '#7A2B35'; c.beginPath(); c.moveTo(nz[0] - hr * 0.16, nz[1] + hr * 0.16); c.lineTo(nz[0] + hr * 0.16, nz[1] + hr * 0.16); c.lineTo(nz[0], nz[1] + hr * 0.38); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#FFFFFF'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(nz[0] + s * hr * 0.12, nz[1] + hr * 0.16); c.lineTo(nz[0] + s * hr * 0.06, nz[1] + hr * 0.16); c.lineTo(nz[0] + s * hr * 0.09, nz[1] + hr * 0.25); c.fill(); } }
    else { c.beginPath(); c.moveTo(nz[0], nz[1] + hr * 0.07); c.lineTo(nz[0], nz[1] + hr * 0.15); c.moveTo(nz[0] - hr * 0.13, nz[1] + hr * 0.17); c.quadraticCurveTo(nz[0] - hr * 0.06, nz[1] + hr * 0.24, nz[0], nz[1] + hr * 0.15); c.quadraticCurveTo(nz[0] + hr * 0.06, nz[1] + hr * 0.24, nz[0] + hr * 0.13, nz[1] + hr * 0.17); c.stroke(); }
    // 鬍鬚：前側三根伸出臉外，後側三根壓在臉頰上
    c.strokeStyle = B.whisk; c.lineWidth = Math.max(0.9, hr * 0.035);
    for (const [s, len] of [[1, 1.05], [-1, 0.8]]) for (const dy of [-0.14, 0.02, 0.18]) { const ox = nz[0] + g * s * hr * 0.16, oy = nz[1] + hr * 0.12 + dy * hr * 0.3, ex = ox + g * s * len * hr, ey = oy + dy * hr * 1.1; c.beginPath(); c.moveTo(ox, oy); c.quadraticCurveTo((ox + ex) / 2, (oy + ey) / 2 - hr * 0.08, ex, ey); c.stroke(); }
    if (o.claws) { c.fillStyle = '#FFFFFF'; for (const Lg of [R.legs.fn, R.legs.ff]) { const q = Lg[2], dx = q[0] - Lg[1][0], dy = q[1] - Lg[1][1], dd = Math.hypot(dx, dy) || 1, ux = dx / dd, uy = dy / dd; for (const s of [-1, 0, 1]) { const bx = q[0] + ux * 8 - uy * s * 5, by = q[1] + uy * 8 + ux * s * 5; c.beginPath(); c.moveTo(bx - uy * 1.8, by + ux * 1.8); c.lineTo(bx + ux * 9 + uy * 2, by + uy * 9 - ux * 2); c.lineTo(bx + uy * 1.8, by - ux * 1.8); c.fill(); } } }
  }
  // 取某品種某姿勢的碎片（第一次用到才畫、之後快取）
  const KCACHE = {};
  function catPose(name, f, look) {
    let p = name === 'g' ? mixPose(KGAL[f >> 1], KGAL[((f >> 1) + 1) % 4], (f & 1) * 0.5) : KPOSE[name];
    p = Object.assign({}, p, { look });
    if (look < 0) p.hd = [-2, -44];   // 回頭看：頭往後上方擺
    return p;
  }
  function catSprite(bi, name, f, look) {
    const key = 'k9:' + bi + name + f + look;
    if (KCACHE[key]) return KCACHE[key];
    const B = BREEDS[bi], p = catPose(name, f, look); let R = null;
    const T = shardify(key, KW, KH, 9, (c) => { R = paintCat(c, B, p); }, 0.1);
    return (KCACHE[key] = { T, R: R || catRig(B, p) });
  }
  // 肉球：一顆六角大掌墊＋四顆五角趾頭；sy 壓扁＝印在地上
  function pawPad(ctx, x, y, r, rot, sy, cols) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, sy); ctx.rotate(rot);
    gem(ctx, 0, r * 0.28, r * 0.5, Math.PI / 6, [cols[0], cols[1], cols[0], cols[1], cols[0], cols[1]], 6, 0.82);
    for (let j = 0; j < 4; j++) { const a = -Math.PI / 2 + (j - 1.5) * 0.52; gem(ctx, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.62 + r * 0.06, r * 0.21, j, [cols[1], cols[0]], 5, 1.18); }
    ctx.restore();
  }
  // 三道金色爪痕：f＝劃下後幾秒；先一節節劃出來，停一下，再斷成碎片飛散
  function clawMarks(ctx, x, y, ang, len, f, seed) {
    if (f <= 0 || f >= 0.9) return;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, M = 7, drawn = clamp(f / 0.1), brk = clamp((f - 0.3) / 0.55), base = ctx.globalAlpha;
    if (brk < 0.3) { ctx.globalAlpha = base * 0.5 * (1 - brk / 0.3) * drawn; star4(ctx, x, y, len * 0.32 * (0.6 + 0.4 * drawn), '#FFF3C4'); }
    for (let s = -1; s <= 1; s++) {
      const sl = len * (s ? 0.84 : 1), off = s * len * 0.2, x0 = x + nx * off - ux * sl / 2 + ux * Math.abs(s) * len * 0.06, y0 = y + ny * off - uy * sl / 2 + uy * Math.abs(s) * len * 0.06;
      const pt = (t) => { const bow = Math.sin(Math.PI * t) * len * 0.07; return [x0 + ux * sl * t + nx * bow, y0 + uy * sl * t + ny * bow]; };
      const wid = (t) => len * 0.05 * Math.pow(Math.sin(Math.PI * clamp(t, 0.02, 0.98)), 0.75) + 0.6;
      for (let m = 0; m < M; m++) {
        const t0 = m / M; if (t0 >= drawn) break;
        const t1 = Math.min((m + 1) / M, drawn), P0 = pt(t0 + 0.006), P1 = pt(t1 - 0.006), w0 = wid(t0), w1 = wid(t1);
        const h = hash(seed * 7 + s + 3, m), cx = (P0[0] + P1[0]) / 2, cy = (P0[1] + P1[1]) / 2, bb = Math.pow(brk, 1.2);
        const ox = (nx * (s || (h - 0.5) * 2) * 0.5 + (h - 0.5)) * len * 0.5 * bb, oy = (ny * (s || (h - 0.5) * 2) * 0.5) * len * 0.5 * bb + len * 0.35 * bb * bb, rr = (h - 0.5) * 5 * bb, rc = Math.cos(rr), rs = Math.sin(rr);
        const quad = (k) => [[P0[0] + nx * w0 * k, P0[1] + ny * w0 * k], [P1[0] + nx * w1 * k, P1[1] + ny * w1 * k], [P1[0] - nx * w1 * k, P1[1] - ny * w1 * k], [P0[0] - nx * w0 * k, P0[1] - ny * w0 * k]].map(([X, Y]) => [cx + ox + (X - cx) * rc - (Y - cy) * rs, cy + oy + (X - cx) * rs + (Y - cy) * rc]);
        for (const [k, col, al] of [[2.4, '#FFD36B', 0.22 * (1 - brk)], [1, h > 0.5 ? '#F5B82E' : '#E9A21E', 1], [0.4, '#FFF3C4', 1]]) { const q = quad(k); ctx.globalAlpha = base * al * (1 - brk); ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let j = 1; j < 4; j++) ctx.lineTo(q[j][0], q[j][1]); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
      }
    }
    ctx.globalAlpha = base;
    spray(ctx, x, y, brk, 16, len * 0.75, seed * 13, ['#F5B82E', '#FFE08A', '#FFF3C4', '#E9A21E'], { size: len * 0.05, fall: len * 0.4 });
  }
  // 命燈：六角紙燈籠，燈面一個肉球；lit 0 暗～1 亮，flare 魂回來時閃一下
  function lifeLantern(ctx, x, y, R, lit, flare, u, i, label) {
    ctx.save(); ctx.translate(x, 0); ctx.rotate(Math.sin(u * 2.3 + i * 1.3) * 0.06); ctx.translate(0, y);
    ctx.strokeStyle = 'rgba(60,40,50,0.9)'; ctx.lineWidth = Math.max(1, R * 0.07); ctx.beginPath(); ctx.moveTo(0, -y); ctx.lineTo(0, -R * 1.3); ctx.stroke();
    if (lit > 0) { const gr = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * (2.6 + flare * 1.6)); gr.addColorStop(0, `rgba(255,190,90,${0.42 * lit + 0.3 * flare})`); gr.addColorStop(1, 'rgba(255,190,90,0)'); ctx.fillStyle = gr; ctx.fillRect(-R * 4.2, -R * 4.2, R * 8.4, R * 8.4); }
    const pop = 1 + 0.22 * flare + 0.25 * Math.max(0, 1 - Math.abs(lit - 0.6) / 0.4) * (lit < 1 ? 1 : 0); ctx.scale(pop, pop);
    const base = ctx.globalAlpha;
    gem(ctx, 0, 0, R, -Math.PI / 2, ['#5A4656', '#4A3A48', '#3B2E3A', '#33283A', '#3B2E3A', '#4A3A48'], 6, 1.22);
    if (lit > 0) { ctx.globalAlpha = base * lit; gem(ctx, 0, 0, R, -Math.PI / 2, ['#FFB36B', '#FF8A5C', '#E5484D', '#C7333F', '#E5484D', '#FF8A5C'], 6, 1.22); ctx.globalAlpha = base; }
    ctx.fillStyle = '#3A2A30'; ctx.fillRect(-R * 0.48, -R * 1.36, R * 0.96, R * 0.24); ctx.fillRect(-R * 0.48, R * 1.12, R * 0.96, R * 0.24);
    ctx.fillStyle = lit > 0.5 ? '#F5B82E' : '#6A5A50'; ctx.beginPath(); ctx.moveTo(-R * 0.16, R * 1.36); ctx.lineTo(R * 0.16, R * 1.36); ctx.lineTo(0, R * 2.05); ctx.closePath(); ctx.fill();
    pawPad(ctx, 0, R * 0.02, R * 0.56, 0, 1, lit > 0.5 ? ['#FFE08A', '#FFF3C4'] : ['#241C28', '#2E2432']);
    if (label) { ctx.font = `bold ${Math.round(Math.max(11, R * 0.62))}px "Microsoft JhengHei","PingFang TC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = lit > 0.5 ? '#FFE9B8' : 'rgba(210,205,230,0.55)'; ctx.fillText(label, 0, R * 2.2); }
    ctx.restore();
  }
  // 天上的大貓眼：杏仁形，虹膜是一圈金色切面，瞳孔由圓收成直縫
  function skyEye(c, x, y, w, h, open, slit) {
    const a = w / 2, b = h / 2 * open;
    const almond = (aa, bb) => { c.beginPath(); c.moveTo(x - aa, y); c.quadraticCurveTo(x, y - bb * 2, x + aa, y); c.quadraticCurveTo(x, y + bb * 2, x - aa, y); c.closePath(); };
    if (open <= 0.04) { c.strokeStyle = '#1B1722'; c.lineWidth = h * 0.06; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - a, y); c.quadraticCurveTo(x, y + h * 0.16, x + a, y); c.stroke(); return; }
    c.fillStyle = '#1B1722'; almond(a + h * 0.1, b + h * 0.07); c.fill();
    c.save(); almond(a, b); c.clip();
    c.fillStyle = '#B9780E'; c.fillRect(x - a, y - h, w, h * 2);
    gem(c, x, y, h * 0.62, 0.3, ['#FFE08A', '#F5B82E', '#E9A21E', '#FFD25A', '#F5B82E', '#C98A12', '#FFF0B0', '#E9A21E', '#F5B82E', '#FFD25A'], 10);
    gem(c, x, y, h * 0.36, 0.0, ['#F5B82E', '#E9A21E', '#C98A12', '#E9A21E', '#FFD25A', '#E9A21E', '#C98A12', '#E9A21E'], 8);
    const pw = h * 0.36 * (1 - 0.86 * slit) + 1.5, ph = h * (0.36 + 0.12 * slit);
    c.fillStyle = '#120E16'; c.beginPath(); c.moveTo(x, y - ph); c.quadraticCurveTo(x + pw * (1.3 + slit * 0.3), y, x, y + ph); c.quadraticCurveTo(x - pw * (1.3 + slit * 0.3), y, x, y - ph); c.fill();
    if (slit < 0.5) { c.beginPath(); c.ellipse(x, y, pw * (1 - slit * 2) * 0.95, ph * 0.98, 0, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.moveTo(x - h * 0.3, y - h * 0.22); c.lineTo(x - h * 0.14, y - h * 0.3); c.lineTo(x - h * 0.18, y - h * 0.1); c.closePath(); c.fill();
    c.fillStyle = 'rgba(40,18,6,0.35)'; c.beginPath(); c.ellipse(x, y - b * 1.25, a * 1.1, b * 0.55, 0, 0, TAU); c.fill();   // 上眼皮的陰影
    c.restore();
  }

  // 九命的出場順序：[動作, 活動範圍中心(螢幕寬的比例), 方向]；左、右、中輪流，同時在場的貓才不會疊成一團。dash 衝刺撲擊、leap 長跳落地抓、high 伏低後高撲、look 邊跑邊回頭再撲
  const KPLAN = [['dash', 0.2, 1], ['leap', 0.8, -1], ['high', 0.5, 1], ['look', 0.2, -1], ['dash', 0.8, 1], ['high', 0.5, -1], ['leap', 0.2, 1], ['look', 0.8, -1], ['dash', 0.5, 1]];
  const KTRAVEL = { dash: 1.52, leap: 1.8, high: 1.16, look: 1.4 }, KRUN = { dash: 0.42, look: 0.42, leap: 0.2, high: 0.22 }, KHIT = 0.62;
  // 一隻貓在牠自己的第 t 秒：位置（錨點）、抬頭角 th、用哪張圖、碎散程度 sc
  function catState(c, t) {
    const S = c.S, d = c.dir; let x = c.x0, y = c.gy, th = 0, name = 'g', f = 0, look = 1, mouth = 0, claws = 0;
    const run = (tt, v) => { const ph = tt * 3.3; f = Math.floor(ph * 8) % 8; y = c.gy - Math.sin(ph * TAU) * 0.02 * S; x = c.x0 + d * v * S * tt; };
    if (c.type === 'dash' || c.type === 'look') {
      const re = KRUN[c.type], v = c.type === 'look' ? 1.45 : 1.7, b0 = v * re;
      if (t < re) { run(t, v); if (c.type === 'look') look = -1; }
      else if (t < KHIT) { const a = (t - re) / (KHIT - re); x = c.x0 + d * (b0 + 0.55 * a) * S; y = c.gy - Math.sin(Math.PI * a) * 0.3 * S; name = 'pounce'; th = 0.25 - 0.6 * a; mouth = 1; claws = 1; }
      else { x = c.x0 + d * (b0 + 0.55 + 0.25 * ease((t - KHIT) / 0.25)) * S; name = 'land'; }
    } else if (c.type === 'leap') {
      const re = KRUN.leap, v = 1.6;
      if (t < re) run(t, v);
      else if (t < 0.6) {
        const a = (t - re) / (0.6 - re), sl = Math.atan(0.62 * Math.PI * Math.cos(Math.PI * a) / 1.25) * 0.6;
        x = c.x0 + d * (v * re + 1.25 * a) * S; y = c.gy - Math.sin(Math.PI * a) * 0.62 * S;
        if (a < 0.18) { f = 6; th = sl; } else if (a < 0.68) { name = 'leap'; th = sl; } else { name = 'pounce'; th = sl - 0.3; claws = 1; mouth = 1; }
      } else { x = c.x0 + d * (v * re + 1.25 + 0.22 * ease((t - 0.6) / 0.25)) * S; name = 'land'; }
    } else {
      const re = KRUN.high, v = 1.6, xc = v * re;
      if (t < re) run(t, v);
      else if (t < 0.36) { x = c.x0 + d * xc * S; name = 'crouch'; th = Math.sin(t * 70) * 0.03; }
      else if (t < KHIT) { const a = (t - 0.36) / (KHIT - 0.36); x = c.x0 + d * (xc + 0.8 * a) * S; y = c.gy - 0.8 * S * (1 - (1 - a) * (1 - a)); name = 'pounce'; th = 0.35 * (1 - a); claws = 1; mouth = 1; }
      else { const a = t - KHIT; x = c.x0 + d * (xc + 0.8 + 0.12 * a) * S; y = c.gy - 0.8 * S + 1.6 * S * a * a; name = 'pounce'; th = -0.4 * a; claws = 1; }
    }
    return { x, y, th, name, f, look, mouth, claws, sc: t < 0.12 ? 1 - ease(t / 0.12) : clamp((t - 0.66) / 0.26) };
  }
  // 預先切好碎片：每一格只花幾毫秒，依出場順序慢慢做，免得貓一出來就卡一下
  let KWARM = null;
  function warmCats(ms) {
    if (!KWARM) { KWARM = []; KPLAN.forEach(([type], i) => { const L = type === 'look' ? -1 : 1; for (let f = 0; f < 8; f++) KWARM.push([i, 'g', f, L]); if (L < 0) for (let f = 0; f < 8; f++) KWARM.push([i, 'g', f, 1]); KWARM.push([i, 'pounce', 0, 1], [i, 'land', 0, 1]); if (type === 'high') KWARM.push([i, 'crouch', 0, 1]); if (type === 'leap') KWARM.push([i, 'leap', 0, 1]); }); for (const n of ['crouch', 'leap', 'land', 'pounce']) KWARM.push([9, n, 0, 1]); KWARM.push([9, 'g', 6, 1], ['eye']); }
    const t0 = performance.now();
    while (KWARM.length && performance.now() - t0 < ms) { const [b, n, f, l] = KWARM.shift(); if (b === 'eye') skyEyeShards(); else catSprite(b, n, f, l); }
  }
  // 圖框座標 → 畫面座標
  const kRig = (c, st) => catRig(BREEDS[c.bi], catPose(st.name, st.f, st.look));
  function kWorld(c, st, q) { const s = c.S / KH, rot = -c.dir * st.th, lx = (q[0] - KPX) * s * c.dir, ly = (q[1] - KPY) * s; return [st.x + lx * Math.cos(rot) - ly * Math.sin(rot), st.y + lx * Math.sin(rot) + ly * Math.cos(rot)]; }
  const KPIV = [(KPX - KW / 2) / KH, (KPY - KH / 2) / KH];
  // 畫一隻貓：碎片身體＋向量臉
  function drawCat(ctx, c, st) {
    const sp = catSprite(c.bi, st.name, st.f, st.look), rot = -c.dir * st.th;
    drawShards(ctx, sp.T, st.x, st.y, c.S, { flip: c.dir < 0, rot, pivot: KPIV, scatter: st.sc, spread: 1.0, lift: 0.35, seed: c.bi * 3, alpha: 1 - st.sc * 0.6 });
    const fa = 1 - st.sc * 2.2; if (fa <= 0) return;
    ctx.save(); ctx.globalAlpha *= fa; ctx.translate(st.x, st.y); ctx.rotate(rot); ctx.scale(c.dir * c.S / KH, c.S / KH); ctx.translate(-KPX, -KPY);
    catFace(ctx, sp.R, BREEDS[c.bi], { mouth: st.mouth, claws: st.claws, glow: st.glow || 0, slit: st.slit });
    ctx.restore();
  }

  const skyEyeShards = () => shardify('k9:eye', 400, 200, 11, (c) => skyEye(c, 200, 100, 380, 170, 1, 1), 0.06);

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
      // 開場：螢幕暗下，九對貓眼依序睜開，瞳孔由圓收成直縫；頂上一排九盞命燈。
      // 九命：橘貓、三花、黑貓、白貓、暹羅、虎斑、英短、緬因、折耳，每隔 0.19 秒從自己那對眼睛裡現身，
      //       各自衝刺／長跳／高撲／回頭看，撲擊處留下三道金色爪痕再碎掉，地上一路粉紅肉球腳印；
      //       每隻現身時點亮一盞命燈，撲完碎成光點飛回燈裡。
      // 終幕：九盞燈的光流到角色身邊合成一隻金色大貓，從角色頭上躍過；天上睜開一隻大貓眼、眨一下，全部碎成金屑。
      shadows(u, A, k, D) {
        const { ctx, P, W, H } = G, T = u * 4.2 / D;
        const S0 = Math.min(340 * k, H * 0.46), gyOf = (s) => P.ground - (KFOOT - KPY) / KH * s;
        const cats = KPLAN.map(([type, fr, dir], i) => {
          const s = S0 * BREEDS[i].sz, m = 0.62 * s, tr = KTRAVEL[type] * s, lo = m + (dir < 0 ? tr : 0), hi = W - m - (dir > 0 ? tr : 0);
          return { bi: i, type, dir, S: s, gy: gyOf(s), x0: lo <= hi ? clamp(fr * W - dir * tr / 2, lo, hi) : (lo + hi) / 2, t0: 0.34 + 0.19 * i };
        });
        const LS = Math.min(118 * k, (W - 40) / 9), LR = Math.min(LS * 0.3, 21 * k), lan = (i) => [W / 2 + (i - 4) * LS, 12 * k + hash(i, 31) * 14 * k + LR * 1.4];
        const lanBot = 26 * k + LR * 3.6 + Math.max(11, LR * 0.62) + 6 * k;
        const shat = clamp((T - 3.76) / 0.4), GOLD = ['#F5B82E', '#FFE08A', '#FFF3C4', '#E9A21E'];
        // 終幕的大貓與天眼的位置
        const Sb = Math.min(H * 0.62, 500 * k), gyb = gyOf(Sb), bdir = P.x < W / 2 ? 1 : -1;
        const bx0 = clamp(P.x - bdir * 0.7 * Sb, 0.8 * Sb, W - 0.8 * Sb), bx1 = clamp(P.x + bdir * 1.0 * Sb, 0.75 * Sb, W - 0.75 * Sb);
        const apex = Math.max(lanBot + 0.42 * Sb, Math.min(P.y - 120 * k - 0.33 * Sb, gyb - 0.3 * Sb));
        const big = { bi: 9, dir: bdir, S: Sb, gy: gyb, x0: bx0 };
        const bigState = (fb) => {
          const st = { x: bx0, y: gyb, th: 0, name: 'crouch', f: 0, look: 1, mouth: 0, claws: 0, sc: fb < 0.2 ? 1 - ease(fb / 0.2) : 0 };
          if (fb >= 0.2 && fb < 0.62) {
            const a = (fb - 0.2) / 0.42; st.x = bx0 + (bx1 - bx0) * a; st.y = gyb - Math.sin(Math.PI * a) * (gyb - apex);
            st.th = Math.atan2(Math.PI * Math.cos(Math.PI * a) * (gyb - apex), Math.max(1, Math.abs(bx1 - bx0))) * 0.55;
            if (a < 0.15) { st.name = 'g'; st.f = 6; } else if (a < 0.72) st.name = 'leap'; else { st.name = 'pounce'; st.th -= 0.35; st.claws = 1; st.mouth = 1; }
          } else if (fb >= 0.62) { st.x = bx1 + bdir * 0.1 * Sb * ease((fb - 0.62) / 0.2); st.name = fb < 0.72 ? 'land' : 'crouch'; }
          st.sc = Math.max(st.sc, shat); st.glow = 0.5; st.slit = 0.85;
          return st;
        };
        const EW = Math.min(W * 0.34, 560 * k, H * 0.75), EH = EW * 170 / 380, ex = clamp(bx1 + (bx1 < W / 2 ? 1 : -1) * (0.6 * Sb + EW * 0.55), EW * 0.55, W - EW * 0.55), ey = Math.max(lanBot + EH * 0.62 + 10 * k, H * 0.28);

        warmCats(T < 0.3 ? 7 : 3);
        ctx.save(); ctx.globalAlpha *= A; const A0 = ctx.globalAlpha;
        // 螢幕暗一點（天眼睜開時再暗一些）
        ctx.globalAlpha = A0 * (0.26 * ease(T / 0.3) + 0.12 * clamp((T - 3.38) / 0.2)); ctx.fillStyle = '#080A18'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = A0;

        // 命燈：每隻貓現身時點亮，魂飛回來時閃一下；終幕碎成金屑
        for (let i = 0; i < 9; i++) {
          const c = cats[i], [lx, ly] = lan(i), lit = ease((T - c.t0) / 0.14), fl = clamp(1 - Math.abs(T - (c.t0 + 0.94)) / 0.14);
          if (shat < 1) { ctx.globalAlpha = A0 * (1 - shat); lifeLantern(ctx, lx, ly, LR, lit, fl, T, i, '一二三四五六七八九'[i] + '命'); }
          ctx.globalAlpha = A0; spray(ctx, lx, ly, shat, 10, 90 * k, 500 + i * 17, GOLD, { size: 8 * k, fall: 60 * k });
        }

        // 天上的大貓眼：睜開、瞳孔收細、眨一下、碎掉
        const eo = ease((T - 3.4) / 0.16);
        if (eo > 0) {
          const blink = clamp(1 - Math.abs(T - 3.67) / 0.06), open = eo * (1 - 0.97 * blink), slit = ease((T - 3.44) / 0.18);
          ctx.globalAlpha = A0 * 0.7 * eo * (1 - shat); brokenRing(ctx, ex, ey, EW * 0.6, 12, T * 0.4, 0.5, '#F5B82E', 3 * k, 0.04 + shat * 0.3);
          ctx.globalAlpha = A0 * 0.45 * eo * (1 - shat); brokenRing(ctx, ex, ey, EW * 0.7, 16, -T * 0.3, 0.46, '#FFE08A', 1.6 * k, 0.04);
          ctx.globalAlpha = A0; spray(ctx, ex, ey, (T - 3.4) / 0.5, 22, EW * 0.7, 777, GOLD, { size: 9 * k });
          if (shat <= 0) skyEye(ctx, ex, ey, EW, EH, open, slit);
          else drawShards(ctx, skyEyeShards(), ex, ey, EH * 200 / 170, { scatter: shat, spread: 1.5, lift: 0.1, seed: 9 });
        }

        // 肉球腳印：跑步時一路蓋下，落地時兩個，慢慢淡掉
        for (const c of cats) {
          const marks = [];
          for (let j = 0; 0.04 + j * 0.085 < KRUN[c.type]; j++) marks.push([0.04 + j * 0.085, j % 2]);
          marks.push(c.type === 'high' ? [0.3, 0] : [KHIT, 0], c.type === 'high' ? [0.3, 1] : [KHIT, 1]);
          for (const [tj, side] of marks) {
            const age = T - c.t0 - tj; if (age < 0 || age > 0.95) continue;
            const st = catState(c, tj), pop = 1 + 0.6 * Math.max(0, 1 - age / 0.08);
            ctx.globalAlpha = A0 * (1 - age / 0.95) * 0.92;
            pawPad(ctx, st.x + c.dir * (side ? 0.3 : -0.18) * c.S, P.ground + (side ? 4 : -3) * k, 0.055 * c.S * pop, c.dir * Math.PI / 2, 0.5, ['#FF9EBB', '#FF7FA6']);
          }
        }
        const fbL = T - 2.84 - 0.62;   // 大貓落地的肉球
        if (fbL > 0 && fbL < 1) { ctx.globalAlpha = A0 * (1 - fbL) * (1 - shat); for (const s of [-1, 1]) pawPad(ctx, bx1 + bdir * (0.1 + s * 0.24) * Sb, P.ground + s * 4 * k, 0.06 * Sb, bdir * Math.PI / 2, 0.5, ['#FFE08A', '#F5B82E']); }

        // 開場的九對貓眼：散在暗處各自睜開；輪到哪隻貓，那對眼睛就飛到牠臉上、貓從眼睛周圍拼出來
        for (const c of cats) {
          const i = c.bi, e0 = 0.02 + 0.045 * i, t = T - c.t0; if (T < e0 || t > 0.16) continue;
          const B = BREEDS[i], st = catState(c, 0), R = kRig(c, st), s = c.S / KH, w = R.eyes.map((e) => kWorld(c, st, e.c)), tc = [(w[0][0] + w[1][0]) / 2, (w[0][1] + w[1][1]) / 2];
          const sx = W * (0.1 + 0.8 * [2, 6, 4, 0, 8, 3, 7, 1, 5][i] / 8), sy = lanBot + 30 * k + (P.ground - 0.55 * S0 - lanBot - 30 * k) * (0.15 + 0.85 * hash(i, 41));
          const g = ease(clamp((t + 0.14) / 0.2)), m = 1.7 - 0.7 * g;
          ctx.globalAlpha = A0 * (1 - clamp((t - 0.04) / 0.12));
          R.eyes.forEach((e, j) => { const ox = (w[j][0] - tc[0]) * m, oy = (w[j][1] - tc[1]) * m, x = sx + ox + (w[j][0] - sx - ox) * g, y = sy + oy + (w[j][1] - sy - oy) * g; catEye(ctx, x, y, e.rx * s * m, e.ry * s * m, B.eye[j], ease((T - e0) / 0.12), ease((T - e0 - 0.08) / 0.32) * 0.92, 1, B.lid); });
        }
        ctx.globalAlpha = A0;

        // 九隻貓
        for (const c of cats) {
          const t = T - c.t0; if (t < 0 || t > 0.93) continue;
          const st = catState(c, t);
          st.glow = clamp(1 - t / 0.35);
          drawCat(ctx, c, st);
        }

        // 爪痕
        for (const c of cats) {
          const f = T - c.t0 - KHIT; if (f <= 0 || f >= 0.9) continue;
          const st = catState(c, KHIT - 0.001), paw = kWorld(c, st, kRig(c, st).legs.fn[2]), len = 0.5 * c.S;
          clawMarks(ctx, clamp(paw[0] + c.dir * 0.1 * c.S, len * 0.5, W - len * 0.5), Math.min(paw[1] - 0.04 * c.S, P.ground - len * 0.32), Math.atan2(1, -c.dir * 0.55), len, f, c.bi + 1);
        }

        // 撲完碎成光點，飛回自己的命燈
        for (const c of cats) {
          const t = T - c.t0; if (t < 0.68 || t > 1.0) continue;
          const st = catState(c, 0.7), sx = st.x, sy = st.y - 0.12 * c.S, [lx, ly] = lan(c.bi), cx = sx, cy = ly + (sy - ly) * 0.25, B = BREEDS[c.bi];
          for (let j = 0; j < 12; j++) {
            const q = ease(clamp((t - 0.68 - j * 0.012) / 0.24)); if (q <= 0 || q >= 1) continue;
            const m = 1 - q, x = m * m * sx + 2 * m * q * cx + q * q * lx, y = m * m * sy + 2 * m * q * cy + q * q * ly;
            ctx.globalAlpha = A0 * (1 - q * 0.4); tri(ctx, x, y, (10 - j * 0.45) * k * (1 - q * 0.4), T * 8 + j, j + c.bi * 20, j % 3 ? B.base : '#FFE08A', j % 3 ? '#FFE08A' : null, 1.2 * k);
          }
        }

        // 終幕：九盞燈的光流下來，合成金色大貓
        for (let i = 0; i < 9; i++) {
          const [lx, ly] = lan(i), tx = bx0, ty = gyb - 0.12 * Sb, cx = (lx + tx) / 2, cy = ly;
          for (let j = 0; j < 9; j++) {
            const q = ease(clamp((T - 2.66 - i * 0.012 - j * 0.016) / 0.3)); if (q <= 0 || q >= 1) continue;
            const m = 1 - q, x = m * m * lx + 2 * m * q * cx + q * q * tx, y = m * m * ly + 2 * m * q * cy + q * q * ty;
            ctx.globalAlpha = A0 * (0.4 + 0.6 * (1 - q)); tri(ctx, x, y, (11 - j * 0.6) * k, T * 9 + j + i, i * 30 + j, GOLD[(i + j) % 4]);
          }
        }
        ctx.globalAlpha = A0;
        const fb = T - 2.84;
        if (fb > 0) {
          const st = bigState(fb);
          if (st.sc < 1) drawCat(ctx, big, st);
          if (shat > 0 && root.drawHexBurst) root.drawHexBurst(ctx, st.x, st.y - 0.1 * Sb, 260 * k, shat, { palette: 'mojin', alpha: 0.85 });
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
