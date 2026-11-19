// 反派繪圖：心魔手下的小壞蛋與三位頭目。畫風跟 draw.js 的靈寵一樣（圓滾滾、墨線、平塗、腮紅），
// 但都帶一點「被心魔沾染」的記號：紫黑煙氣、會發光的紅／琥珀色眼睛。
// drawVillain(ctx, type, o)：腳底在 (0,0)，身高大約 0 到 -120，dir=1 面向右（翻轉在裡面做）。
// o = { t(秒), st(進入狀態後秒數), dir, state:'come'|'fight'|'flee'|'down'|'steal', hurt(閃白), hp, max }
(function (root) {
  const C = {
    line: '#4A3A2A', blush: '#FFB4A8', white: '#FFFFFF', gold: '#F5B82E', goldD: '#C99A2E',
    red: '#FF4D5E', amber: '#FFB23F', cyan: '#6FF3FF', crimson: '#FF2E4D', mouth: '#7A2A33',
    wolf: '#8E93A3', wolfD: '#5E6272', wolfL: '#E6E8EE', ear: '#F2B8C0', mask: '#7A4BA0', maskD: '#4B2B66', scarf: '#C9544A', scarfD: '#8E3036',
    rat: '#B8A79C', ratD: '#8A786E', ratL: '#F3EADF', pink: '#F7B0BC', nose: '#FF8FA3', sack: '#C9A46B', sackD: '#9A7440', rope: '#8A5A33',
    crow: '#5D5876', crowD: '#3C3852', crowL: '#8C86A6', beak: '#F5B82E', straw: '#E9CB7C', strawD: '#B8923A',
    monkey: '#B9824F', monkeyD: '#8A5A33', monkeyL: '#F6D9B8', paint: '#E5484D', paintB: '#5B8FD9', stick: '#A8773A',
    owl: '#9A8470', owlD: '#6A5848', owlL: '#F0E2C6', armor: '#3B3550', armorL: '#5E5579', trim: '#E2B45C', plume: '#9A3A6A', lamp: '#FFE29A',
    jiao: '#2E5F66', jiaoD: '#1C3E45', jiaoL: '#92C9B4', fin: '#4FA3A0', horn: '#D5E2DC',
    heart: '#2A2236', heartM: '#3E3152', heartL: '#7A58A6', noh: '#F7F4EE', nohD: '#E2DACB', kuma: '#C8233A',
  };

  // 受傷閃白：所有平塗顏色往白色混
  let flash = 0;
  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function F(c) {
    if (!flash || typeof c !== 'string' || c[0] !== '#') return c;
    const [r, g, b] = hex(c), m = (v) => Math.round(v + (255 - v) * flash);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  function rgba(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }
  function ellipse(ctx, x, y, rx, ry, fill, stroke, rot) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = F(fill); ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function paint(ctx, fill, lw) {   // 填色＋墨線（lw=0 只填色）
    if (fill) { ctx.fillStyle = F(fill); ctx.fill(); }
    if (lw !== 0) { ctx.lineWidth = lw || 3; ctx.strokeStyle = C.line; ctx.stroke(); }
  }
  function glow(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function star(ctx, x, y, r, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.fillStyle = C.gold; ctx.strokeStyle = C.line; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  // 心魔的紫黑煙氣：一團一團往上飄
  function wisps(ctx, t, x, y, n, s, seed) {
    s = s || 1; seed = seed || 0;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const p = (t * 0.5 + i / n + seed * 0.37) % 1, a = Math.sin(p * Math.PI);
      const wx = x + Math.sin(p * 5 + i * 2.1 + seed) * 7 * s, wy = y - p * 36 * s, r = (7.5 - p * 4.5) * s;
      ctx.fillStyle = `rgba(46,24,62,${a * 0.62})`; ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(160,100,220,${a * 0.42})`; ctx.beginPath(); ctx.arc(wx - r * 0.3, wy - r * 0.35, r * 0.42, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function curl(ctx, t, x, y, len, s, ph) {   // 一縷捲起的黑煙
    s = s || 1;
    ctx.save(); ctx.lineCap = 'round';
    const w = Math.sin(t * 2.2 + ph) * 6 * s, ex = x + w * 0.6, ey = y - len;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 9 * s + w, y - len * 0.35, x - 10 * s - w, y - len * 0.7, ex, ey);
    ctx.arc(ex + 4 * s, ey, 4 * s, Math.PI, Math.PI * 2.5);
    ctx.strokeStyle = 'rgba(40,20,56,0.5)'; ctx.lineWidth = 4.5 * s; ctx.stroke();
    ctx.strokeStyle = 'rgba(175,115,235,0.6)'; ctx.lineWidth = 1.6 * s; ctx.stroke();
    ctx.restore();
  }

  // 眼睛：mood = sly（平常賊笑）/ fight / flee / down / steal
  function eyes(ctx, k, xs, ey, col, o) {
    o = o || {};
    const sz = o.size || 1, m = k.mood, t = k.t;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    xs.forEach((x, i) => {
      const inn = i === 0 ? 1 : -1;   // 往另一隻眼睛的方向
      if (m === 'down') {   // 轉圈圈眼
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.35) {
          const r = a * 0.55 * sz, px = x + Math.cos(a + t * 8) * r, py = ey + Math.sin(a + t * 8) * r;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.9; ctx.stroke();
        return;
      }
      if (o.hole) ellipse(ctx, x, ey, 7.5 * sz, 7 * sz, o.hole);   // 面具上的眼洞
      if (m === 'flee') {   // 嚇到：白眼仁、小瞳孔
        ctx.lineWidth = 2.2;
        ellipse(ctx, x, ey, 5.6 * sz, 6.4 * sz, '#FFFFFF', C.line);
        ellipse(ctx, x + 1.2 * sz, ey + 0.6, 2.4 * sz, 2.6 * sz, col, null);
      } else {
        const blink = m !== 'fight' && (t % 3.7) < 0.12;
        glow(ctx, x, ey, (m === 'fight' ? 13 : 10) * sz, col, m === 'fight' ? 0.7 : 0.45);
        if (blink) {
          ctx.strokeStyle = C.line; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.moveTo(x - 5 * sz, ey); ctx.quadraticCurveTo(x, ey + 2, x + 5 * sz, ey); ctx.stroke();
        } else {
          ellipse(ctx, x, ey, 4.9 * sz, 5.5 * sz, C.line);
          ellipse(ctx, x + 0.5 * sz, ey + 0.7 * sz, 3.1 * sz, 3.5 * sz, col);
          ellipse(ctx, x + 0.5 * sz, ey + 1.4 * sz, 1.4 * sz, 1.6 * sz, '#FFFFFF', null);
          ctx.globalAlpha = 0.9; ellipse(ctx, x + 1.9 * sz, ey - 2.1 * sz, 1.4 * sz, 1.4 * sz, '#FFFFFF'); ctx.globalAlpha = 1;
          if (m === 'steal' && o.lid) {   // 瞇眼偷看：上眼皮蓋一半
            ctx.beginPath(); ctx.ellipse(x, ey, 5.8 * sz, 6.4 * sz, 0, Math.PI, Math.PI * 2); ctx.closePath();
            ctx.fillStyle = F(o.lid); ctx.fill();
            ctx.strokeStyle = C.line; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - 5.6 * sz, ey); ctx.lineTo(x + 5.6 * sz, ey); ctx.stroke();
          }
        }
      }
      if (o.brow !== false) {   // 眉毛：壞笑時內低外高；害怕時內高
        const tilt = (m === 'flee' ? -2.4 : m === 'fight' ? 3.6 : 2.6) * sz, by = ey - 9 * sz - (o.browUp || 0);
        ctx.strokeStyle = o.browCol || C.line; ctx.lineWidth = 2.6 * Math.min(1.3, sz);
        ctx.beginPath(); ctx.moveTo(x - inn * 5 * sz, by - tilt); ctx.lineTo(x + inn * 4.5 * sz, by + tilt * 0.55); ctx.stroke();
      }
    });
    ctx.restore();
  }

  // 嘴：壞笑（嘴角一邊上揚、露一顆小虎牙）/ 開打咧嘴 / 逃跑哇哇 / 倒地吐舌
  function mouth(ctx, k, x, y, s, o) {
    o = o || {}; s = s || 1;
    const m = k.mood;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = o.col || C.line; ctx.lineWidth = 2.2;
    ctx.translate(x, y); ctx.scale(s, s);
    if (m === 'fight') {
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(2, -1, 9, -4); ctx.quadraticCurveTo(4, 8, -6, -2); ctx.closePath();
      ctx.fillStyle = F(C.mouth); ctx.fill(); ctx.stroke();
      if (o.fang !== false) {
        ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 1.2;
        for (const fx of [-2.5, 5]) { ctx.beginPath(); ctx.moveTo(fx - 2, -1.6 - (fx > 0 ? 1 : 0)); ctx.lineTo(fx, 2.6); ctx.lineTo(fx + 2, -1.8 - (fx > 0 ? 1 : 0)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
    } else if (m === 'flee') {
      ctx.beginPath(); ctx.ellipse(1, 0, 3.6, 4.4, 0, 0, Math.PI * 2); ctx.fillStyle = F(C.mouth); ctx.fill(); ctx.stroke();
    } else if (m === 'down') {
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-3, -3, 0, 0); ctx.quadraticCurveTo(3, 3, 6, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, 1); ctx.quadraticCurveTo(3, 7, 5.5, 2.4); ctx.fillStyle = F('#FF8FA3'); ctx.fill(); ctx.stroke();
    } else {
      const wide = m === 'steal' ? 1.25 : 1;
      ctx.beginPath(); ctx.moveTo(-5 * wide, -1); ctx.quadraticCurveTo(1, 4.5, 8 * wide, -3.5); ctx.stroke();
      if (o.fang !== false) {
        ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(2.6 * wide, 1.2); ctx.lineTo(4.2 * wide, 4.6); ctx.lineTo(5.6 * wide, 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function feet(ctx, k, col, gap, rx) {
    gap = gap || 15; rx = rx || 9;
    const ph = k.ph;
    ctx.lineWidth = 3;
    ellipse(ctx, -gap + ph * 7, -1 - Math.max(0, ph) * 3, rx, 5, col, C.line);
    ellipse(ctx, gap - ph * 7, -1 - Math.max(0, -ph) * 3, rx, 5, col, C.line);
  }

  function clipBody(ctx, x, y, rx, ry) { ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.clip(); }

  // 偷來的花布包袱，露出一顆金丹
  function loot(ctx, x, y, t, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s || 1, s || 1); ctx.rotate(Math.sin(t * 12) * 0.08);
    glow(ctx, 0, -12, 18, C.gold, 0.45);
    ctx.lineWidth = 2.4; ctx.strokeStyle = C.line;
    ellipse(ctx, 0, -12, 6, 6, C.gold, C.line); ellipse(ctx, -1.8, -14, 1.8, 1.4, '#FFF6D0');
    ctx.beginPath(); ctx.moveTo(-15, -4); ctx.quadraticCurveTo(-18, 12, 0, 13); ctx.quadraticCurveTo(18, 12, 15, -4); ctx.quadraticCurveTo(0, -10, -15, -4);
    paint(ctx, '#7CC6E8', 2.4);
    ctx.fillStyle = F('#FFFFFF');
    for (const [dx, dy] of [[-8, 3], [0, 6], [8, 2], [-3, -1], [5, -3]]) { ctx.beginPath(); ctx.arc(dx, dy, 1.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-11, -15); ctx.lineTo(-2, -10); ctx.closePath(); paint(ctx, '#7CC6E8', 2);
    ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(11, -16); ctx.lineTo(2, -10); ctx.closePath(); paint(ctx, '#7CC6E8', 2);
    ctx.restore();
  }

  // ───────────── 黑風狼 ─────────────
  function drawWolf(ctx, k) {
    const t = k.t, m = k.mood;
    const flut = Math.sin(t * (m === 'flee' ? 18 : 7)), flut2 = Math.sin(t * (m === 'flee' ? 18 : 7) + 1.3);
    wisps(ctx, t, -24, -4, 4, 1, 0); wisps(ctx, t, 26, -4, 3, 0.8, 1.3);
    curl(ctx, t, -44, -6, 30, 0.9, 0);
    // 尾巴：蓬鬆，尾尖深色
    ctx.save(); ctx.translate(-30, -22); ctx.rotate(-0.45 + Math.sin(t * (m === 'fight' ? 9 : 4)) * 0.12 + (m === 'flee' ? 0.5 : 0) + (m === 'down' ? 0.7 : 0));
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-30, 8, -38, -14); ctx.quadraticCurveTo(-38, -36, -20, -36); ctx.quadraticCurveTo(-12, -18, 4, -8); ctx.closePath();
    ctx.fillStyle = F(C.wolf); ctx.fill(); ctx.save(); ctx.clip(); ellipse(ctx, -31, -32, 13, 11, C.wolfD); ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-30, 8, -38, -14); ctx.quadraticCurveTo(-38, -36, -20, -36); ctx.quadraticCurveTo(-12, -18, 4, -8); ctx.closePath();
    paint(ctx, null);
    ctx.restore();
    // 圍巾飄帶
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-26, -21); ctx.quadraticCurveTo(-46, -28 + flut * 5, -70, -22 - flut2 * 7); ctx.lineTo(-63, -15 - flut2 * 6.5); ctx.lineTo(-67, -8 - flut2 * 6);
    ctx.quadraticCurveTo(-46, -12 + flut * 4, -24, -9); ctx.closePath(); paint(ctx, C.scarf, 2.6);
    ctx.strokeStyle = F(C.scarfD); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-30, -15); ctx.quadraticCurveTo(-46, -20 + flut * 4.5, -62, -15 - flut2 * 6.5); ctx.stroke();
    ctx.restore();
    // 面罩的綁帶
    for (const [dy, ph] of [[0, 0], [7, 1.7]]) {
      const f = Math.sin(t * (m === 'flee' ? 16 : 6) + ph);
      ctx.beginPath(); ctx.moveTo(-30, -50 + dy * 0.5); ctx.quadraticCurveTo(-44, -54 + dy + f * 4, -54, -48 + dy + f * 6); ctx.lineTo(-50, -43 + dy + f * 5); ctx.quadraticCurveTo(-42, -46 + dy + f * 3, -30, -44 + dy * 0.5); ctx.closePath();
      paint(ctx, C.mask, 2.4);
    }
    feet(ctx, k, C.wolf);
    // 耳朵（逃跑時往後貼）
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s < 0 ? -18 : 16, -58);
      ctx.rotate(s * 0.22 + (m === 'flee' ? -0.55 : 0) + (m === 'down' ? -0.3 : 0) + Math.sin(t * 3 + s) * 0.03);
      ctx.beginPath(); ctx.moveTo(-11, 7); ctx.lineTo(0, -26); ctx.lineTo(11, 5); ctx.closePath(); paint(ctx, C.wolf);
      ctx.beginPath(); ctx.moveTo(-5.5, 3); ctx.lineTo(0, -14); ctx.lineTo(5.5, 2); ctx.closePath(); ctx.fillStyle = F(C.ear); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(-4.4, -13); ctx.lineTo(4.4, -13.5); ctx.closePath(); ctx.fillStyle = F(C.wolfD); ctx.fill();
      ctx.restore();
    }
    // 身體＝頭
    ellipse(ctx, 0, -34, 40, 33, C.wolf, null);
    clipBody(ctx, 0, -34, 40, 33);
    ellipse(ctx, 10, -12, 26, 16, C.wolfL);
    ctx.beginPath(); ctx.moveTo(-44, -54); ctx.quadraticCurveTo(8, -64, 46, -54); ctx.lineTo(46, -36); ctx.quadraticCurveTo(8, -30, -44, -38); ctx.closePath();
    ctx.fillStyle = F(C.mask); ctx.fill();
    ctx.strokeStyle = F(C.maskD); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-44, -38); ctx.quadraticCurveTo(8, -30, 46, -36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-44, -24); ctx.quadraticCurveTo(0, -8, 44, -22); ctx.lineTo(44, -10); ctx.quadraticCurveTo(0, 4, -44, -12); ctx.closePath();
    ctx.fillStyle = F(C.scarf); ctx.fill();
    ctx.strokeStyle = F(C.scarfD); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-44, -18); ctx.quadraticCurveTo(0, -2, 44, -16); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 3; ellipse(ctx, 0, -34, 40, 33, null, C.line);
    ellipse(ctx, 30, -15, 6, 5, C.scarf, C.line);   // 圍巾結
    // 鼻吻
    ctx.lineWidth = 2.8; ellipse(ctx, 33, -27, 13, 9.5, C.wolfL, C.line);
    ellipse(ctx, 44, -31, 4.8, 3.8, C.line); ellipse(ctx, 43, -32.4, 1.5, 1, '#FFFFFF');
    mouth(ctx, k, 34, -21, 0.9);
    eyes(ctx, k, [0, 22], -45, C.red, { hole: C.wolfL, lid: C.mask, browUp: 2 });
    ellipse(ctx, -16, -27, 6, 3.6, C.blush);
    // 開打：舉起爪子
    if (m === 'fight') {
      const w = k.w, px = 40 + Math.max(0, w) * 10, py = -10 - Math.max(0, -w) * 16;
      ctx.lineWidth = 2.6; ellipse(ctx, px, py, 8, 7, C.wolf, C.line);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.6;
      for (const d of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(px + 6, py + d - 1); ctx.lineTo(px + 10, py + d * 1.3 - 2); ctx.stroke(); }
      if (w > 0.5) {   // 爪風
        ctx.strokeStyle = 'rgba(180,120,230,0.8)'; ctx.lineWidth = 2.4;
        for (const d of [-7, 0, 7]) { ctx.beginPath(); ctx.arc(px + 4, py + d, 16, -0.6, 0.6); ctx.stroke(); }
      }
    }
    if (m === 'flee') loot(ctx, -22, -66, t, 0.9);
  }

  // ───────────── 偷吃鼠 ─────────────
  function drawRat(ctx, k) {
    const t = k.t, m = k.mood, big = m === 'flee' ? 1.15 : 1;
    // 長尾巴：拖在地上，尾端捲起來
    const tw = Math.sin(t * (m === 'flee' ? 14 : 3)) * 6;
    ctx.beginPath(); ctx.moveTo(-30, -12); ctx.bezierCurveTo(-58, -2, -78, 2 + tw * 0.3, -86, -14 + tw); ctx.quadraticCurveTo(-90, -32 + tw, -76, -30 + tw);
    ctx.strokeStyle = C.line; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = F(C.pink); ctx.lineWidth = 3.8; ctx.stroke();
    // 背上的大補丁布袋
    ctx.save(); ctx.translate(-24, -60);
    ctx.rotate(-0.3 + (m === 'fight' ? k.w * 0.22 : 0) + Math.sin(t * 9) * (k.walk ? 0.04 : 0.01)); ctx.scale(big, big);
    wisps(ctx, t, 14, -26, 3, 0.7, 2);
    ctx.beginPath(); ctx.moveTo(6, -22); ctx.bezierCurveTo(-24, -30, -38, 4, -24, 20); ctx.bezierCurveTo(-8, 32, 26, 28, 30, 6); ctx.bezierCurveTo(32, -8, 22, -18, 14, -22); ctx.closePath();
    paint(ctx, C.sack);
    ctx.save(); ctx.clip();
    ellipse(ctx, 4, 18, 30, 10, C.sackD); ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(6, -22); ctx.bezierCurveTo(-24, -30, -38, 4, -24, 20); ctx.bezierCurveTo(-8, 32, 26, 28, 30, 6); ctx.bezierCurveTo(32, -8, 22, -18, 14, -22); ctx.stroke();
    // 補丁
    ctx.save(); ctx.translate(-12, 2); ctx.rotate(-0.15);
    ctx.beginPath(); ctx.rect(-7, -7, 14, 13); paint(ctx, '#8FB3C9', 2);
    ctx.setLineDash([2.5, 2.5]); ctx.lineWidth = 1.2; ctx.strokeStyle = '#FFFFFF'; ctx.beginPath(); ctx.rect(-4.5, -4.5, 9, 8); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    ctx.save(); ctx.translate(14, 12); ctx.rotate(0.3);
    ctx.beginPath(); ctx.rect(-5.5, -5, 11, 10); paint(ctx, '#E9CB7C', 2);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(3, 2); ctx.moveTo(3, -2); ctx.lineTo(-3, 2); ctx.stroke();
    ctx.restore();
    // 袋口：束起來的一撮
    if (m === 'flee') {   // 塞得滿出來
      glow(ctx, 10, -30, 22, C.gold, 0.5);
      ellipse(ctx, 4, -30, 7, 7, C.gold, C.line); ellipse(ctx, 2, -32, 2, 1.5, '#FFF6D0');
      ctx.beginPath(); ctx.moveTo(14, -24); ctx.quadraticCurveTo(10, -40, 20, -40); ctx.quadraticCurveTo(28, -34, 14, -24); paint(ctx, '#FFB4A8', 2.2);   // 偷來的仙桃
    }
    ctx.beginPath(); ctx.moveTo(4, -21); ctx.lineTo(0, -32); ctx.quadraticCurveTo(10, -36, 18, -30); ctx.lineTo(15, -20); ctx.closePath(); paint(ctx, C.sack, 2.6);
    ctx.strokeStyle = F(C.rope); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(3, -22); ctx.lineTo(16, -21); ctx.stroke();
    ctx.restore();
    feet(ctx, k, C.pink, 14, 8.5);
    // 大圓耳
    for (const [x, y] of [[-20, -66], [16, -70]]) {
      ctx.lineWidth = 3; ellipse(ctx, x, y, 15, 15, C.rat, C.line); ellipse(ctx, x + 1, y + 1, 9, 9, C.pink);
    }
    // 身體（梨形，胖胖的）
    ellipse(ctx, 0, -34, 40, 35, C.rat, null);
    clipBody(ctx, 0, -34, 40, 35);
    ellipse(ctx, 8, -14, 27, 19, C.ratL);
    ctx.strokeStyle = F(C.rope); ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(-36, -60); ctx.quadraticCurveTo(0, -30, 28, 2); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 3; ellipse(ctx, 0, -34, 40, 35, null, C.line);
    // 尖鼻子
    ctx.beginPath(); ctx.moveTo(24, -47); ctx.quadraticCurveTo(48, -42, 54, -32); ctx.quadraticCurveTo(52, -22, 26, -20); paint(ctx, C.rat, 2.8);
    ctx.beginPath(); ctx.moveTo(30, -30); ctx.quadraticCurveTo(44, -28, 52, -28); ctx.quadraticCurveTo(46, -22, 28, -22); ctx.closePath(); ctx.fillStyle = F(C.ratL); ctx.fill();
    ctx.lineWidth = 2; ellipse(ctx, 54, -32, 5, 4.4, C.nose, C.line); ellipse(ctx, 53, -33.5, 1.5, 1, '#FFFFFF');
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
    const wk = Math.sin(t * 7) * 1.5;
    for (const [a, b] of [[-36, -40], [-30, -28]]) { ctx.beginPath(); ctx.moveTo(46, (a + b) / 2 + 4); ctx.quadraticCurveTo(56, a, 66, a - 2 + wk); ctx.stroke(); }
    // 暴牙
    ctx.lineWidth = 1.6; ctx.strokeStyle = C.line;
    const open = m === 'fight' ? 3 : 0;
    if (open) { ctx.beginPath(); ctx.ellipse(40, -18, 7, 4, 0, 0, Math.PI * 2); ctx.fillStyle = F(C.mouth); ctx.fill(); }
    for (const x of [35.5, 40.5]) { ctx.beginPath(); ctx.roundRect(x, -22 + open * 0.3, 5, 7.5, 1.2); ctx.fillStyle = F('#FFFFFF'); ctx.fill(); ctx.stroke(); }
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(26, -25); ctx.quadraticCurveTo(38, m === 'flee' ? -24 : -20, 48, m === 'flee' ? -22 : -26); ctx.stroke();
    eyes(ctx, k, [2, 22], -46, C.amber, { lid: C.rat });
    ellipse(ctx, -14, -30, 6, 3.6, C.blush);
    // 小手抓著背帶；偷東西時搓手
    const rub = m === 'steal' ? Math.sin(t * 14) * 3 : 0;
    ctx.lineWidth = 2.6; ellipse(ctx, 20 + rub, -10, 7, 6, C.pink, C.line);
    if (m === 'steal') ellipse(ctx, 26 - rub, -8, 6.5, 5.5, C.pink, C.line);
  }

  // ───────────── 烏鴉精 ─────────────
  function crowWing(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(s * a);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(s * 20, -6, s * 22, 12);
    ctx.lineTo(s * 16, 9); ctx.lineTo(s * 15, 22); ctx.lineTo(s * 9, 15); ctx.lineTo(s * 5, 25); ctx.lineTo(s * 1, 14); ctx.lineTo(-s * 5, 18);
    ctx.quadraticCurveTo(-s * 8, 2, 0, -8); ctx.closePath();
    paint(ctx, C.crowD);
    ctx.strokeStyle = F(C.crowL); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(s * 4, -2); ctx.quadraticCurveTo(s * 10, 6, s * 9, 13); ctx.moveTo(s * 11, -2); ctx.quadraticCurveTo(s * 16, 4, s * 15, 10); ctx.stroke();
    ctx.restore();
  }
  function drawCrow(ctx, k) {
    const t = k.t, m = k.mood, air = k.lift > 2;
    const flap = (k.walk || m === 'fight') ? Math.sin(t * (m === 'flee' ? 24 : 13)) * 0.4 : Math.sin(t * 2) * 0.06;
    wisps(ctx, t, -20, -8, 4, 0.9, 0.5); curl(ctx, t, 30, -10, 28, 0.8, 2);
    // 飄落的黑羽毛
    const fp = (t * 0.35) % 1;
    ctx.save(); ctx.globalAlpha = Math.sin(fp * Math.PI); ctx.translate(-46 + Math.sin(fp * 9) * 8, -90 + fp * 80); ctx.rotate(Math.sin(fp * 9) * 0.7);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(5, 0, 0, 8); ctx.quadraticCurveTo(-5, 0, 0, -8); paint(ctx, C.crowD, 1.6);
    ctx.restore();
    // 尾羽（破破的）
    ctx.save(); ctx.translate(-30, -24); ctx.rotate(0.25 + Math.sin(t * 5) * 0.06);
    ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(-22, -16); ctx.lineTo(-17, -9); ctx.lineTo(-27, -5); ctx.lineTo(-18, -1); ctx.lineTo(-24, 6); ctx.lineTo(4, 6); ctx.closePath();
    paint(ctx, C.crowD);
    ctx.restore();
    // 腳：細細的鳥腳，三根腳趾
    ctx.save(); ctx.lineCap = 'round';
    for (const x of [-9, 9]) {
      const y0 = -10, y1 = air ? -4 : 0;
      ctx.strokeStyle = C.line; ctx.lineWidth = 5.2; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1);
      for (const dx of [-5, 1, 6]) { ctx.moveTo(x, y1); ctx.lineTo(x + dx, y1 + (air ? 3 : 0.5)); }
      ctx.stroke();
      ctx.strokeStyle = F(C.beak); ctx.lineWidth = 2.4; ctx.stroke();
    }
    ctx.restore();
    crowWing(ctx, -32, -42, -1, 0.35 + flap);
    // 圓身體
    ellipse(ctx, 0, -38, 36, 33, C.crow, null);
    clipBody(ctx, 0, -38, 36, 33);
    ellipse(ctx, 10, -16, 24, 16, '#6F6A8A');
    ctx.restore();
    ctx.globalAlpha = 0.7; ellipse(ctx, -14, -56, 9, 5, C.crowL, null, -0.5); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ellipse(ctx, 0, -38, 36, 33, null, C.line);
    crowWing(ctx, 0, -24, -1, -0.5 + flap * 0.6);
    // 頭頂亂毛
    ctx.beginPath(); ctx.moveTo(-14, -68); ctx.quadraticCurveTo(-26, -80, -22, -86); ctx.quadraticCurveTo(-14, -78, -8, -70);
    ctx.quadraticCurveTo(-8, -84, -2, -88); ctx.quadraticCurveTo(0, -78, 2, -70); paint(ctx, C.crow, 2.4);
    // 尖嘴（開打時張開）
    const op = m === 'fight' ? 4 + Math.max(0, k.w) * 3 : m === 'flee' ? 5 : 0;
    ctx.beginPath(); ctx.moveTo(30, -34); ctx.lineTo(48, -31 + op * 0.4); ctx.lineTo(28, -28 + op * 0.2); ctx.closePath(); paint(ctx, C.goldD, 2.4);
    ctx.beginPath(); ctx.moveTo(26, -44); ctx.quadraticCurveTo(44, -44, 54, -36 - op); ctx.quadraticCurveTo(42, -33 - op * 0.6, 28, -33 - op * 0.3); ctx.closePath(); paint(ctx, C.beak, 2.6);
    ellipse(ctx, 38, -40, 1.6, 1.2, C.line);
    if (m === 'flee') loot(ctx, 48, -26, t, 0.55);   // 叼著搶來的東西
    eyes(ctx, k, [-2, 17], -48, C.red, { lid: C.crow });
    ellipse(ctx, -16, -32, 5.5, 3.4, C.blush);
    // 小斗笠
    ctx.save(); ctx.translate(2, -70); ctx.rotate(-0.16 + (m === 'flee' ? -0.35 : 0) + (m === 'fight' ? 0.1 : 0) + (air ? -0.08 : 0));
    ctx.beginPath(); ctx.moveTo(-25, 3); ctx.lineTo(0, -15); ctx.lineTo(25, 3); ctx.quadraticCurveTo(0, 9, -25, 3); ctx.closePath(); paint(ctx, C.straw, 2.6);
    ctx.strokeStyle = F(C.strawD); ctx.lineWidth = 1.3;
    for (const x of [-13, 0, 13]) { ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(x, 4); ctx.stroke(); }
    ctx.lineWidth = 2; ellipse(ctx, 0, -15, 3, 2.5, C.strawD, C.line);
    ctx.restore();
  }

  // ───────────── 山魈猴 ─────────────
  function drawMonkey(ctx, k) {
    const t = k.t, m = k.mood, w = k.w;
    wisps(ctx, t, -22, -6, 4, 0.9, 0.2); curl(ctx, t, 34, -8, 26, 0.8, 1);
    // 捲捲尾巴
    ctx.save(); ctx.translate(Math.sin(t * 3) * 1.5, 0);
    ctx.beginPath(); ctx.moveTo(-32, -16); ctx.quadraticCurveTo(-56, -12, -58, -36);
    const cx = -48, cy = -40;
    for (let a = Math.PI * 1.05; a < Math.PI * 3.2; a += 0.2) { const r = 10 - (a - Math.PI) * 2.6; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.strokeStyle = C.line; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = F(C.monkey); ctx.lineWidth = 4.2; ctx.stroke();
    ctx.restore();
    // 棍子：逃跑時扛在肩上挑著包袱
    const stickAng = m === 'fight' ? (w < 0 ? -0.3 + w * 1.9 : -0.3 + w * 1.5) : m === 'flee' ? -1.05 : m === 'down' ? 1.2 : -0.18 + Math.sin(t * 2) * 0.04;
    const drawStick = () => {
      ctx.save(); ctx.translate(30, -24); ctx.rotate(stickAng);
      if (m === 'flee') loot(ctx, 0, -66, t, 0.85);
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.line; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, -64); ctx.stroke();
      ctx.strokeStyle = F(C.stick); ctx.lineWidth = 5.4; ctx.stroke();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
      for (const y of [-16, -40]) { ctx.beginPath(); ctx.moveTo(-3, y); ctx.lineTo(3, y - 2); ctx.stroke(); }
      if (m !== 'flee') {   // 棍頭綁著一條紫色布條
        const f = Math.sin(t * 8) * 4;
        ctx.beginPath(); ctx.moveTo(0, -56); ctx.quadraticCurveTo(-12, -58 + f, -20, -50 + f); ctx.lineTo(-15, -46 + f); ctx.quadraticCurveTo(-8, -52, 0, -50); ctx.closePath(); paint(ctx, C.mask, 2);
      }
      if (m === 'fight' && w > 0.4) {   // 揮棍的風
        ctx.strokeStyle = 'rgba(180,120,230,0.75)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 70, -Math.PI / 2 - 1.2, -Math.PI / 2 - 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 56, -Math.PI / 2 - 1.0, -Math.PI / 2 - 0.3); ctx.stroke();
      }
      ctx.restore();
    };
    if (m === 'flee') drawStick();
    feet(ctx, k, C.monkeyD);
    // 耳朵
    ctx.lineWidth = 3;
    ellipse(ctx, -38, -42, 10, 11, C.monkey, C.line); ellipse(ctx, -38, -42, 5.5, 6.5, C.monkeyL);
    ellipse(ctx, 40, -46, 9, 10, C.monkey, C.line); ellipse(ctx, 41, -46, 5, 6, C.monkeyL);
    // 頭頂一撮毛
    ctx.beginPath(); ctx.moveTo(-12, -62); ctx.quadraticCurveTo(-14, -78, -6, -82); ctx.quadraticCurveTo(-4, -72, 0, -68); ctx.quadraticCurveTo(4, -84, 14, -84); ctx.quadraticCurveTo(10, -74, 12, -64); ctx.closePath();
    paint(ctx, C.monkey, 2.6);
    ellipse(ctx, 0, -34, 39, 33, C.monkey, null);
    clipBody(ctx, 0, -34, 39, 33);
    ellipse(ctx, 6, -10, 24, 14, C.monkeyL);
    ctx.restore();
    ctx.lineWidth = 3; ellipse(ctx, 0, -34, 39, 33, null, C.line);
    // 臉：淺色心形臉盤＋紅色畫臉（山魈）
    ctx.fillStyle = F(C.monkeyL);
    ctx.beginPath(); ctx.ellipse(0, -42, 15, 14, 0, 0, Math.PI * 2); ctx.ellipse(24, -42, 15, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -28, 21, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = F(C.paint);   // 紅面具：繞過兩隻眼睛
    ctx.beginPath(); ctx.moveTo(-11, -44); ctx.quadraticCurveTo(-8, -55, 1, -53); ctx.quadraticCurveTo(12, -50, 23, -53); ctx.quadraticCurveTo(34, -55, 36, -44);
    ctx.quadraticCurveTo(34, -36, 24, -36); ctx.quadraticCurveTo(12, -40, 0, -36); ctx.quadraticCurveTo(-10, -36, -11, -44); ctx.fill();
    ctx.beginPath(); ctx.roundRect(8.5, -45, 7, 20, 3.5); ctx.fill();   // 紅鼻樑
    ctx.strokeStyle = F(C.paintB); ctx.lineWidth = 2;   // 鼻樑兩側的藍色細紋
    for (const x of [6.5, 17.5]) { ctx.beginPath(); ctx.moveTo(x, -44); ctx.lineTo(x, -33); ctx.stroke(); }
    ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = 0.8; ellipse(ctx, 11, -42, 1.5, 3, '#FFFFFF'); ctx.globalAlpha = 1;
    ellipse(ctx, 10, -27, 1.4, 1.1, C.line); ellipse(ctx, 14, -27, 1.4, 1.1, C.line);
    eyes(ctx, k, [0, 24], -45, C.amber, { lid: C.paint, browUp: 1 });
    mouth(ctx, k, 11, -20, 1);
    ellipse(ctx, -12, -28, 5.5, 3.4, C.blush); ellipse(ctx, 35, -28, 5.5, 3.4, C.blush);
    if (m !== 'flee') drawStick();
    ctx.lineWidth = 2.6; ellipse(ctx, 30, -24, 7.5, 7, C.monkeyD, C.line);   // 抓棍子的手
  }

  // ───────────── 燈影魔梟（頭目）─────────────
  function lantern(ctx, x, y, t, k) {
    const fl = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    ctx.save(); ctx.translate(x, y);
    glow(ctx, 0, 4, 62 * fl, C.amber, 0.32 + (k.mood === 'fight' ? 0.12 : 0));
    glow(ctx, 0, 4, 24, '#FFE9A8', 0.6 * fl);
    ctx.lineWidth = 2.4; ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, -12); ctx.lineTo(7, -12); ctx.lineTo(11, -7); ctx.lineTo(-11, -7); ctx.closePath(); paint(ctx, C.trim, 2.2);   // 頂蓋
    ctx.beginPath(); ctx.roundRect(-10, -7, 20, 22, 6); paint(ctx, C.lamp, 2.4);   // 燈罩
    ctx.save(); ctx.clip();
    glow(ctx, 0, 4, 12, '#FFFFFF', 0.9);
    ctx.fillStyle = F('#FF9F2E'); ctx.beginPath(); ctx.moveTo(0, -3 - fl * 3); ctx.quadraticCurveTo(5, 4, 0, 8); ctx.quadraticCurveTo(-5, 4, 0, -3 - fl * 3); ctx.fill();
    ctx.fillStyle = '#FFF6D0'; ctx.beginPath(); ctx.moveTo(0, 1); ctx.quadraticCurveTo(2.2, 5, 0, 7); ctx.quadraticCurveTo(-2.2, 5, 0, 1); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.6;
    for (const bx of [-4, 4]) { ctx.beginPath(); ctx.moveTo(bx, -7); ctx.lineTo(bx, 15); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-9, 15); ctx.lineTo(9, 15); ctx.lineTo(6, 20); ctx.lineTo(-6, 20); ctx.closePath(); paint(ctx, C.trim, 2.2);
    ctx.strokeStyle = F(C.kuma); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(Math.sin(t * 3) * 2, 30); ctx.stroke();   // 紅流蘇
    ctx.restore();
  }
  function drawOwl(ctx, k) {
    const t = k.t, m = k.mood, w = k.w;
    const fl = Math.sin(t * 3);
    // 披風
    ctx.beginPath(); ctx.moveTo(-30, -66); ctx.quadraticCurveTo(-58, -40, -66 + fl * 4, -2); ctx.lineTo(-52, -8 + fl * 2); ctx.lineTo(-44, 0); ctx.lineTo(-32, -6); ctx.lineTo(-20, 0); ctx.lineTo(16, -6); ctx.lineTo(30, -60); ctx.closePath();
    paint(ctx, '#3A2448');
    ctx.save(); ctx.clip(); ctx.globalAlpha = 0.7; ellipse(ctx, -46, -24, 14, 30, '#6E2E58', null, 0.3); ctx.restore();
    wisps(ctx, t, -48, -4, 4, 1.1, 0.8); wisps(ctx, t, 26, -4, 3, 0.9, 2.1);
    curl(ctx, t, -64, -10, 36, 1, 0.5);
    // 耳羽與頭盔的翎
    for (const [x, a, l] of [[-22, -0.55, 28], [20, 0.5, 30]]) {
      ctx.save(); ctx.translate(x, -72); ctx.rotate(a + Math.sin(t * 2.4 + x) * 0.05);
      ctx.beginPath(); ctx.moveTo(-7, 4); ctx.quadraticCurveTo(-8, -l * 0.6, 0, -l); ctx.quadraticCurveTo(8, -l * 0.6, 7, 4); ctx.closePath(); paint(ctx, C.owlD, 2.6);
      ctx.strokeStyle = F(C.owlL); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -l * 0.8); ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.translate(0, -82);
    const pw = Math.sin(t * 2.2) * 0.08;
    ctx.rotate(-0.25 + pw);
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.bezierCurveTo(-12, -16, -6, -30, 8, -38); ctx.bezierCurveTo(4, -28, 14, -18, 4, 0); ctx.closePath(); paint(ctx, C.plume, 2.6);
    ctx.strokeStyle = F('#D86A9A'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(-2, -20, 6, -32); ctx.stroke();
    ctx.restore();
    // 腳爪
    for (const x of [-15, 15]) {
      ctx.save(); ctx.translate(x + k.ph * 6 * (x < 0 ? 1 : -1), -2 - Math.max(0, x < 0 ? k.ph : -k.ph) * 3);
      ctx.lineWidth = 2.4;
      for (const d of [-6, 0, 6]) { ctx.beginPath(); ctx.ellipse(d, 0, 3.6, 4.2, 0, 0, Math.PI * 2); paint(ctx, C.gold, 2.4); }
      ctx.restore();
    }
    // 後面那隻翅膀
    ctx.save(); ctx.translate(-38, -46); ctx.rotate(0.25 + Math.sin(t * 2) * 0.05);
    ctx.beginPath(); ctx.moveTo(4, -10); ctx.quadraticCurveTo(-14, -2, -10, 26); ctx.lineTo(-4, 20); ctx.lineTo(0, 28); ctx.lineTo(6, 18); ctx.quadraticCurveTo(12, 4, 4, -10); paint(ctx, C.owlD);
    ctx.restore();
    // 身體
    const R = [0, -44, 43, 41];
    ellipse(ctx, R[0], R[1], R[2], R[3], C.owl, null);
    clipBody(ctx, R[0], R[1], R[2], R[3]);
    // 臉盤
    ctx.fillStyle = F(C.owlL);
    ctx.beginPath(); ctx.ellipse(-2, -55, 17, 17, 0, 0, Math.PI * 2); ctx.ellipse(26, -55, 17, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = F(C.owlD); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-2, -55, 17, 0.9, Math.PI * 1.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(26, -55, 17, -0.75, 2.25); ctx.stroke();
    // 胸甲：深色鱗甲，金邊
    ctx.beginPath(); ctx.moveTo(-50, -34); ctx.quadraticCurveTo(12, -24, 50, -36); ctx.lineTo(50, 4); ctx.lineTo(-50, 4); ctx.closePath();
    ctx.fillStyle = F(C.armor); ctx.fill();
    ctx.strokeStyle = F(C.armorL); ctx.lineWidth = 1.8;
    for (let row = 0; row < 4; row++) for (let i = -5; i <= 5; i++) {
      const x = i * 10 + (row % 2) * 5, y = -22 + row * 8;
      ctx.beginPath(); ctx.arc(x, y, 5, 0.15, Math.PI - 0.15); ctx.stroke();
    }
    ctx.strokeStyle = F(C.trim); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-50, -33); ctx.quadraticCurveTo(12, -23, 50, -35); ctx.stroke();
    // 頭盔：蓋住頭頂，眉心往下一個尖（看起來很兇）
    ctx.beginPath(); ctx.moveTo(-50, -66); ctx.quadraticCurveTo(-10, -72, 8, -66); ctx.lineTo(12, -60); ctx.lineTo(16, -66); ctx.quadraticCurveTo(34, -72, 50, -64); ctx.lineTo(50, -100); ctx.lineTo(-50, -100); ctx.closePath();
    ctx.fillStyle = F(C.armor); ctx.fill();
    ctx.strokeStyle = F(C.trim); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-50, -66); ctx.quadraticCurveTo(-10, -72, 8, -66); ctx.lineTo(12, -60); ctx.lineTo(16, -66); ctx.quadraticCurveTo(34, -72, 50, -64); ctx.stroke();
    ctx.globalAlpha = 0.6; ellipse(ctx, -14, -78, 10, 4, C.armorL, null, -0.3); ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 3; ellipse(ctx, R[0], R[1], R[2], R[3], null, C.line);
    ellipse(ctx, 12, -71, 4, 4, C.crimson, C.line);   // 頭盔上一顆紅寶石
    // 肩甲
    for (const [x, y, s] of [[-38, -30, -1]]) {
      ctx.beginPath(); ctx.ellipse(x, y, 10, 8, s * 0.4, 0, Math.PI * 2); paint(ctx, C.armor);
      ctx.strokeStyle = F(C.trim); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 7, 5, s * 0.4, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    }
    eyes(ctx, k, [-2, 26], -54, C.amber, { size: 1.45, lid: C.armor, brow: false });
    // 嘴喙
    ctx.beginPath(); ctx.moveTo(8, -46); ctx.lineTo(16, -46); ctx.lineTo(12, m === 'fight' ? -36 : -38); ctx.closePath(); paint(ctx, C.gold, 2.4);
    if (m === 'fight') { ctx.beginPath(); ctx.moveTo(9.5, -44); ctx.lineTo(14.5, -44); ctx.lineTo(12, -40); ctx.closePath(); ctx.fillStyle = F(C.mouth); ctx.fill(); }
    ellipse(ctx, -16, -40, 5.5, 3.2, C.blush); ellipse(ctx, 40, -40, 5, 3.2, C.blush);
    // 前面那隻翅膀＝手，提著燈
    const sw = m === 'fight' ? (w < 0 ? w * 0.5 : w * 0.7) : m === 'down' ? 0.9 : Math.sin(t * 2) * 0.1 + (k.walk ? Math.sin(t * 9) * 0.06 : 0);
    ctx.save(); ctx.translate(36, -34); ctx.rotate(-0.35 + sw * 0.5);
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(18, -8, 24, 10); ctx.lineTo(16, 8); ctx.lineTo(16, 16); ctx.lineTo(8, 10); ctx.lineTo(4, 16); ctx.quadraticCurveTo(-6, 6, -4, -8); paint(ctx, C.owlD);
    // 燈桿
    ctx.lineCap = 'round'; ctx.strokeStyle = C.line; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(18, 4); ctx.lineTo(30, -26); ctx.stroke();
    ctx.strokeStyle = F(C.trim); ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(36, -34); ctx.rotate(-0.35 + sw * 0.5); ctx.translate(30, -26); ctx.rotate(0.35 - sw * 0.5 - sw * 0.6 + Math.sin(t * 2.6) * 0.1);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 10); ctx.stroke();
    lantern(ctx, 0, 28, t, k);
    ctx.restore();
    // 前肩甲
    ctx.beginPath(); ctx.ellipse(38, -30, 10, 8, -0.4, 0, Math.PI * 2); paint(ctx, C.armor);
    ctx.strokeStyle = F(C.trim); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(38, -30, 7, 5, -0.4, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  }

  // ───────────── 九幽黑蛟（頭目）─────────────
  function bez(P, u) {
    const v = 1 - u;
    return [0, 1].map((j) => v * v * v * P[0][j] + 3 * v * v * u * P[1][j] + 3 * v * u * u * P[2][j] + u * u * u * P[3][j]);
  }
  function ring(ctx, cx, cy, rx, ry, a0, a1, wid, belly) {   // 盤起來的一圈身體（a0→a1 那一段）
    const path = () => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, a0, a1); };
    ctx.lineCap = 'round';
    path(); ctx.strokeStyle = C.line; ctx.lineWidth = wid + 6; ctx.stroke();
    path(); ctx.strokeStyle = F(C.jiao); ctx.lineWidth = wid; ctx.stroke();
    if (belly) {
      ctx.save(); ctx.translate(0, wid * 0.28);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.max(a0, 0.25), Math.min(a1, Math.PI - 0.25)); ctx.strokeStyle = F(C.jiaoL); ctx.lineWidth = wid * 0.36; ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.translate(0, -wid * 0.22); ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.max(a0, Math.PI + 0.4), Math.min(a1, Math.PI * 2 - 0.4)); ctx.strokeStyle = F('#5E9A9C'); ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  function drawJiao(ctx, k) {
    const t = k.t, m = k.mood, w = k.w, rage = k.rage;
    const e = m === 'down' ? 1 - Math.pow(1 - k.p, 3) : 0;
    const sw = Math.sin(t * 2) * 4, slither = k.walk ? Math.sin(t * (m === 'flee' ? 14 : 8)) : 0;
    // 水渦（後半圈）
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = t * (1.4 + i * 0.3) + i * 2;
      ctx.strokeStyle = `rgba(111,243,255,${0.35 - i * 0.08})`; ctx.lineWidth = 3 - i * 0.6;
      ctx.beginPath(); ctx.ellipse(-2, -14, 56 + i * 8, 16 + i * 3, 0, a0 % (Math.PI * 2), a0 % (Math.PI * 2) + 1.8); ctx.stroke();
    }
    ctx.restore();
    wisps(ctx, t, -40, -10, 4, 1.1, 0.3); wisps(ctx, t, 42, -8, 3, 1, 1.7);
    curl(ctx, t, -60, -8, 34, 1, 1.2);
    // 下圈
    ring(ctx, -4 + slither * 2, -11, 40, 11, Math.PI, Math.PI * 2, 20);
    ring(ctx, -4 + slither * 2, -11, 40, 11, 0, Math.PI, 20, true);
    // 尾巴：從下圈伸出來，尾端一片小鰭
    ctx.save(); ctx.translate(-42 + slither * 2, -8);
    const tw = Math.sin(t * 3) * 5;
    const tailPts = [[0, 0], [-14, 4], [-26, 0 + tw * 0.4], [-34, -8 + tw]];
    for (let i = 0; i < 3; i++) {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tailPts[i][0], tailPts[i][1]); ctx.lineTo(tailPts[i + 1][0], tailPts[i + 1][1]);
      ctx.strokeStyle = C.line; ctx.lineWidth = 13 - i * 3.5 + 6; ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(tailPts[i][0], tailPts[i][1]); ctx.lineTo(tailPts[i + 1][0], tailPts[i + 1][1]);
      ctx.strokeStyle = F(C.jiao); ctx.lineWidth = 13 - i * 3.5; ctx.stroke();
    }
    ctx.translate(-34, -8 + tw);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-8, -16, -2, -22); ctx.quadraticCurveTo(2, -10, 6, -4); ctx.closePath(); paint(ctx, C.fin, 2.2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-14, 0, -18, 8); ctx.quadraticCurveTo(-6, 8, 2, 4); ctx.closePath(); paint(ctx, C.fin, 2.2);
    ctx.restore();
    // 上圈的後半
    const uy = -30 + slither;
    ring(ctx, -2, uy, 30, 9, Math.PI, Math.PI * 2, 18);
    // 脖子：S 形往上，頭在最上面
    const lerp = (a, b) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
    const strike = m === 'fight' ? w : 0;
    let P3 = [6 + strike * (strike < 0 ? 14 : 20) + sw * 0.5, -88 + (strike < 0 ? strike * 8 : strike * 10) + Math.cos(t * 2) * 2];
    if (m === 'flee') P3 = [2 + sw, -84];
    const P = [lerp([24, uy + 2], [24, uy + 2]), lerp([52 + sw * 0.4, -50], [52, -22]), lerp([-16 - sw, -60 + strike * 6], [50, -10]), lerp(P3, [58, -30])];
    const N = 16, pts = [], nor = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = bez(P, u), b = bez(P, Math.min(1, u + 0.01)), c = bez(P, Math.max(0, u - 0.01));
      const tx = b[0] - c[0], ty = b[1] - c[1], l = Math.hypot(tx, ty) || 1;
      pts.push(a); nor.push([-ty / l, tx / l]);
    }
    const W = (i) => 19 - i / N * 4;
    // 背鰭（在脖子後側）
    for (let i = 2; i < N - 1; i += 2) {
      const [x, y] = pts[i], [nx, ny] = nor[i], wd = W(i), dir = [-(pts[i + 1][0] - pts[i - 1][0]), -(pts[i + 1][1] - pts[i - 1][1])];
      const dl = Math.hypot(dir[0], dir[1]) || 1;
      const bx = x - nx * wd * 0.42, by = y - ny * wd * 0.42, h = 9 - i * 0.2;
      ctx.beginPath(); ctx.moveTo(bx + dir[0] / dl * 5, by + dir[1] / dl * 5);
      ctx.lineTo(bx - nx * h + dir[0] / dl * 7, by - ny * h + dir[1] / dl * 7);
      ctx.lineTo(bx - dir[0] / dl * 5, by - dir[1] / dl * 5); ctx.closePath(); paint(ctx, C.fin, 2.2);
    }
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
      ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
      ctx.strokeStyle = pass ? F(C.jiao) : C.line; ctx.lineWidth = W(i) + (pass ? 0 : 6); ctx.stroke();
    }
    // 肚子鱗片（前側）
    ctx.beginPath();
    for (let i = 1; i < N; i++) { const [x, y] = pts[i], [nx, ny] = nor[i], o = W(i) * 0.24; i === 1 ? ctx.moveTo(x + nx * o, y + ny * o) : ctx.lineTo(x + nx * o, y + ny * o); }
    ctx.strokeStyle = F(C.jiaoL); ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = F('#5E9A8C'); ctx.lineWidth = 1.2;
    for (let i = 2; i < N; i++) {
      const [x, y] = pts[i], [nx, ny] = nor[i], o = W(i) * 0.24, tx = ny, ty = -nx;
      ctx.beginPath(); ctx.moveTo(x + nx * (o - 3.5) + tx * 1.5, y + ny * (o - 3.5) + ty * 1.5); ctx.lineTo(x + nx * (o + 3.5) + tx * 1.5, y + ny * (o + 3.5) + ty * 1.5); ctx.stroke();
    }
    // 背上的亮紋
    ctx.beginPath();
    for (let i = 1; i < N - 1; i++) { const [x, y] = pts[i], [nx, ny] = nor[i], o = -W(i) * 0.22; i === 1 ? ctx.moveTo(x + nx * o, y + ny * o) : ctx.lineTo(x + nx * o, y + ny * o); }
    ctx.globalAlpha = 0.5; ctx.strokeStyle = F('#5E9A9C'); ctx.lineWidth = 2.5; ctx.stroke(); ctx.globalAlpha = 1;
    // 上圈的前半（壓住脖子根部）
    ring(ctx, -2, uy, 30, 9, 0, Math.PI, 18, true);
    // 頭
    const hx = pts[N][0], hy = pts[N][1];
    const tilt = m === 'down' ? 0.3 * e : m === 'fight' ? strike * 0.18 : Math.sin(t * 2) * 0.05;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt);
    // 鰓鰭（扇形）
    for (const [dy, s] of [[-2, 1], [6, 0.8]]) {
      ctx.save(); ctx.translate(-14, dy); ctx.rotate(0.1 + Math.sin(t * 4 + dy) * 0.08); ctx.scale(s, s);
      ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(-22, -16); ctx.lineTo(-18, -6); ctx.lineTo(-26, -2); ctx.lineTo(-18, 4); ctx.lineTo(-22, 12); ctx.lineTo(2, 6); ctx.closePath(); paint(ctx, C.fin, 2.4 / s);
      ctx.strokeStyle = F(C.jiaoD); ctx.lineWidth = 1.2 / s;
      for (const y of [-10, -2, 6]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-17, y * 0.9); ctx.stroke(); }
      ctx.restore();
    }
    // 短角
    for (const x of [-6, 8]) {
      ctx.beginPath(); ctx.moveTo(x - 4, -16); ctx.quadraticCurveTo(x - 6, -28, x - 15, -33); ctx.quadraticCurveTo(x - 3, -30, x + 4, -17); ctx.closePath(); paint(ctx, C.horn, 2.4);
      ctx.strokeStyle = F('#9FB7B0'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 4, -22); ctx.lineTo(x + 1, -23); ctx.stroke();
    }
    // 頭＋吻部（先描粗線再填色，接起來像一塊）
    const parts = [[2, -4, 23, 18], [24, 2, 15, 11]];
    ctx.lineWidth = 6; ctx.strokeStyle = C.line;
    for (const [x, y, rx, ry] of parts) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (const [x, y, rx, ry] of parts) ellipse(ctx, x, y, rx, ry, C.jiao, null);
    ctx.save(); ctx.beginPath(); for (const [x, y, rx, ry] of parts) ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    ellipse(ctx, 14, 12, 26, 8, C.jiaoL);
    ctx.globalAlpha = 0.45; ellipse(ctx, -6, -14, 9, 5, '#6FAFAF', null, -0.4); ctx.globalAlpha = 1;
    ctx.restore();
    ctx.fillStyle = C.line; ellipse(ctx, 33, -2, 1.8, 1.4, C.line); ellipse(ctx, 27, -3, 1.6, 1.3, C.line);
    eyes(ctx, k, [0, 18], -7, C.cyan, { size: 1.1, lid: C.jiao });
    mouth(ctx, k, 26, 7, 0.95);
    ellipse(ctx, -12, 4, 5, 3, C.blush);
    ctx.restore();
    // 水渦（前半圈）＋水珠
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const a0 = -t * (1.6 + i * 0.4) + i * 2.4;
      ctx.strokeStyle = `rgba(111,243,255,${0.55 - i * 0.15 + (rage ? 0.2 : 0)})`; ctx.lineWidth = 3.2 - i;
      ctx.beginPath(); ctx.ellipse(-2, -10, 50 + i * 10, 13 + i * 3, 0, 0.3 + Math.sin(a0) * 0.3, 1.6 + Math.sin(a0) * 0.3); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.8 + i / 4) % 1, x = -22 + i * 22 + Math.sin(i * 3) * 6, y = -2 - Math.sin(p * Math.PI) * 30;
      ctx.globalAlpha = 1 - p; ellipse(ctx, x, y, 2.6, 3.2, '#BFF8FF', null); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ───────────── 心魔本尊（頭目）─────────────
  function drawHeart(ctx, k) {
    const t = k.t, m = k.mood, w = k.w, rage = k.rage;
    const e = m === 'down' ? 1 - Math.pow(1 - k.p, 3) : 0;
    const flare = m === 'fight' ? 1.06 + Math.max(0, -w) * 0.22 : 1;
    // 黑色光暈
    glow(ctx, 0, -46, 96, '#2A1038', 0.38 * (1 - e * 0.5));
    glow(ctx, 0, -46, 70, C.kuma, (rage ? 0.22 : 0.12) * (1 - e * 0.6) + Math.sin(t * 3) * 0.03);
    // 狐火：繞著轉，後面的先畫
    const fires = [];
    for (let i = 0; i < 3; i++) {
      const a = t * 1.1 + i * Math.PI * 2 / 3;
      fires.push({ x: Math.cos(a) * 70, y: -40 + Math.sin(a) * 34, z: Math.sin(a), i });
    }
    const fox = (f) => {
      if (e > 0.6) return;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(0.8 + f.z * 0.2, 0.8 + f.z * 0.2);
      glow(ctx, 0, 0, 18, C.crimson, 0.5);
      const fl = Math.sin(t * 12 + f.i) * 2;
      ctx.beginPath(); ctx.moveTo(0, -14 - fl); ctx.quadraticCurveTo(8, -2, 5, 4); ctx.quadraticCurveTo(0, 9, -5, 4); ctx.quadraticCurveTo(-8, -2, 0, -14 - fl);
      ctx.fillStyle = '#B0306A'; ctx.fill(); ctx.strokeStyle = '#3A1030'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = '#FFB0C8'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(3.5, 1, 0, 4); ctx.quadraticCurveTo(-3.5, 1, 0, -5); ctx.fill();
      ctx.restore();
    };
    fires.filter((f) => f.z < 0).forEach(fox);
    // 九條影子尾巴：像屏風一樣張開，尾尖燒成暗紅
    const n = 9, half = (1.5 - e * 0.7) * flare;
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => Math.abs(q - 4) - Math.abs(p - 4));
    for (const i of order) {
      const a = (i / (n - 1) - 0.5) * 2 * half + Math.sin(t * 1.6 + i * 0.9) * 0.07;
      const wv = Math.sin(t * 2.4 + i * 1.3) * 6, len = (i === 4 ? 1.06 : 1) * (1 - e * 0.25);
      ctx.save(); ctx.translate(0, -30); ctx.rotate(a); ctx.scale(len * 0.72, len * 0.8);
      ctx.beginPath(); ctx.moveTo(-8, -16);
      ctx.bezierCurveTo(-24, -40 + wv * 0.3, -16 + wv * 0.5, -70, 2 + wv, -88);
      ctx.bezierCurveTo(4 + wv * 0.6, -80, 10 + wv * 0.4, -78, 12 + wv * 0.3, -74);
      ctx.bezierCurveTo(22, -50, 22, -34, 8, -16); ctx.closePath();
      const g = ctx.createLinearGradient(0, -16, 0, -88);
      g.addColorStop(0, F(C.heart)); g.addColorStop(0.55, F(C.heartM)); g.addColorStop(0.82, F('#6A2A5A')); g.addColorStop(1, F('#D8365A'));
      ctx.fillStyle = g; ctx.shadowColor = 'rgba(150,80,230,0.8)'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = C.line; ctx.lineWidth = 2.6 / len; ctx.stroke();
      ctx.strokeStyle = 'rgba(190,140,255,0.55)'; ctx.lineWidth = 1.3 / len;
      ctx.beginPath(); ctx.moveTo(-2, -24); ctx.bezierCurveTo(-10, -44, -6 + wv * 0.4, -64, 2 + wv, -80); ctx.stroke();
      // 尾尖斷開飄走的一小團
      const p = (t * 0.7 + i * 0.37) % 1;
      ctx.globalAlpha = (1 - p) * 0.7; ctx.fillStyle = '#4A2A5E';
      ctx.beginPath(); ctx.arc(2 + wv + Math.sin(p * 6) * 4, -92 - p * 18, 4 * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
    }
    // 下半身散成煙（沒有腳）
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.6 + i / 4) % 1, x = -20 + i * 13 + Math.sin(t * 2 + i) * 3;
      ctx.globalAlpha = (1 - p) * 0.8 * (1 - e * 0.5);
      ellipse(ctx, x, -4 + p * 14, 9 * (1 - p * 0.6), 7 * (1 - p * 0.6), '#2E2440', null);
      ctx.globalAlpha = 1;
    }
    // 耳朵（跟狐仙一樣高高尖尖，耳裡是暗紅）
    for (const s of [-1, 1]) {
      const twitch = Math.sin(t * 2.6 + s) * 0.03 + (m === 'down' ? -s * 0.15 : 0);
      ctx.save(); ctx.translate(s * 20 + 2, -58); ctx.rotate(twitch); ctx.translate(-(s * 20 + 2), 58);
      ctx.beginPath(); ctx.moveTo(s * 34 + 2, -44); ctx.lineTo(s * 30 + 2, -86); ctx.lineTo(s * 8 + 2, -58); ctx.closePath(); paint(ctx, C.heart);
      ctx.beginPath(); ctx.moveTo(s * 28 + 2, -52); ctx.lineTo(s * 28 + 2, -74); ctx.lineTo(s * 15 + 2, -58); ctx.closePath(); ctx.fillStyle = F('#8E1F3A'); ctx.fill();
      ctx.restore();
      wisps(ctx, t, s * 30 + 2, -86, 2, 0.5, s + 2);
    }
    // 身體
    ellipse(ctx, 0, -34, 40, 32, C.heart, null);
    clipBody(ctx, 0, -34, 40, 32);
    ellipse(ctx, 6, -22, 26, 14, C.heartM);   // 跟狐仙一樣的白下巴，這裡是影子色
    ctx.strokeStyle = 'rgba(170,120,240,0.4)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(0, -34, 36.5, 28.5, 0, Math.PI * 0.85, Math.PI * 1.3); ctx.stroke();   // 背光的紫邊
    ctx.restore();
    ctx.lineWidth = 3; ellipse(ctx, 0, -34, 40, 32, null, C.line);
    // 脖子上一圈煙毛
    // 能面：白色半臉面具，蓋到鼻子
    ctx.save();
    ctx.translate(13, -46); ctx.rotate(m === 'down' ? 0.18 * e : Math.sin(t * 1.2) * 0.02); ctx.translate(-13, 46);
    const maskPath = () => {
      ctx.beginPath(); ctx.moveTo(-17, -40);
      ctx.bezierCurveTo(-18, -62, 44, -66, 43, -42);
      ctx.quadraticCurveTo(42, -35, 30, -35); ctx.quadraticCurveTo(22, -35, 17, -28); ctx.quadraticCurveTo(12, -35, 4, -35); ctx.quadraticCurveTo(-16, -34, -17, -40); ctx.closePath();
    };
    maskPath(); ctx.fillStyle = F(C.noh); ctx.fill();
    ctx.save(); maskPath(); ctx.clip();
    ellipse(ctx, 13, -34, 30, 6, C.nohD);
    ctx.restore();
    maskPath(); ctx.strokeStyle = C.line; ctx.lineWidth = 2.6; ctx.stroke();
    // 殿上眉：額頭上兩團淡墨
    ctx.globalAlpha = 0.8; ellipse(ctx, 0, -57, 4.5, 2.4, '#3A2E3A', null, -0.2); ellipse(ctx, 26, -57.5, 4.5, 2.4, '#3A2E3A', null, 0.2); ctx.globalAlpha = 1;
    // 紅色隈取
    ctx.strokeStyle = F(C.kuma); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const [x, s] of [[-1, -1], [25, 1]]) {
      ctx.beginPath(); ctx.moveTo(x - s * -6, -40); ctx.quadraticCurveTo(x + s * 10, -42, x + s * 12, -52); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * 7, -38); ctx.quadraticCurveTo(x + s * 14, -40, x + s * 15, -46); ctx.stroke();
    }
    ctx.fillStyle = F(C.kuma);   // 眉心倒過來的火焰印
    ctx.beginPath(); ctx.moveTo(12, -52); ctx.quadraticCurveTo(15.5, -57, 12, -61); ctx.quadraticCurveTo(8.5, -57, 12, -52); ctx.fill();
    // 眼洞＋紅眼
    if (m === 'down') {
      eyes(ctx, k, [-1, 25], -45, C.crimson, { brow: false });
    } else {
      for (const [x, s] of [[-1, -1], [25, 1]]) {
        ctx.beginPath(); ctx.moveTo(x - 7, -44 + s * 0); ctx.quadraticCurveTo(x, -51 + (m === 'fight' ? 2 : 0), x + 7, -46); ctx.quadraticCurveTo(x, -40, x - 7, -44); ctx.closePath();
        ctx.fillStyle = '#1A0E1E'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1.6; ctx.stroke();
        glow(ctx, x, -45, m === 'fight' ? 16 : 12, C.crimson, m === 'fight' ? 0.8 : 0.6);
        const blink = m !== 'fight' && (t % 4.3) < 0.1;
        if (!blink) {
          ellipse(ctx, x + 1, -45, 3.2, m === 'fight' ? 3.6 : 3, C.crimson, null);
          ellipse(ctx, x + 1, -45, 1.1, 2.4, '#3A0010', null);
          ellipse(ctx, x + 2.4, -46.6, 1, 1, '#FFFFFF', null);
        }
      }
    }
    if (m === 'down') {   // 面具裂開
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(30, -60); ctx.lineTo(27, -54); ctx.lineTo(31, -50); ctx.lineTo(28, -44); ctx.stroke();
    }
    ctx.restore();
    // 下半臉：細細的笑
    if (m === 'fight') mouth(ctx, k, 13, -22, 1, { col: C.line });
    else if (m === 'down' || m === 'flee') mouth(ctx, k, 13, -22, 0.9);
    else {
      ctx.save(); ctx.strokeStyle = '#E46A8A'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(2, -26); ctx.quadraticCurveTo(13, -18, 26, -27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(3, -25.5); ctx.moveTo(28, -29); ctx.lineTo(25, -26.5); ctx.stroke();
      ctx.restore();
    }
    ellipse(ctx, -17, -26, 6, 3.4, '#7A2E55'); ellipse(ctx, 37, -26, 5, 3.2, '#7A2E55');
    fires.filter((f) => f.z >= 0 && Math.abs(f.x) > 44).forEach(fox);
  }

  const SPEC = {
    wolf: { name: '黑風狼', boss: false, draw: drawWolf, head: [12, -66], fall: 0.55, lie: 0 },
    rat: { name: '偷吃鼠', boss: false, draw: drawRat, head: [6, -74], fall: 0.55, lie: 0 },
    crow: { name: '烏鴉精', boss: false, draw: drawCrow, head: [4, -80], fall: 0.55, lie: 0, hop: true },
    monkey: { name: '山魈猴', boss: false, draw: drawMonkey, head: [6, -76], fall: 0.55, lie: 0 },
    owl: { name: '燈影魔梟', boss: true, draw: drawOwl, head: [8, -94], fall: 0.36, lie: 0 },
    jiao: { name: '九幽黑蛟', boss: true, draw: drawJiao, head: [58, -52], fall: 0, lie: 0, serpent: true },
    heart: { name: '心魔本尊', boss: true, draw: drawHeart, head: [8, -84], fall: 0.4, lie: 0, float: true },
  };

  function drawVillain(ctx, type, o) {
    const sp = SPEC[type] || SPEC.wolf;
    o = o || {};
    const t = o.t || 0, st = o.st || 0, dir = o.dir < 0 ? -1 : 1, state = o.state || 'come';
    const mood = state === 'come' ? 'sly' : state;
    const walk = state === 'come' || state === 'flee' || state === 'steal';
    const spd = state === 'flee' ? 15 : state === 'steal' ? 6 : 9;
    let ph = walk ? Math.sin(t * spd) : 0;
    let lift = 0, rot = 0, sx = 1, sy = 1, dx = 0, w = 0, p = 0, fallE = 0;
    if (walk) {
      lift = Math.abs(ph) * (state === 'flee' ? 6 : state === 'steal' ? 2 : 4);
      rot = state === 'flee' ? 0.14 : state === 'steal' ? 0.1 : 0.04;
      if (state === 'steal') { sy = 0.93; sx = 1.05; }
    }
    if (state === 'fight') {
      const c = (st % 1.8) / 1.8;   // 蓄力往後仰 → 往前撲 → 回來
      w = c < 0.55 ? -c / 0.55 : c < 0.68 ? -1 + (c - 0.55) / 0.13 * 2.2 : 1.2 * (1 - (c - 0.68) / 0.32);
      rot = w * 0.1 + Math.sin(t * 2.6) * 0.03;
      dx = Math.max(0, w) * 6;
      sy = 1 + Math.sin(t * 3.2) * 0.02 - Math.max(0, -w) * 0.05; sx = 1 + Math.max(0, -w) * 0.04;
    }
    if (sp.hop && walk) { const hp = Math.sin(t * spd * 0.55); lift = Math.max(0, hp) * 14; ph = 0; sy = hp > 0 ? 1.04 : 1 + hp * 0.06; sx = 2 - sy; }
    if (sp.float) { lift = 16 + Math.sin(t * 1.8) * 4; ph = 0; }
    if (sp.serpent) { lift = 0; ph = 0; rot = state === 'flee' ? 0.05 : state === 'fight' ? w * 0.03 : 0; sx = walk ? 1 + Math.sin(t * spd) * 0.02 : sx; }
    if (state === 'down') {
      p = Math.min(1, st / 0.45); fallE = 1 - Math.pow(1 - p, 3);
      rot = -sp.fall * fallE; ph = 0;
      if (st < 0.14) { sy = 0.82; sx = 1.16; }
      else { sy = 0.86 + Math.sin(t * 2) * 0.012; sx = 1.1; }
      if (sp.float) lift = 16 * (1 - fallE) + 2;
    }
    flash = o.hurt ? 0.72 : 0;
    if (o.hurt) dx += Math.sin(t * 70) * 2.5;
    const rage = !!(sp.boss && o.max && o.hp != null && o.hp / o.max < 0.34);

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 影子
    const shw = (sp.boss ? 46 : 36) * (sp.serpent ? 1.3 : 1);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath();
    ctx.ellipse(dir * (-sp.lie * 1.2 * fallE), 0, Math.max(14, shw - lift * 0.6 + fallE * 14), 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(dir, 1);
    ctx.translate(dx, -lift);
    if (state === 'down') {
      ctx.translate(0, -sp.lie * fallE);
      ctx.translate(-14, 0); ctx.rotate(rot); ctx.translate(14, 0);
      ctx.scale(sx, sy);
    } else {
      ctx.scale(sx, sy);
      ctx.translate(0, -24); ctx.rotate(rot); ctx.translate(0, 24);
    }
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
    const k = { t, st, ph, mood, state, w, p, walk, lift, rage, hp: o.hp, max: o.max };
    sp.draw(ctx, k);

    // 逃跑：汗珠＋速度線
    if (state === 'flee') {
      ctx.save();
      ctx.fillStyle = '#9FD8FF'; ctx.strokeStyle = C.line; ctx.lineWidth = 1.6;
      const hx = sp.head[0] - 30, hy = sp.head[1] + 14, b = Math.sin(t * 10) * 1.5;
      ctx.beginPath(); ctx.moveTo(hx, hy - 7 + b); ctx.quadraticCurveTo(hx + 5, hy + b, hx, hy + 4 + b); ctx.quadraticCurveTo(hx - 5, hy + b, hx, hy - 7 + b); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(74,58,42,0.45)'; ctx.lineWidth = 2.4;
      for (let i = 0; i < 3; i++) {
        const q = (t * 3 + i / 3) % 1;
        ctx.globalAlpha = 1 - q;
        ctx.beginPath(); ctx.moveTo(-58 - q * 26, -24 - i * 16); ctx.lineTo(-74 - q * 26, -24 - i * 16); ctx.stroke();
      }
      ctx.restore();
    }
    // 倒地：頭上繞圈的星星
    if (state === 'down' && st > 0.25) {
      ctx.save(); ctx.translate(sp.head[0], sp.head[1]); ctx.rotate(-rot);
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + i * Math.PI * 2 / 3;
        star(ctx, Math.cos(a) * 20, -6 + Math.sin(a) * 6, 5 + Math.sin(a) * 1.2, a);
      }
      ctx.restore();
    }
    ctx.restore();
    flash = 0;
  }

  root.drawVillain = drawVillain;
  root.VILLAIN_INFO = Object.fromEntries(Object.entries(SPEC).map(([k, v]) => [k, { name: v.name, boss: v.boss }]));
})(typeof window !== 'undefined' ? window : globalThis);
