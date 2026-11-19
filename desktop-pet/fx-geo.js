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

      // ── 靈貓．九命貓影：九隻碎片貓貼地衝出去再折回，身後拖著殘影；最後一隻巨大貓影躍過頭頂、碎成金屑 ──
      shadows(u, A, k, D) {
        const { ctx, P, W } = G, CAT = get('cat'), LO = get('catLo');
        ctx.save(); ctx.globalAlpha *= A;
        for (let i = 0; i < 9; i++) {
          const side = i % 2 ? 1 : -1, reach = (0.25 + (i / 9) * 0.75) * Math.max(P.x, W - P.x);
          const ph = clamp((u - i * 0.07) / (D - 1.1)) * TAU, off = Math.sin(ph) * reach * side, dir = Math.cos(ph) * side >= 0 ? 1 : -1;
          const x = P.x + off, hop = Math.abs(Math.sin(u * 9 + i)) * 24 * k, S = (92 + (i % 3) * 10) * k, y = P.ground - S * 0.42 - hop;
          const fade = 1 - clamp((u - (D - 1.1)) / 0.4);
          if (fade <= 0) continue;
          for (let j = 2; j >= 1; j--) drawShards(ctx, LO, x - dir * j * 42 * k, y, S, { flip: dir < 0, alpha: fade * 0.14 * (3 - j), color: '#A9A7BC', gap: 0 });
          drawShards(ctx, CAT, x, y, S, { flip: dir < 0, alpha: fade * 0.92 });
          ctx.globalAlpha = A * fade; ctx.fillStyle = '#F5B82E';
          const ex = x + dir * 0.52 * S, ey = y - 0.12 * S; ctx.beginPath(); ctx.moveTo(ex - dir * 4 * k, ey - 3 * k); ctx.lineTo(ex + dir * 5 * k, ey); ctx.lineTo(ex - dir * 4 * k, ey + 3 * k); ctx.closePath(); ctx.fill();
          for (let j = 0; j < 3; j++) { const q = ((u * 2.4 + i * 0.37 + j / 3) % 1); ctx.globalAlpha = A * fade * (1 - q) * 0.8; tri(ctx, x - dir * (20 + q * 70) * k, P.ground - 6 * k - q * 30 * k, (5 + j * 2) * k, q * 5 + i, i * 7 + j, j % 2 ? '#F5B82E' : '#8C8AA0'); }
          ctx.globalAlpha = A;
        }
        // 終幕：巨大貓影從角色身後躍過，到最高點碎開
        const f = (u - (D - 1.25)) / 1.15;
        if (f > 0 && f < 1) {
          const dir = P.x < W / 2 ? 1 : -1, S = 300 * k, x = P.x + dir * (f - 0.35) * 620 * k, y = P.y - 120 * k - Math.sin(clamp(f / 0.7) * Math.PI) * 140 * k;
          const sc = clamp((f - 0.45) / 0.55);
          drawShards(ctx, CAT, x, y, S, { flip: dir < 0, rot: -0.2 * dir + f * 0.3 * dir, scatter: sc, spread: 1.6, lift: 0.2, alpha: Math.min(1, f * 5) * 0.9 });
          if (sc > 0 && root.drawHexBurst) root.drawHexBurst(ctx, x, y, 260 * k, sc, { palette: 'mojin', alpha: 0.85 });
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
