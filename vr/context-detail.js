// 周邊建築細節：公有市場、透天厝街屋、國小校舍與校園、衛生所——把灰色量體打扮成南台灣小鎮街景
import * as THREE from './vendor/three.module.min.js';

export function build(ctx) {
  const { V, box, mat, tex, layer, line } = ctx;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","WenQuanYi Zen Hei",sans-serif';
  const g = layer('ctxDetail');
  const HP = Math.PI / 2;
  const hr = (k, s = 0) => { const v = Math.sin(k * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };   // 決定性亂數
  const pick = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];

  // ---------- 程序貼圖 ----------
  const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
  const ct = (c, rx = 1, ry = 1) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  const ribC = cv(16, 256, (x, w, h) => { for (let k = 0; k < 32; k++) { const gr = x.createLinearGradient(0, k * 8, 0, k * 8 + 8); gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#c8c8c8'); gr.addColorStop(1, '#8a8a8a'); x.fillStyle = gr; x.fillRect(0, k * 8, w, 8); } });
  const winC = cv(128, 128, (x, w, h) => {                       // 鋁窗：框＋中梃＋玻璃漸層
    x.fillStyle = '#7d8790'; x.fillRect(0, 0, w, h);
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fbccb'); gr.addColorStop(1, '#3d5363');
    x.fillStyle = gr; x.fillRect(8, 8, w - 16, h - 16); x.fillStyle = '#7d8790'; x.fillRect(w / 2 - 3, 0, 6, h); x.fillRect(0, h * 0.62, w, 5);
  });
  const STRIPE = ['#efe6d0', '#7f9a7a', '#efe6d0', '#b5654a'];
  const stripeC = vert => cv(64, 64, (x, w, h) => { for (let k = 0; k < 12; k++) { x.fillStyle = STRIPE[k % 4]; vert ? x.fillRect(k * w / 12, 0, w / 12 + 1, h) : x.fillRect(0, k * h / 12, w, h / 12 + 1); } });

  // ---------- 材質 ----------
  const M = {
    tint: tex(mat(0xffffff), 'noise'),                          // 各戶外牆、陽台、女兒牆（逐個實例上色）
    steel: mat(0x5d646b, 1, { roughness: 0.5, metalness: 0.3 }), pipe: mat(0x9aa0a6),
    stain: mat(0xd9dde0, 1, { roughness: 0.25, metalness: 0.45 }), white: mat(0xf2f2ee),
    dark: mat(0x23262a), wood: tex(mat(0x9a6b45), 'wood'), ac: mat(0xe8e9e7),
    glass: mat(0x24364a, 1, { roughness: 0.15, metalness: 0.3 }),
    win: mat(0xffffff, 1, { map: ct(winC), roughness: 0.35 }),
    rib: mat(0xffffff, 1, { map: ct(ribC), roughness: 0.55, metalness: 0.15 }),
    stU: mat(0xffffff, 1, { map: ct(stripeC(true)), roughness: 0.9, side: THREE.DoubleSide }),
    stV: mat(0xffffff, 1, { map: ct(stripeC(false)), roughness: 0.9, side: THREE.DoubleSide }),
    green: mat(0x1f9d55, 1, { emissive: 0x1f9d55, emissiveIntensity: 0.5 }),
    bark: mat(0x7a5c45), rim: mat(0xd35400), leaf: tex(mat(0x5e9455), 'grass'),
  };
  const WALL = ['#e8e2d4', '#ddd5c3', '#e6d8c6', '#d3dbd5', '#e9ddd0', '#d9d2c8', '#efe9df', '#d8cdbb'];
  const TILE = ['#c9b79c', '#9fb3b8', '#c7a99a', '#b8b8ae', '#d6c7a8'];
  const AWN = ['#3d7a8a', '#8a3d3d', '#4c7a4c', '#c08a2e', '#6b7a8a', '#9ab4c4'];
  const SHUT = ['#8d949b', '#7d8a96', '#9aa29a', '#a3a7ab', '#b0aa9a'];
  const SHED = ['#5f86a6', '#7f9aa8', '#6e8c6a', '#a8a39a'];
  const PROD = ['#c0392b', '#e67e22', '#5d9c3b', '#e5c33a', '#7d4b8c', '#3f7d3a', '#d35400'];
  const CRATE = ['#2f6fb0', '#c43c3c', '#3f8f4f', '#e0b020'];

  // ---------- 實例化收集：同幾何＋材質的方塊合成一個 InstancedMesh ----------
  const GEO = { b: new THREE.BoxGeometry(1, 1, 1), c: new THREE.CylinderGeometry(0.5, 0.5, 1, 14), s: new THREE.IcosahedronGeometry(0.5, 1) };
  const BK = new Map();
  const put = (gk, mk, x, y, h, sx, sy, sz, c, rx = 0, rz = 0) => { const k = gk + ':' + mk; if (!BK.has(k)) BK.set(k, []); BK.get(k).push([x, y, h, sx, sy, sz, c, rx, rz]); };
  const bx = (mk, x0, x1, y0, y1, z0, z1, c, rx, rz) => put('b', mk, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), Math.abs(y1 - y0), c, rx, rz);
  // 立面座標：s 沿立面、d 向外（負值＝往屋內/屋頂上）、z 高；ang>0 外緣上揚
  const fx = (f, s, d) => (f.ax === 'x' ? [f.at + f.dir * d, s] : [s, f.at + f.dir * d]);
  const fb = (f, mk, s0, s1, d0, d1, z0, z1, c, ang = 0) => {
    const [xa, ya] = fx(f, s0, d0), [xb, yb] = fx(f, s1, d1);
    bx(mk, Math.min(xa, xb), Math.max(xa, xb), Math.min(ya, yb), Math.max(ya, yb), z0, z1, c, f.ax === 'y' ? f.dir * ang : 0, f.ax === 'x' ? f.dir * ang : 0);
  };
  const ryOut = f => (f.ax === 'x' ? f.dir * HP : f.dir > 0 ? Math.PI : 0);   // 平面朝外
  const ryAlong = f => (f.ax === 'x' ? [0, Math.PI] : [HP, -HP]);               // 平面沿立面兩向
  const pp = (x0, x1, y0, y1, h, c, ht = 1, t = 0.2) => {       // 女兒牆＋屋頂色
    bx('tint', x0, x1, y0, y0 + t, h, h + ht, c); bx('tint', x0, x1, y1 - t, y1, h, h + ht, c);
    bx('tint', x0, x0 + t, y0 + t, y1 - t, h, h + ht, c); bx('tint', x1 - t, x1, y0 + t, y1 - t, h, h + ht, c);
  };
  const roof = (x0, x1, y0, y1, h, c) => bx('tint', x0 + 0.2, x1 - 0.2, y0 + 0.2, y1 - 0.2, h, h + 0.05, c);

  // ---------- 招牌（CanvasTexture；正面不鏡像） ----------
  const textMat = (txt, W, H, bg, fg, vert = false) => {
    const c = cv(W, H, (x) => {
      x.fillStyle = bg; x.fillRect(0, 0, W, H); x.strokeStyle = fg; x.lineWidth = Math.min(W, H) * 0.05; x.strokeRect(x.lineWidth, x.lineWidth, W - 2 * x.lineWidth, H - 2 * x.lineWidth);
      x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; const ch = [...txt];
      if (vert) { const fs = Math.min(W * 0.66, H * 0.84 / ch.length); x.font = `900 ${fs}px ${FONT}`; ch.forEach((s, k) => x.fillText(s, W / 2, H / 2 + (k - (ch.length - 1) / 2) * fs * 1.04)); }
      else { let fs = H * 0.62; x.font = `900 ${fs}px ${FONT}`; const mw = x.measureText(txt).width; if (mw > W * 0.88) fs *= W * 0.88 / mw; x.font = `900 ${fs}px ${FONT}`; x.fillText(txt, W / 2, H / 2 + fs * 0.04); }
    });
    const t = ct(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return mat(0xffffff, 1, { map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, roughness: 0.6 });
  };
  const plane = (m, w, h, x, y, z, ry) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.copy(V(x, y, z)); o.rotation.y = ry; o.receiveShadow = true; g.add(o); return o; };
  const SIGNS = ['早餐', '機車行', '雜貨', '理髮', '五金', '小吃', '水電行', '洗衣', '冰品', '文具', '麵店', '藥房'];
  const SIGNBG = ['#b8322a', '#1f5f9e', '#c9930f', '#2e7d4f', '#6b3fa0', '#d0532a'];
  let sid = 0;

  // ---------- 1 透天厝街屋：分戶壁柱、捲門、懸挑陽台、雨遮、冷氣、直立招牌、屋頂水塔 ----------
  function terrace(f, s0, s1, n, H, key, deep, tight) {   // tight：立面貼齊道路，地面不外擺貨架
    const w = (s1 - s0) / n;
    for (let k = 0; k <= n; k++) {
      const a = s0 + k * w;
      fb(f, 'tint', Math.max(s0, a - 0.18), Math.min(s1, a + 0.18), 0, 0.22, 0, H + 1.25, '#d6d0c4');     // 分戶壁柱
      if (k < n) fb(f, 'pipe', a + 0.24, a + 0.34, 0.03, 0.14, 0, H + 1);                                // 落水管
    }
    for (let k = 0; k < n; k++) {
      const a = s0 + k * w, b = a + w, m = (a + b) / 2, r = q => hr(key * 50 + k, q);
      fb(f, 'tint', a + 0.18, b - 0.18, 0, 0.04, 0, H, pick(WALL, r(1)));                                // 外牆磁磚
      if (r(2) < 0.3) {                                                                                   // 營業中：店面內部＋貨架
        fb(f, 'dark', a + 0.45, b - 0.45, 0, 0.06, 0, 2.9);
        if (!tight) fb(f, 'tint', a + 0.7, b - 0.7, 0.06, 0.5, 0, 0.9, pick(TILE, r(12)));
      } else fb(f, 'rib', a + 0.45, b - 0.45, 0.04, 0.1, 0, 2.85, pick(SHUT, r(3)));                   // 鐵捲門
      fb(f, 'steel', a + 0.4, b - 0.4, 0, 0.3, 2.85, 3.15);                                             // 捲門箱
      for (const z of [3.5, 7]) {
        fb(f, 'tint', a + 0.2, b - 0.2, 0, 1.1, z - 0.18, z, '#cfcac0');                                 // 陽台板
        fb(f, 'win', m - 1.15, m + 1.15, 0, 0.06, z + 0.1, z + 2.45);                                     // 落地窗
        if (r(z) < 0.65) fb(f, 'tint', m - 1.35, m + 1.35, 0, 0.7, z + 2.62, z + 2.67, pick(AWN, r(z + 1)), -0.3);   // 雨遮
        if (r(z + 2) < 0.45) fb(f, 'tint', a + 0.2, b - 0.2, 0.98, 1.1, z, z + 0.95, pick(TILE, r(z + 3)));         // 實心欄杆
        else for (let s = a + 0.32; s < b - 0.25; s += 0.15) fb(f, 'steel', s - 0.015, s + 0.015, 1.03, 1.06, z, z + 1);
        fb(f, 'steel', a + 0.2, b - 0.2, 0.98, 1.1, z + 0.98, z + 1.05);
        fb(f, 'steel', a + 0.2, a + 0.25, 0, 1.1, z + 0.98, z + 1.05); fb(f, 'steel', b - 0.25, b - 0.2, 0, 1.1, z + 0.98, z + 1.05);
        if (r(z + 4) < 0.55) {                                                                            // 冷氣室外機掛在欄杆外
          fb(f, 'ac', b - 1.3, b - 0.5, 1.12, 1.42, z + 0.2, z + 0.75); fb(f, 'dark', b - 1.12, b - 0.68, 1.42, 1.44, z + 0.28, z + 0.67);
          fb(f, 'steel', b - 1.26, b - 1.22, 1.06, 1.46, z + 0.15, z + 0.2); fb(f, 'steel', b - 0.58, b - 0.54, 1.06, 1.46, z + 0.15, z + 0.2);
        }
      }
      // 屋頂：樓梯間＋水塔、太陽能熱水器、鐵皮棚
      fb(f, 'tint', a + 0.3, a + 2.9, -7, -3.8, H, H + 2.7, pick(WALL, r(6)));
      fb(f, 'dark', a + 1.1, a + 2.0, -3.8, -3.76, H, H + 2.1);
      if (r(7) < 0.8) {
        const [x, y] = fx(f, a + 1.6, -5.4);
        for (const [dx, dy] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) bx('steel', x + dx - 0.04, x + dx + 0.04, y + dy - 0.04, y + dy + 0.04, H + 2.7, H + 3.25);
        put('c', 'stain', x, y, H + 3.95, 1.1, 1.4, 1.1);
      }
      if (r(8) < 0.45) {
        const [x, y] = fx(f, a + w * 0.66, -2.3);
        put('b', 'glass', x, y, H + 0.85, 1.9, 0.06, 1.1, undefined, 0.55);
        put('c', 'white', x, y + 0.5, H + 1.4, 0.42, 1.9, 0.42, undefined, 0, HP);
        bx('steel', x - 0.9, x + 0.9, y + 0.4, y + 0.5, H, H + 1.2);
      }
      if (deep && r(9) < 0.4) {
        for (const s of [a + 0.45, b - 0.45]) for (const d of [-9, -14]) fb(f, 'steel', s - 0.05, s + 0.05, d - 0.05, d + 0.05, H, H + 2.4);
        fb(f, 'rib', a + 0.25, b - 0.25, -14.4, -8.6, H + 2.4, H + 2.46, pick(SHED, r(10)), 0.07);
      }
      if (k > 0 && r(11) < 0.5) {                                                                         // 直立招牌（掛在分戶壁柱上）
        const bg = pick(SIGNBG, r(13)), sm = textMat(SIGNS[sid++ % SIGNS.length], 128, 440, bg, '#fff', true);
        fb(f, 'tint', a - 0.05, a + 0.05, 0.28, 1.12, 3.95, 6.65, bg); fb(f, 'steel', a - 0.03, a + 0.03, 0.12, 0.28, 4.3, 6.3);
        ryAlong(f).forEach((ry, j) => { const [x, y] = fx(f, a + (j ? -0.056 : 0.056) * (f.ax === 'x' ? -1 : 1), 0.7); plane(sm, 0.76, 2.62, x, y, 5.3, ry); });
      }
    }
  }
  // 住宅 A（面 12M 路）、住宅 B（面 10M 路）、住宅 C（南面 10M 路、西面朝衛生所巷道）
  terrace({ ax: 'x', at: -14, dir: 1 }, 33, 62, 6, 10.5, 1, true);
  terrace({ ax: 'y', at: -13, dir: 1 }, -44, -16, 6, 10.5, 2, true);
  terrace({ ax: 'y', at: 0, dir: -1 }, 91, 112, 4, 10.5, 3, false, true);
  terrace({ ax: 'x', at: 91, dir: -1 }, 9.5, 44, 7, 10.5, 4, true);
  {
    const CW = { ax: 'x', at: 91, dir: -1 };                                                          // 住宅 C 西南角側牆：車庫捲門＋側窗
    fb(CW, 'rib', 2, 8, 0.04, 0.1, 0, 2.85, '#9aa29a'); fb(CW, 'steel', 1.9, 8.1, 0, 0.3, 2.85, 3.15);
    for (const z of [3.5, 7]) for (const s of [2, 5.6]) { fb(CW, 'win', s, s + 1.9, 0, 0.06, z + 0.9, z + 2.4); fb(CW, 'tint', s - 0.15, s + 2.05, 0, 0.6, z + 2.55, z + 2.6, '#6b7a8a', -0.3); }
    fb(CW, 'ac', 4.15, 4.95, 0.05, 0.35, 5.0, 5.55); fb(CW, 'steel', 4.2, 4.9, 0, 0.35, 4.92, 4.97);
  }
  for (const [x0, x1, y0, y1, c] of [[-44, -14, 33, 62, '#b9b2a4'], [-44, -16, -42, -13, '#aeb3ad'], [91, 112, 0, 44, '#b7ad9f']]) { roof(x0, x1, y0, y1, 10.5, c); pp(x0, x1, y0, y1, 10.5, '#dcd6ca'); }

  // ---------- 2 公有零售市場：條紋遮陽棚、攤位、捲門、招牌、山形鐵皮屋頂＋高側窗 ----------
  {
    const ME = { ax: 'x', at: -14, dir: 1 }, MS = { ax: 'y', at: 1, dir: -1 }, MW = { ax: 'x', at: -44, dir: -1 };
    const units = [[ME, [[1, 4.67], [4.67, 8.33], [8.33, 12], [12, 17, 'gate'], [17, 20.67], [20.67, 24.33], [24.33, 28]], 2.0, 'stV'],
      [MS, [...Array(8)].map((_, k) => [-44 + k * 3.75, -40.25 + k * 3.75]), 1.8, 'stU']];
    let u = 0;
    for (const [f, list, D, stm] of units) {
      fb(f, 'tint', f === ME ? 1 : -44, f === ME ? 28 : -14, 0, 0.03, 3.4, 7.9, '#e2d9c6');             // 二樓外牆
      for (const [a, b, kind] of list) {
        const r = q => hr(90 + u, q); u++;
        fb(f, stm, a + 0.01, b - 0.01, 0, D, 3.24, 3.29, pick(['#ffffff', '#f2ece6', '#e8efe8'], r(1)), -0.2);   // 帆布棚
        fb(f, 'stU', a, b, D - 0.04, D - 0.01, 2.78, 3.08 - 0.02);                                     // 垂邊
        fb(f, 'steel', b - 0.03, b + 0.03, 0.8 - 0.88, 0.8 + 0.88, 2.78, 2.83, undefined, 0.44);      // 斜撐
        fb(f, 'tint', b - 0.15, b + 0.15, 0, 0.25, 0, 7.9, '#cfc9bd');                                  // 壁柱
        if (kind === 'gate') { fb(f, 'dark', a + 0.3, b - 0.3, 0, 0.05, 0, 3.0); continue; }            // 主入口
        if (r(2) < 0.3) { fb(f, 'rib', a + 0.2, b - 0.2, 0.03, 0.09, 0, 2.9, pick(SHUT, r(3))); fb(f, 'steel', a + 0.15, b - 0.15, 0, 0.28, 2.9, 3.18); continue; }
        fb(f, 'dark', a + 0.15, b - 0.15, 0, 0.05, 0, 3.0);                                              // 攤位內部
        fb(f, 'tint', a + 0.3, b - 0.3, 0.05, 0.85, 0, 0.75, pick(['#9fb4c2', '#c9c5bb', '#b9c9b4'], r(4)));
        fb(f, 'wood', a + 0.25, b - 0.25, 0.03, 0.88, 0.75, 0.8);
        for (let s = a + 0.4, j = 0; s + 0.5 < b - 0.3; s += 0.58, j++) {                                 // 菜籃＋蔬果
          fb(f, 'tint', s, s + 0.5, 0.15, 0.75, 0.8, 0.98, pick(CRATE, r(5 + j)));
          const [x, y] = fx(f, s + 0.25, 0.45); put('s', 'tint', x, y, 1.02, 0.46, 0.2, 0.46, pick(PROD, r(20 + j)));
        }
      }
      const [w0, w1, skip] = f === ME ? [1.6, 26, [8.5, 20.5]] : [-43.4, -15, [0, 0]];
      for (let s = w0; s + 2.4 <= w1 + 0.1; s += 3.6) if (s + 2.4 < skip[0] || s > skip[1]) fb(f, 'win', s, s + 2.4, 0.03, 0.08, 4.6, 6.6);
      fb(f, 'tint', f === ME ? 1 : -44, f === ME ? 28 : -13.7, 0, 0.3, 7.9, 9.3, '#d8cfbd');              // 正面女兒牆
    }
    // 主入口招牌
    fb(ME, 'tint', 9.3, 19.7, 0, 0.12, 3.85, 5.75, '#7a1c1c');
    { const [x, y] = fx(ME, 14.5, 0.13); plane(textMat('公有零售市場', 1200, 210, '#8c1d1d', '#fff3d6'), 10.2, 1.78, x, y, 4.8, ryOut(ME)); }
    // 山形鐵皮屋頂＋屋脊高側窗（剖面沿東西向擠出）
    const prof = new THREE.Shape([[1, 7.9], [28, 7.9], [28, 8.25], [15.6, 9.45], [15.6, 10.25], [13.4, 10.25], [13.4, 9.45], [1, 8.25]].map(([a, b]) => new THREE.Vector2(a, b)));
    const rt = ct(ribC, 1, 5 / 32), rm = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 30, bevelEnabled: false }).rotateY(HP), mat(0x8f9aa0, 1, { map: rt, roughness: 0.5, metalness: 0.2 }));
    rm.position.copy(V(-44, 0, 0)); rm.castShadow = rm.receiveShadow = true; g.add(rm);
    bx('tint', -44.3, -13.7, 13.1, 15.9, 10.25, 10.4, '#7d8a90');
    for (let x = -43.6; x < -14.5; x += 3) { bx('win', x, x + 2.6, 15.6, 15.66, 9.5, 10.2); bx('win', x, x + 2.6, 13.34, 13.4, 9.5, 10.2); }
    for (const x of [-40, -33, -25, -18]) { put('c', 'stain', x, 14.5, 10.65, 0.55, 0.5, 0.55); put('s', 'stain', x, 14.5, 10.95, 0.62, 0.42, 0.62); }
    for (const x of [-38, -29, -20]) for (const y of [6, 23]) { const z = 8.25 + (y < 14 ? y - 1 : 28 - y) * 1.2 / 12.4; put('c', 'stain', x, y, z + 0.3, 0.5, 0.7, 0.5); }
    // 西側卸貨口
    fb(MW, 'rib', 6, 10.5, 0.03, 0.09, 0, 3.6, '#8d949b'); fb(MW, 'steel', 5.7, 10.8, 0, 0.3, 3.6, 3.9);
    fb(MW, 'tint', 5.5, 11, 0, 2.2, 4.0, 4.15, '#c9ccc9'); fb(MW, 'tint', 5.8, 10.7, 0, 1.6, 0, 0.9, '#b8b4aa');
    for (const s of [5.7, 10.8]) fb(MW, 'steel', s - 0.05, s + 0.05, 2.05, 2.15, 0, 4.0);
  }

  // ---------- 3 國小：北面走廊（柱列、樓板、欄杆）、教室門窗、兩端樓梯間 ----------
  {
    const SN = { ax: 'y', at: -18, dir: 1 }, H = 10.5;
    fb(SN, 'tint', 3, 57, 0, 2.6, 0, 0.15, '#bdb8ad');
    for (const z of [3.5, 7, H]) fb(SN, 'tint', 3, 57, 0, 2.6, z - 0.25, z, '#ece8de');
    for (const z of [3.5, 7]) {
      fb(SN, 'tint', 3, 57, 2.42, 2.6, z, z + 0.9, '#f1ede3'); fb(SN, 'tint', 3, 57, 2.6, 2.62, z + 0.5, z + 0.7, '#3f7fa8');
      fb(SN, 'steel', 3, 57, 2.45, 2.57, z + 1.12, z + 1.18);
      for (let s = 4.5; s < 57; s += 1.5) fb(SN, 'steel', s - 0.02, s + 0.02, 2.49, 2.53, z + 0.9, z + 1.12);
    }
    fb(SN, 'tint', 3, 57, 2.42, 2.6, H, H + 0.9, '#f1ede3');
    for (let s = 3; s <= 57.01; s += 4.5) fb(SN, 'tint', Math.max(3, s - 0.22), Math.min(57, s + 0.22), 2.0, 2.45, 0, H, '#e3ddcf');   // 走廊柱
    for (const z of [0, 3.5, 7]) for (let c = 0; c < 6; c++) {
      const a = 3 + 9 * c;
      for (const d0 of [0.6, 7.5]) fb(SN, 'wood', a + d0, a + d0 + 0.9, 0, 0.06, z + 0.15, z + 2.25);
      fb(SN, 'win', a + 1.9, a + 4.4, 0, 0.05, z + 1.0, z + 2.7); fb(SN, 'win', a + 4.6, a + 7.1, 0, 0.05, z + 1.0, z + 2.7);
      fb(SN, 'win', a + 0.6, a + 1.5, 0, 0.05, z + 2.4, z + 3.0); fb(SN, 'win', a + 7.5, a + 8.4, 0, 0.05, z + 2.4, z + 3.0);
    }
    for (const [x0, x1] of [[0.6, 3], [57, 59.4]]) {                                                   // 樓梯間
      bx('tint', x0, x1, -31, -21, 0, 13, '#e6dfcf'); bx('tint', x0 - 0.1, x1 + 0.1, -31.1, -20.9, 13, 13.3, '#c9c2b0');
      for (const z of [1.8, 5.3, 8.8]) bx('win', x0 + 0.5, x1 - 0.5, -21, -20.94, z, z + 1.6);
    }
    roof(3, 57, -34, -18, H, '#c7bfa9'); pp(3, 57, -34, -18, H, '#efe9dc', 0.9);
    put('c', 'stain', 30, -28, H + 1.4, 2.2, 2.0, 2.2); bx('tint', 28.6, 31.4, -29.4, -26.6, H, H + 0.4, '#bdb8ad');
    // 校園圍牆＋欄杆、校門（門柱、伸縮門、校名）
    const brick = tex(mat(0xb9745a), 'brick');
    g.add(box(60, 62.4, -11.7, -11.3, 0, 1.2, brick, false), box(69.6, 125, -11.7, -11.3, 0, 1.2, brick, false));
    for (const [a, b] of [[60, 62.4], [69.6, 125]]) {
      bx('tint', a, b, -11.75, -11.25, 1.2, 1.28, '#d9d4c8'); bx('steel', a, b, -11.53, -11.47, 1.95, 2.0);
      for (let x = a + 0.1; x < b; x += 0.2) bx('steel', x - 0.012, x + 0.012, -11.51, -11.49, 1.28, 1.95);
    }
    g.add(box(61.8, 62.6, -11.9, -11.1, 0, 2.5, brick, false), box(69.4, 70.2, -11.9, -11.1, 0, 2.5, brick, false));
    bx('tint', 61.7, 62.7, -12, -11, 2.5, 2.62, '#d9d4c8'); bx('tint', 69.3, 70.3, -12, -11, 2.5, 2.62, '#d9d4c8');
    bx('steel', 62.6, 65.8, -11.6, -11.4, 1.45, 1.55); bx('steel', 62.6, 65.8, -11.6, -11.4, 0.1, 0.2);
    for (let x = 62.75; x < 65.8; x += 0.35) bx('steel', x - 0.03, x + 0.03, -11.55, -11.45, 0.1, 1.55);
    for (let x = 62.8; x < 65.8; x += 0.7) put('c', 'dark', x, -11.5, 0.06, 0.12, 0.12, 0.12);
    plane(textMat('○○國小', 120, 440, '#f3efe4', '#1d2a3a', true), 0.6, 2.1, 69.8, -11.08, 1.3, Math.PI);
    // 操場：跑道、草坪、旗台、籃球場、沿牆行道樹
    const stad = (L, R) => { const s = new THREE.Shape(); s.moveTo(-L / 2, -R); s.lineTo(L / 2, -R); s.absarc(L / 2, 0, R, -HP, HP, false); s.lineTo(-L / 2, R); s.absarc(-L / 2, 0, R, HP, 3 * HP, false); return s; };
    const flatS = (s, h, m) => { const o = new THREE.Mesh(new THREE.ShapeGeometry(s, 24).rotateX(-HP), m); o.position.copy(V(98, -40, h)); o.receiveShadow = true; g.add(o); };
    const ring = stad(18, 14); ring.holes.push(stad(18, 10.5));
    flatS(ring, 0.03, tex(mat(0xb5583f), 'noise')); flatS(stad(18, 10.5), 0.035, tex(mat(0x86b366), 'grass'));
    for (const R of [11.7, 12.85]) g.add(line(stad(18, R).getPoints(24).map(p => V(98 + p.x, -40 + p.y, 0.06)), 0xffffff, false, 0.85));
    bx('tint', 95.5, 100.5, -22.5, -19.5, 0, 0.45, '#cfc9bb');
    for (const x of [96.8, 98, 99.2]) { put('c', 'stain', x, -21, 0.45 + 4.5, 0.1, 9, 0.1); put('s', 'stain', x, -21, 9.5, 0.16, 0.16, 0.16); }
    g.add(box(61.5, 73.5, -50, -26, 0, 0.03, tex(mat(0x4f7f9f), 'noise'), false, false));
    const cl = (pts) => g.add(line(pts.map(([x, y]) => V(x, y, 0.05)), 0xffffff, false, 0.9));
    cl([[62, -49.5], [73, -49.5], [73, -26.5], [62, -26.5], [62, -49.5]]); cl([[62, -38], [73, -38]]);
    cl([...Array(25)].map((_, k) => [67.5 + 1.8 * Math.cos(k * Math.PI / 12), -38 + 1.8 * Math.sin(k * Math.PI / 12)]));
    for (const [y, s] of [[-50.4, 1], [-25.6, -1]]) {
      bx('steel', 67.4, 67.6, y - 0.1, y + 0.1, 0, 3.4); bx('steel', 67.45, 67.55, y, y + s * 0.9, 3.25, 3.35);
      bx('white', 66.6, 68.4, y + s * 0.9, y + s * 0.95, 2.9, 3.95);
      const o = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(HP), M.rim); o.position.copy(V(67.5, y + s * 1.18, 3.05)); g.add(o);
    }
    for (let k = 0; k < 6; k++) { const x = 76 + k * 9; put('c', 'bark', x, -14, 1.5, 0.32, 3, 0.32); put('s', 'leaf', x, -14, 4.3, 4.2, 3.4, 4.2); put('s', 'leaf', x + 0.8, -13.8, 5.4, 2.6, 2.2, 2.6); }
  }

  // ---------- 4 衛生所：入口雨庇＋無障礙坡道、綠十字、遮陽鰭板窗帶、屋頂設備、救護車停車棚 ----------
  {
    const H = 10.5, WF = '#f3f1ea';
    const band = (f, s0, s1) => {
      const n = Math.floor((s1 - s0) / 1.6), w = (s1 - s0) / n;
      for (const z of [3.5, 7]) fb(f, 'tint', s0, s1, 0, 0.35, z - 0.2, z, WF);
      for (let k = 0; k < n; k++) {
        const s = s0 + k * w;
        if (k) fb(f, 'tint', s - 0.06, s + 0.06, 0, 0.7, 0.4, H - 0.2, WF);
        for (const z of [0, 3.5, 7]) fb(f, 'win', s + 0.18, s + w - 0.18, 0, 0.05, z + 0.9, z + 2.7);
      }
    };
    band({ ax: 'x', at: 68, dir: -1 }, 5.6, 17); band({ ax: 'x', at: 68, dir: -1 }, 25.3, 41.8);
    const HL = { ax: 'x', at: 73, dir: -1 };
    for (const z of [3.5, 7]) for (let s = 17.6; s < 24.5; s += 1.8) fb(HL, 'win', s, s + 1.3, 0, 0.05, z + 0.9, z + 2.7);
    fb(HL, 'glass', 19.6, 22.9, 0, 0.05, 0.45, 2.9); fb(HL, 'steel', 21.2, 21.3, 0.05, 0.08, 0.45, 2.9);
    bx('tint', 70, 73, 19, 23.5, 0, 0.45, '#cfcac0');                                                 // 入口平台
    for (let k = 0; k < 3; k++) bx('tint', 69.2 + k * 0.27, 70, 19.8, 22.7, k * 0.15, k * 0.15 + 0.15, '#cfcac0');
    bx('tint', 70, 73, 19, 23.5, 3.2, 3.4, WF); bx('tint', 69.9, 70.05, 19, 23.5, 3.05, 3.55, '#2f8f5b');
    for (const y of [19.12, 23.38]) bx('steel', 70.08, 70.2, y - 0.06, y + 0.06, 0.45, 3.2);
    bx('tint', 67.5, 72.9, 23.6, 24.9, 0.08, 0.22, '#c4bfb4', 0, 0.083);                                // 坡道 1:12
    for (const y of [23.66, 24.84]) {
      bx('steel', 67.5, 72.9, y - 0.03, y + 0.03, 1.02, 1.07, undefined, 0, 0.083);
      for (let x = 67.7; x < 72.9; x += 1.3) { const h = (x - 67.5) / 5.4 * 0.45; bx('steel', x - 0.03, x + 0.03, y - 0.03, y + 0.03, h, h + 0.86 + 0.0); }
    }
    plane(textMat('衛生所', 600, 170, '#ffffff', '#1f6b45'), 3.6, 1.02, 72.93, 21.25, 4.5, -HP);
    bx('green', 72.86, 72.95, 21.0, 21.5, 5.6, 7.6); bx('green', 72.86, 72.95, 20.25, 22.25, 6.35, 6.85);
    for (const [x0, x1, y0, y1] of [[68, 86, 25.3, 41.8], [73, 81, 17, 25.3], [68, 86, 5.6, 17]]) { roof(x0, x1, y0, y1, H, '#bccbc0'); pp(x0, x1, y0, y1, H, '#e9ece6'); }
    for (const x0 of [74, 78.5]) {                                                                      // 冰水主機
      bx('stain', x0, x0 + 3.5, 9, 12, H, H + 1.7);
      for (const dx of [0.9, 2.6]) put('c', 'dark', x0 + dx, 10.5, H + 1.74, 1.2, 0.08, 1.2);
    }
    bx('tint', 75.6, 78.4, 32.6, 35.4, H, H + 0.6, '#bdb8ad'); put('c', 'stain', 77, 34, H + 1.9, 2.4, 2.6, 2.4);
    bx('tint', 81, 88.4, 18, 24.3, 3.8, 4.05, '#e8ebe8'); bx('tint', 88.3, 88.45, 18, 24.3, 3.55, 4.05, '#c0392b');   // 救護車停車棚
    for (const y of [18.2, 24.1]) bx('steel', 88.1, 88.25, y - 0.075, y + 0.075, 0, 3.8);
    bx('glass', 80.95, 81, 19.2, 23, 0, 2.6);
  }

  // ---------- 合成 InstancedMesh ----------
  {
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (const [k, list] of BK) {
      const [gk, mk] = k.split(':'), o = new THREE.InstancedMesh(GEO[gk], M[mk], list.length), tinted = list.some(e => e[6] !== undefined);
      list.forEach(([x, y, h, sx, sy, sz, c, rx, rz], i) => {
        d.position.copy(V(x, y, h)); d.rotation.set(rx, 0, rz); d.scale.set(sx, sy, sz); d.updateMatrix(); o.setMatrixAt(i, d.matrix);
        if (tinted) o.setColorAt(i, col.set(c ?? 0xffffff));
      });
      o.castShadow = gk !== 's' || mk === 'leaf'; o.receiveShadow = true; g.add(o);
    }
  }
  return function apply(i, t) {};   // 靜態佈景，無逐格動畫
}
