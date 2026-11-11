// 街道基礎設施（兩版本共用）：對側人行道與緣石、路口標線、號誌、電桿與架空線、公車亭、機車停車、標誌、公有停車場整備、排水與街道小物
import * as THREE from 'three';

export function build(ctx) {
  const { V, box, mat, tex, layer } = ctx;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","WenQuanYi Zen Hei",sans-serif';
  const g = layer('street');
  const HP = Math.PI / 2, W = 0.15;                              // W：人行道面高
  const mesh = (geo, m, sh = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = sh; o.receiveShadow = true; return o; };
  const put = (o, x, y, h = 0, ry = 0) => { o.position.copy(V(x, y, h)); o.rotation.y = ry; g.add(o); return o; };   // ry：本地 +x 指向的方位角（東＝0、北＝π/2）
  const part = (grp, geo, m, x, y, z, sh = true) => { const o = mesh(geo, m, sh); o.position.set(x, y, z); grp.add(o); return o; };
  const inst = (geo, m, list, sh = false, cols) => {             // [x, y, h, ry, sx, sy, sz]
    const o = new THREE.InstancedMesh(geo, m, list.length), d = new THREE.Object3D(), c = new THREE.Color();
    list.forEach(([x, y, h, ry = 0, sx = 1, sy = 1, sz = 1], k) => {
      d.position.copy(V(x, y, h)); d.rotation.set(0, ry, 0); d.scale.set(sx, sy, sz); d.updateMatrix(); o.setMatrixAt(k, d.matrix);
      if (cols) o.setColorAt(k, c.setHex(cols[k % cols.length]));
    });
    o.castShadow = sh; o.receiveShadow = true; g.add(o); return o;
  };
  const canvasMat = (w, h, draw, extra = {}) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return mat(0xffffff, 1, { map: t, ...extra });
  };
  const txt = (x, s, px, y, w, col = '#fff', wt = 900) => { x.fillStyle = col; x.font = `${wt} ${px}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, w / 2, y); };
  const nrm = ry => [Math.sin(ry), -Math.cos(ry)];               // 平面正面（本地 +z）在基地座標的朝向
  const B1 = new THREE.BoxGeometry(1, 1, 1);

  // ---------- 材質 ----------
  const paver = tex(mat(0xcbc4b6), 'paver'), kerbM = tex(mat(0xd6d8da), 'noise'), concrete = tex(mat(0xcfcbc2), 'noise');
  const poleM = tex(mat(0xb9b6ae), 'noise'), metal = mat(0x596067, 1, { roughness: 0.45, metalness: 0.5 }), galv = mat(0x9aa1a6, 1, { roughness: 0.4, metalness: 0.6 });
  const dark = mat(0x2b2e33), rubber = mat(0x1f2124, 1, { roughness: 0.8 }), iron = mat(0x3a3c3f, 1, { roughness: 0.6, metalness: 0.4 });
  const paint = c => mat(c, 1, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const white = paint(0xf2f2ee), tactile = paint(0xe2b53a);
  const hedgeM = tex(mat(0x4f8a4a), 'grass'), grassM = tex(mat(0x6f9c55), 'grass'), wood = tex(mat(0xa8774a), 'wood');
  const glass = mat(0x9fbccb, 0.4, { roughness: 0.1 }), tinted = mat(0x54707e, 1, { roughness: 0.15, metalness: 0.2 });
  const lampM = mat(0xfff6dc, 1, { emissive: 0xffe9b8, emissiveIntensity: 1.2 });

  // ---------- 1 對側人行道（2 m 鋪面＋路緣；行人穿越處降緣斜坡） ----------
  const walk = (x0, x1, y0, y1, side) => {                       // side：臨車道的一側
    g.add(box(x0, x1, y0, y1, 0, W, paver, false, false));
    const k = { E: [x1 - 0.15, x1, y0, y1], W: [x0, x0 + 0.15, y0, y1], N: [x0, x1, y1 - 0.15, y1], S: [x0, x1, y0, y0 + 0.15] }[side];
    g.add(box(...k, 0, W + 0.02, kerbM, false, false));
  };
  const pad = (x0, x1, y0, y1, h = 0.03) => g.add(box(x0, x1, y0, y1, 0, h, paver, false, false));
  walk(-14, -12, 1, 25, 'E'); walk(-14, -12, 34, 95, 'E');       // 12M 路西側：市場、北側住宅（市場巷口 y 28–33 留開口）
  walk(-60, -12, 0, 1, 'S'); g.add(box(-12.15, -12, 0.15, 1, 0, W + 0.02, kerbM, false, false));
  pad(-14, -12, 26, 33);                                          // 斑馬線＋巷口：齊平
  walk(-60, -23.6, -12, -10, 'N');                                // 10M 路南側：西南住宅前
  walk(-12, 41, -12, -10, 'N'); walk(47, 60, -12, -10, 'N'); walk(69, 125, -12, -10, 'N');   // 國小前
  pad(42, 46, -12, -10); pad(61, 69, -12, -10, 0.02);             // 斑馬線降緣、校門口 6 m 齊平
  pad(50, 68, 0, 2, 0.02); walk(68, 91, 0, 2, 'S'); walk(112, 125, 0, 2, 'S');   // 10M 路北側：衛生所前庭齊平
  g.add(box(42.1, 45.9, -10.55, -10.15, 0, 0.04, tactile, false, false), box(-12.55, -12.15, 26.1, 27.9, 0, 0.04, tactile, false, false), box(61.1, 62.9, -10.55, -10.15, 0, 0.03, tactile, false, false));
  {
    const wG = B1.clone().translate(0, 0.5, 0), p = wG.attributes.position;   // 楔形：本地 −x 端低、+x 端高
    for (let k = 0; k < p.count; k++) if (p.getY(k) > 0.5 && p.getX(k) < 0) p.setY(k, 0.2);
    wG.computeVertexNormals();
    inst(wG, paver, [[-13, 25.5, 0, -HP, 1, W, 2], [-13, 33.5, 0, HP, 1, W, 2], [41.5, -11, 0, Math.PI, 1, W, 2], [46.5, -11, 0, 0, 1, W, 2], [60.5, -11, 0, Math.PI, 1, W, 2]]);
  }

  // ---------- 2 道路標線：路面邊線、停止線、指向箭頭（避開斑馬線、分向線、通學區鋪面） ----------
  const PG = new THREE.PlaneGeometry(1, 1).rotateX(-HP), lines = [], arrows = [];
  const cut = (a, b, skip) => skip.reduce((out, [s, e]) => out.flatMap(([p, q]) => (e <= p || s >= q ? [[p, q]] : [[p, s], [e, q]].filter(([u, v]) => v - u > 0.3))), [[a, b]]);
  const runY = (x, a, b, skip = []) => cut(a, b, skip).forEach(([p, q]) => lines.push([x, (p + q) / 2, 0.035, 0, 0.15, 1, q - p]));
  const runX = (y, a, b, skip = []) => cut(a, b, skip).forEach(([p, q]) => lines.push([(p + q) / 2, y, 0.035, 0, q - p, 1, 0.15]));
  runY(-11.65, 0, 95, [[25.5, 30.5]]); runY(-0.35, 0, 95, [[25.5, 30.5], [45, 51], [57.5, 64.5]]);
  const SK = [[41.5, 46.5], [52, 72]];
  runX(-0.35, -60, -12); runX(-0.35, 0, 125, SK); runX(-9.65, -60, -22); runX(-9.65, -11.5, 125, SK);
  const L = Math.hypot(28, 38), d = [-28 / L, -38 / L], nI = [-d[1], d[0]];   // 西南斜向路：d 往西南、nI 由東緣指向路內
  const HB = (x, y) => x > -44.6 && x < -15.4 && y > -42.6 && y < -12.4;     // 西南住宅範圍內不畫
  for (const [ax, ay, sgn] of [[-12, -10, 1], [-22, -10, -1]])
    for (let s = 2; s < L - 1; s += 2) {
      const x = ax + d[0] * s + nI[0] * 0.35 * sgn, y = ay + d[1] * s + nI[1] * 0.35 * sgn;
      if (!HB(x, y)) lines.push([x, y, 0.035, Math.atan2(d[1], d[0]), 1.9, 1, 0.15]);
    }
  lines.push([-8.95, 2.2, 0.04, 0, 5.5, 1, 0.4], [2.2, -2.6, 0.04, 0, 0.4, 1, 4.4], [-25, -7.4, 0.04, 0, 0.4, 1, 4.4]);   // 停止線：離路口約 2 m
  const DS = (s, o) => [-12 + d[0] * s + nI[0] * o, -10 + d[1] * s + nI[1] * o];
  lines.push([...DS(6, 2.1), 0.04, Math.atan2(nI[1], nI[0]), 3.8, 1, 0.4]);
  arrows.push([-9, 8, 0.04, -HP], [8, -2.6, 0.04, Math.PI], [-31, -7.4, 0.04, 0], [...DS(12, 2), 0.04, Math.atan2(-d[1], -d[0])]);
  arrows.push(...[[18, 61.5, 0], [38, 61.5, 0], [44, 79.5, Math.PI], [24, 79.5, Math.PI]].map(([x, y, r]) => [x, y, 0.04, r, 0.8, 1, 0.8]));   // 停車場車道
  inst(PG, white, lines);
  {
    const s = new THREE.Shape(); [[-2.5, -0.15], [0.9, -0.15], [0.9, -0.6], [2.5, 0], [0.9, 0.6], [0.9, 0.15], [-2.5, 0.15]].forEach(([x, y], k) => (k ? s.lineTo(x, y) : s.moveTo(x, y)));
    inst(new THREE.ShapeGeometry(s).rotateX(-HP), white, arrows);
  }

  // ---------- 3 路口號誌（懸臂式，橫式三燈；西南斜路一支閃黃） ----------
  const sigM = mat(0x3c4146, 1, { roughness: 0.5 }), blinkM = mat(0xffb020, 1, { emissive: 0xffa000, emissiveIntensity: 1.6 });
  const LAMP = { r: mat(0xff3b30, 1, { emissive: 0xff2a1a, emissiveIntensity: 1.6 }), g: mat(0x30d158, 1, { emissive: 0x10c060, emissiveIntensity: 1.6 }) };
  const OFF = [mat(0x4a2522), mat(0x4a3a1c), mat(0x1f3a2a)];
  const sPole = new THREE.CylinderGeometry(0.1, 0.14, 6, 10).translate(0, 3, 0), headG = new THREE.BoxGeometry(1.2, 0.42, 0.28), backG = new THREE.BoxGeometry(1.5, 0.62, 0.03), lensG = new THREE.CircleGeometry(0.13, 16);
  const signal = (px, py, ux, uy, Lr, fx, fy, st) => {
    put(mesh(sPole, metal), px, py, W);
    put(mesh(B1, metal), px + ux * Lr / 2, py + uy * Lr / 2, W + 5.7, Math.atan2(uy, ux)).scale.set(Lr, 0.12, 0.12);
    const h = new THREE.Group(); part(h, headG, sigM, 0, 0, 0); part(h, backG, dark, 0, 0, -0.16, false); part(h, B1, metal, 0, 0.32, 0, false).scale.set(0.05, 0.25, 0.05);
    [st === 'r' ? LAMP.r : OFF[0], st === 'b' ? blinkM : OFF[1], st === 'g' ? LAMP.g : OFF[2]].forEach((m, k) => part(h, lensG, m, (k - 1) * 0.38, 0, 0.141, false));
    put(h, px + ux * (Lr - 0.4), py + uy * (Lr - 0.4), W + 5.3, Math.atan2(fx, -fy));
  };
  signal(-13, 0.6, 1, 0, 5.6, 0, 1, 'g');                         // 南下（12M 路）
  signal(-1, -11.2, 0, 1, 9, 1, 0, 'r');                          // 西行（10M 路東段）
  signal(-24, -11.2, 0, 1, 4, -1, 0, 'r');                        // 東行（10M 路西段）
  signal(-11.6, -11.4, nI[0], nI[1], 3.4, d[0], d[1], 'b');       // 西南斜路：閃黃
  {                                                               // 路名牌（雙面）
    const plate = (name, en) => canvasMat(512, 140, (x, w, h) => { x.fillStyle = '#1d4f91'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16); txt(x, name, 70, 60, w); txt(x, en, 26, 112, w, '#fff', 600); });
    const pz = plate('中山路', 'Zhongshan Rd.'), pe = plate('中正路', 'Zhongzheng Rd.'), pg = new THREE.PlaneGeometry(1.2, 0.33);
    for (const [px, py] of [[-13, 0.6], [-1, -11.2]]) {
      for (const ry of [HP, -HP]) { const [nx] = nrm(ry); put(mesh(pg, pz, false), px + nx * 0.02, py + 0.75, W + 4.4, ry); }   // 南北向路名：面東西
      for (const ry of [0, Math.PI]) { const [, ny] = nrm(ry); put(mesh(pg, pe, false), px + 0.75, py + ny * 0.02, W + 4.0, ry); }
    }
  }

  // ---------- 4 電線桿（9 m 水泥桿、橫擔、每三支一具變壓器）與架空線 ----------
  const UP = [[-12.8, 4, -HP], [-12.8, 25, -HP], [-12.8, 47, -HP], [-12.8, 70, -HP], [-12.8, 92, -HP], [3, -10.8, 0], [30, -10.8, 0], [59.5, -10.8, 0], [88, -10.8, 0], [115, -10.8, 0]];   // ry：本地 +z 指向背離車道
  const ATT = [[8.68, -0.85], [8.68, 0.85], [9.22, 0]];
  const at = ([x, y, r], h, z) => { const [sx, sy] = nrm(r); return [x + sx * z, y + sy * z, W + h]; };
  {
    const T = UP.map(([x, y, r]) => [x, y, W, r]), ins = [];
    UP.forEach(p => ATT.forEach(([h, z]) => ins.push([...at(p, h - 0.14, z), 0])));
    inst(new THREE.CylinderGeometry(0.11, 0.18, 9, 8).translate(0, 4.5, 0), poleM, T, true);
    inst(new THREE.BoxGeometry(0.12, 0.12, 2).translate(0, 8.5, 0), poleM, T, true);
    inst(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 6).translate(0, 0.08, 0), mat(0xe8e4dc), ins);
    inst(new THREE.CylinderGeometry(0.27, 0.27, 1.05, 10).translate(0, 6.4, 0.45), galv, T.filter((_, k) => k % 3 === 0), true);
  }
  const wp = [];
  const wire = (a, b, sag) => {
    let q = V(...a);
    for (let k = 1; k <= 8; k++) { const t = k / 8, n = V(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 4 * sag * t * (1 - t)); wp.push(q, n); q = n; }
  };
  const span = (p, q) => ATT.forEach(([h, z]) => wire(at(p, h, z), at(q, h, z), 0.45));
  for (let k = 0; k < UP.length - 1; k++) if (k !== 4) span(UP[k], UP[k + 1]);
  span(UP[0], UP[5]);                                             // 跨路口
  for (const [k, b] of [[0, [-14, 6.5, 6]], [1, [-14, 22, 6]], [2, [-14, 46, 8]], [3, [-14, 60, 8]], [5, [6, -18, 7]], [6, [30, -18, 7]], [8, [93, 0, 7]], [9, [110, 0, 7]]])
    wire(at(UP[k], 7.6, 0), b, 0.25);                             // 進屋線
  {
    const wm = new THREE.LineBasicMaterial({ color: 0x24272b, transparent: true, opacity: 1 }); wm.userData.o = 1;
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp), wm));
  }

  // ---------- 5 公車亭（10M 路北側，衛生所前；住宅臨路無人行道故移到 x 75–80） ----------
  {
    for (const x of [75.2, 77.5, 79.8]) g.add(box(x - 0.05, x + 0.05, 1.8, 1.9, W, W + 2.55, metal, false));
    g.add(box(74.8, 80.2, 0.25, 2.0, W + 2.55, W + 2.68, galv, false));
    g.add(box(75.25, 79.75, 1.82, 1.86, W + 0.35, W + 2.3, glass, false, false), box(75.18, 75.22, 1.0, 1.8, W + 0.35, W + 2.3, glass, false, false));
    g.add(box(76, 79, 1.3, 1.75, W + 0.42, W + 0.48, wood, false), box(76.2, 76.3, 1.4, 1.65, W, W + 0.42, metal, false), box(78.7, 78.8, 1.4, 1.65, W, W + 0.42, metal, false));
    const fas = canvasMat(512, 32, (x, w, h) => { x.fillStyle = '#2f6e3b'; x.fillRect(0, 0, w, h); txt(x, '公車站  衛生所', 24, h / 2 + 1, w); });
    put(mesh(new THREE.PlaneGeometry(5.4, 0.13), fas, false), 77.5, 0.24, W + 2.615, 0);
    put(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 8).translate(0, 1.45, 0), metal), 81, 0.6, W);
    const bs = canvasMat(256, 256, (x, w) => { x.fillStyle = '#2f6e3b'; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, 7); x.fill(); txt(x, '公車', 74, 108, w); txt(x, 'BUS', 40, 178, w, '#fff', 700); });
    for (const ry of [0, Math.PI]) { const [, ny] = nrm(ry); put(mesh(new THREE.CircleGeometry(0.3, 24), bs, false), 81, 0.6 + ny * 0.05, W + 2.65, ry); }
    g.add(box(80.82, 81.18, 0.52, 0.56, W + 1.3, W + 2.1, mat(0xf4f4f0), false));   // 時刻表
  }

  // ---------- 6 機車（低多邊形，多台共用 InstancedMesh）：市場騎樓前一排、校門口西側一排 ----------
  {
    const sc = [], sx = -13.15;
    for (let k = 0; k < 12; k++) sc.push([sx, 12.2 + k * 0.9, W, 0]);   // 避開 B 版 y 9–11 的三台
    for (let k = 0; k < 8; k++) sc.push([48 + k * 1.1, -11.05, W, HP - 0.45]);
    const body = mat(0xffffff, 1, { roughness: 0.4, metalness: 0.2 }), cols = [0xf1f1ee, 0x2f4a6b, 0x7b2d2d, 0x9aa3ab, 0x3c4650, 0xd9c7a0, 0x5d7f5a];
    const P = (sx_, sy_, sz_, x, y) => new THREE.BoxGeometry(sx_, sy_, sz_).translate(x, y, 0);
    inst(P(1.25, 0.3, 0.4, -0.05, 0.42), body, sc, true, cols); inst(P(0.16, 0.7, 0.38, 0.52, 0.76), body, sc, true, cols); inst(P(0.7, 0.26, 0.36, -0.32, 0.68), body, sc, false, cols);
    inst(P(0.64, 0.1, 0.3, -0.25, 0.86), dark, sc); inst(P(0.08, 0.06, 0.64, 0.5, 1.13), metal, sc);
    const wh = x => new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10).rotateX(HP).translate(x, 0.22, 0);
    inst(wh(0.62), rubber, sc); inst(wh(-0.62), rubber, sc);
  }

  // ---------- 7 標誌：速限 30、當心兒童、停車場 P ----------
  {
    const postG = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8).translate(0, 1.3, 0);
    const sign = (x, y, ry, geo, m, h) => {                       // 正面朝向迎面車流，背面灰板
      put(mesh(postG, metal), x, y, W); const [nx, ny] = nrm(ry);
      put(mesh(geo, m, false), x + nx * 0.06, y + ny * 0.06, h, ry); put(mesh(geo, galv, false), x + nx * 0.05, y + ny * 0.05, h, ry + Math.PI);
    };
    const spd = canvasMat(256, 256, (x, w) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, 7); x.fill(); x.strokeStyle = '#d0201a'; x.lineWidth = 30; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 18, 0, 7); x.stroke(); txt(x, '30', 112, w / 2 + 6, w, '#111', 800); });
    const disc = new THREE.CircleGeometry(0.33, 28);
    sign(32, -11.5, -HP, disc, spd, W + 2.25); sign(89.5, 1.3, HP, disc, spd, W + 2.25);
    const warn = canvasMat(256, 256, (x, w) => {
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(w / 2, 4); x.lineTo(w * 0.93, w * 0.75 - 2); x.lineTo(w * 0.07, w * 0.75 - 2); x.closePath(); x.fill();
      x.strokeStyle = '#d0201a'; x.lineWidth = 18; x.lineJoin = 'round'; x.beginPath(); x.moveTo(w / 2, 20); x.lineTo(w * 0.87, w * 0.72); x.lineTo(w * 0.13, w * 0.72); x.closePath(); x.stroke();
      x.fillStyle = '#111'; for (const [cx, s] of [[108, 1], [150, 0.85]]) { x.beginPath(); x.arc(cx, 92 + (1 - s) * 30, 11 * s, 0, 7); x.fill(); x.fillRect(cx - 10 * s, 106 + (1 - s) * 30, 20 * s, 34 * s); x.fillRect(cx - 9 * s, 138 + (1 - s) * 22, 7 * s, 26 * s); x.fillRect(cx + 2 * s, 138 + (1 - s) * 22, 7 * s, 26 * s); }
    });
    sign(38, -11.5, -HP, new THREE.CircleGeometry(0.5, 3, HP), warn, W + 2.3);
    put(mesh(new THREE.PlaneGeometry(0.6, 0.22), canvasMat(256, 96, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.strokeStyle = '#111'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); txt(x, '當心兒童', 54, h / 2 + 2, w, '#111'); }), false), 37.94, -11.5, W + 1.72, -HP);
    const pk = canvasMat(256, 256, (x, w) => { x.fillStyle = '#1d5fb3'; x.fillRect(0, 0, w, w); x.strokeStyle = '#fff'; x.lineWidth = 10; x.strokeRect(12, 12, w - 24, w - 24); txt(x, 'P', 190, w / 2 + 12, w, '#fff', 800); });
    sign(0.5, 65, -HP, new THREE.PlaneGeometry(0.7, 0.7), pk, W + 2.3);
  }

  // ---------- 8 公有停車場：周邊綠籬、植栽島與遮蔭樹、輪擋、收費亭與柵欄機、高桿燈 ----------
  {
    const hedge = (x0, x1, y0, y1) => g.add(box(x0, x1, y0, y1, 0, 0.25, kerbM, false, false), box(x0 + 0.12, x1 - 0.12, y0 + 0.12, y1 - 0.12, 0.25, 1.1, hedgeM, false));
    hedge(0, 1, 53, 58); hedge(0, 1, 64, 90); hedge(1, 61, 89, 90); hedge(61, 62, 53, 89);   // 西側 y 58–64 為出入口
    const island = (x0, x1, y0, y1) => g.add(box(x0, x1, y0, y1, 0, 0.18, kerbM, false, false), box(x0 + 0.12, x1 - 0.12, y0 + 0.12, y1 - 0.12, 0.18, 0.2, grassM, false, false));
    island(1.3, 3.7, 65.3, 75.7); island(58.9, 60.8, 65.3, 75.7); island(1.3, 3.7, 83.3, 87.7); island(58.9, 60.8, 83.3, 87.7);
    const TR = [[2.5, 67.5], [2.5, 73.5], [59.85, 67.5], [59.85, 73.5], [2.5, 85.5], [59.85, 85.5]].map(([x, y], k) => [x, y, 0.2, k * 1.3]);
    inst(new THREE.CylinderGeometry(0.15, 0.22, 2.8, 6).translate(0, 1.4, 0), mat(0x8d6e63), TR, true);
    inst(new THREE.IcosahedronGeometry(1.8, 1).translate(0, 4.1, 0), mat(0x6fae72), TR, true);
    inst(new THREE.IcosahedronGeometry(1.15, 1).translate(1.1, 3.5, 0.6), mat(0x7cb87f), TR, true);
    const ws = [];                                                 // 輪擋只放在格位頂端
    for (let k = 0; k < 21; k++) for (const y of [53.5, 69.5, 71.5, 87.5]) ws.push([4 + 2.6 * k + 1.3, y, 0.01]);
    inst(new THREE.BoxGeometry(1.6, 0.12, 0.16).translate(0, 0.06, 0), concrete, ws);
    // 收費亭（出入口中央分隔島）＋入口柵欄機
    g.add(box(1.0, 4.2, 60.3, 61.7, 0, 0.18, tex(mat(0xe0c34a), 'noise'), false, false));
    g.add(box(1.4, 2.9, 60.45, 61.55, 0.18, 1.1, mat(0xeeeeea), false), box(1.4, 2.9, 60.45, 61.55, 1.1, 2.1, tinted, false), box(1.2, 3.1, 60.3, 61.7, 2.1, 2.28, galv, false));
    g.add(box(3.45, 3.8, 60.45, 60.8, 0.18, 1.15, mat(0xe9b931), false));
    const bar = canvasMat(256, 16, (x, w, h) => { for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#fff' : '#d0201a'; x.fillRect(k * w / 8, 0, w / 8, h); } });
    put(mesh(new THREE.BoxGeometry(2.5, 0.07, 0.07), bar), 3.62, 59.3, 1.05, HP);
    const LL = [[2.5, 70.5, 0], [59.85, 70.5, Math.PI], [21, 89.5, -HP], [41, 89.5, -HP]].map(([x, y, r]) => [x, y, 0.2, r]);
    inst(new THREE.CylinderGeometry(0.08, 0.14, 9.5, 8).translate(0, 4.75, 0), metal, LL, true);
    inst(new THREE.BoxGeometry(1.2, 0.08, 0.08).translate(0.5, 9.4, 0), metal, LL);
    inst(new THREE.BoxGeometry(0.7, 0.14, 0.45).translate(1.05, 9.33, 0), lampM, LL);
  }

  // ---------- 9 排水與小物：側溝蓋、人孔、消防栓、郵筒、垃圾桶 ----------
  {
    const gr = [], skip = (v, rs) => rs.some(([a, b]) => v > a && v < b);
    for (let y = 5; y < 95; y += 10) if (!skip(y, [[24, 35]])) gr.push([-11.86, y, 0.005, HP]);
    for (let x = -55; x < 125; x += 10) if (!skip(x, [[-24, -11], [40, 48], [59, 70]])) gr.push([x, -9.86, 0.005, 0]);
    for (let x = -55; x < -13; x += 10) gr.push([x, -0.14, 0.005, 0]);
    for (const x of [70, 80, 90, 115]) gr.push([x, -0.14, 0.005, 0]);
    inst(new THREE.BoxGeometry(0.9, 0.03, 0.22).translate(0, 0.015, 0), iron, gr);
    inst(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 18).translate(0, 0.015, 0), iron, [[-3.5, 20, 0.005], [-9, 68, 0.005], [25, -3, 0.005], [96, -7.5, 0.005]]);
    const red = mat(0xc62828, 1, { roughness: 0.5 });             // 地上式消防栓
    put(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.7, 12).translate(0, 0.35, 0), red), -12.5, 2.3, W);
    put(mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, 7, 0, HP), mat(0xe9b931)), -12.5, 2.3, W + 0.7);
    put(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), red), -12.5, 2.3, W + 0.5, HP);
    for (const [x, c] of [[-13.72, 0x2e7d32], [-13.22, 0xc62828]]) {   // 郵筒：綠＝普通、紅＝限時
      g.add(box(x - 0.22, x + 0.22, 4.95, 5.35, W, W + 1.0, mat(c, 1, { roughness: 0.5 })));
      put(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 14, 1, false, 0, Math.PI).rotateZ(HP), mat(c, 1, { roughness: 0.5 }), false), x, 5.15, W + 1.0, HP);
    }
    inst(new THREE.CylinderGeometry(0.25, 0.22, 0.85, 12).translate(0, 0.425, 0), mat(0x3f6b4a, 1, { roughness: 0.6 }), [[-12.6, 36, W], [81.5, 1.5, W], [27, -11.5, W]], true);
  }

  // ---------- 閒置動畫：斜路號誌閃黃 ----------
  return function apply() {
    try {
      const on = performance.now() % 1000 < 550;
      blinkM.emissiveIntensity = on ? 1.8 : 0; blinkM.color.setHex(on ? 0xffb020 : 0x4a3a1c);
    } catch (e) { /* 動畫失敗不影響畫面 */ }
  };
}
