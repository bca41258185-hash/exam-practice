// 版本 B 街道家具與場所細節：路燈、旗桿、圍樹座椅、花台、車阻、標線、緣石、車輛、Ubike、指標、雨水花園、衛生所前庭
import * as THREE from 'three';

export function buildDetails(ctx) {
  const { V, box, mat, tex, setAmt, layer, amt, LAST, scheme } = ctx;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","WenQuanYi Zen Hei",sans-serif';
  const g = layer('props');
  const B = 0.06;                                              // 基地內鋪面高度
  const HP = Math.PI / 2;
  const OT = scheme.OLD_TREE || [44, 14];
  let seed = 7;
  const rnd = (a = 0, b = 1) => a + ((seed = (seed * 16807) % 2147483647) / 2147483647) * (b - a);
  const mesh = (geo, m, sh = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = sh; o.receiveShadow = true; return o; };
  const put = (o, x, y, h = 0, ry = 0) => { o.position.copy(V(x, y, h)); o.rotation.y = ry; g.add(o); return o; };   // ry：本地 +x 指向的方位角（東＝0、北＝π/2）
  const part = (grp, geo, m, x, y, z, sh = true) => { const o = mesh(geo, m, sh); o.position.set(x, y, z); grp.add(o); return o; };
  const inst = (geo, m, list, sh = false) => {                // [x, y, h, ry, sx, sy, sz, rx, rz]
    const o = new THREE.InstancedMesh(geo, m, list.length), d = new THREE.Object3D();
    list.forEach(([x, y, h, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0], k) => {
      d.position.copy(V(x, y, h)); d.rotation.set(rx, ry, rz); d.scale.set(sx, sy, sz); d.updateMatrix(); o.setMatrixAt(k, d.matrix);
    });
    o.castShadow = sh; o.receiveShadow = true; g.add(o); return o;
  };
  const canvasMat = (w, h, draw, extra = {}) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return mat(0xffffff, 1, { map: t, ...extra });
  };
  const BX = new THREE.BoxGeometry(1, 1, 1);
  const bx = (grp, m, x, y, z, sx, sy, sz, sh = true) => { const o = part(grp, BX, m, x, y, z, sh); o.scale.set(sx, sy, sz); return o; };

  // ---------- 材質 ----------
  const metal = mat(0x596067, 1, { roughness: 0.45, metalness: 0.5 });
  const lampM = mat(0xfff6dc, 1, { emissive: 0xffe9b8, emissiveIntensity: 1.2 });
  const wood = tex(mat(0xa8774a), 'wood'), concrete = tex(mat(0xcfcbc2), 'noise'), kerbM = tex(mat(0xd6d8da), 'noise');
  const shrubM = tex(mat(0x5f9a58), 'grass'), reedM = tex(mat(0x7fa255), 'grass'), soil = mat(0x6b5a45), stoneM = mat(0x9c978d);
  const dark = mat(0x2b2e33), rubber = mat(0x1f2124, 1, { roughness: 0.8 }), glass = mat(0x27313a, 1, { roughness: 0.15, metalness: 0.2 });
  const paint = (c) => mat(c, 1, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const white = paint(0xf2f2ee), yellow = paint(0xe9b931), slowBand = tex(paint(0xa4553f), 'noise');
  const CARS = [0xf1f1ee, 0x9aa3ab, 0x3c4650, 0x7b2d2d, 0x2f4a6b].map(c => mat(c, 1, { roughness: 0.35, metalness: 0.3 }));
  const ubike = mat(0xe8a317, 1, { roughness: 0.5 });

  // ---------- 1 路燈（人行道 6 m、廣場 4 m） ----------
  const poleG = h => new THREE.CylinderGeometry(0.06, 0.09, h, 8).translate(0, h / 2, 0);
  const pole6 = poleG(6), pole4 = poleG(4), armG = new THREE.BoxGeometry(1.3, 0.06, 0.06), headG = new THREE.BoxGeometry(0.55, 0.1, 0.24);
  const lanternG = new THREE.CylinderGeometry(0.18, 0.14, 0.45, 10), capG = new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10);
  const streetLamp = (x, y, ry) => {
    const o = new THREE.Group(); part(o, pole6, metal, 0, 0, 0);
    part(o, armG, metal, 0.6, 5.95, 0, false); part(o, headG, lampM, 1.2, 5.88, 0, false);
    return put(o, x, y, B, ry);
  };
  for (const y of [12, 20, 35, 40]) streetLamp(0.6, y, Math.PI);         // 12M 路側：燈臂伸向車道
  for (const x of [12.2, 25.2, 38.2]) streetLamp(x, 0.6, -HP);            // 10M 路側
  for (const [x, y] of [[40, 25], [49, 25], [40, 31], [49, 31]]) {        // 廣場庭園燈
    const o = new THREE.Group(); part(o, pole4, metal, 0, 0, 0);
    part(o, lanternG, lampM, 0, 4.2, 0, false); part(o, capG, metal, 0, 4.45, 0, false);
    put(o, x, y, B);
  }

  // ---------- 2 旗桿與飄動旗面 ----------
  const flags = [];
  const flagDraw = [
    (x, w, h) => { x.fillStyle = '#2f7d4f'; x.fillRect(0, 0, w, h); x.fillStyle = '#f4d35e'; x.fillRect(0, h * 0.42, w, h * 0.16); x.fillStyle = '#fff'; x.beginPath(); x.arc(w * 0.3, h * 0.5, h * 0.2, 0, 7); x.fill(); },
    (x, w, h) => {                                             // 國旗：青天白日滿地紅
      x.fillStyle = '#fe0000'; x.fillRect(0, 0, w, h); x.fillStyle = '#000095'; x.fillRect(0, 0, w / 2, h / 2);
      const cx = w / 4, cy = h / 4; x.fillStyle = '#fff'; x.beginPath();
      for (let k = 0; k < 24; k++) { const r = k % 2 ? 17 : 30, a = k * Math.PI / 12; x.lineTo(cx + r * Math.sin(a), cy - r * Math.cos(a)); }
      x.fill(); x.fillStyle = '#000095'; x.beginPath(); x.arc(cx, cy, 16.5, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 14, 0, 7); x.fill();
    },
    (x, w, h) => { x.fillStyle = '#1e5aa8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 10; x.beginPath(); x.moveTo(0, h * 0.75); x.quadraticCurveTo(w * 0.5, h * 0.45, w, h * 0.75); x.stroke(); },
  ];
  const fpole = new THREE.CylinderGeometry(0.045, 0.07, 9, 8).translate(0, 4.5, 0), fball = new THREE.SphereGeometry(0.09, 8, 6), fbase = new THREE.CylinderGeometry(0.35, 0.4, 0.25, 12);
  flagDraw.forEach((draw, k) => {
    const y = 25 + k * 3, o = new THREE.Group();
    part(o, fbase, concrete, 0, 0.125, 0); part(o, fpole, metal, 0, 0, 0); part(o, fball, metal, 0, 9.05, 0, false);
    const geo = new THREE.PlaneGeometry(1.8, 1.2, 10, 4).translate(0.95, 0, 0);
    const f = part(o, geo, canvasMat(240, 160, draw, { side: THREE.DoubleSide, roughness: 0.8 }), 0, 8.25, 0);
    f.userData = { base: geo.attributes.position.array.slice(), ph: k * 1.7 };
    flags.push(f); put(o, 2.5, y, B, HP);                        // 旗面朝北展開，自 12M 路正面可見
  });

  // ---------- 3 老樹圍樹座椅（12 段弧形木椅） ----------
  {
    const n = 12, r = 2.3, segG = new THREE.BoxGeometry(2 * r * Math.sin(Math.PI / n) + 0.02, 0.06, 0.45), legG = new THREE.BoxGeometry(0.3, 0.39, 0.32);
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * Math.PI * 2, x = OT[0] + r * Math.cos(a), y = OT[1] + r * Math.sin(a);
      put(mesh(segG, wood), x, y, B + 0.42, a + HP); put(mesh(legG, concrete), x, y, B + 0.195, a + HP);
    }
  }

  // ---------- 4 花台＋灌木（同樂道邊緣、洽公廊入口兩側） ----------
  {
    const shrubs = [];
    for (const [x0, x1, y0, y1] of [[13.2, 15.2, 27.3, 28.1], [18.8, 20.8, 27.3, 28.1], [7.5, 10.5, 32.8, 33.6], [12.5, 15.5, 32.8, 33.6], [19, 22, 32.8, 33.6], [25.5, 28.5, 32.8, 33.6]]) {
      g.add(box(x0, x1, y0, y1, B, B + 0.5, concrete, false), box(x0 + 0.08, x1 - 0.08, y0 + 0.08, y1 - 0.08, B + 0.5, B + 0.52, soil, false, false));
      const n = Math.round((x1 - x0) / 0.62);
      for (let k = 0; k < n; k++) { const s = rnd(0.75, 1.05); shrubs.push([x0 + (k + 0.5) * (x1 - x0) / n, (y0 + y1) / 2 + rnd(-0.08, 0.08), B + 0.55 + 0.2 * s, rnd(0, 6), s, s * 0.8, s]); }
    }
    inst(new THREE.IcosahedronGeometry(0.38, 1), shrubM, shrubs, true);
  }

  // ---------- 5 車阻（廣場南緣、主入口廣場路緣） ----------
  {
    const list = [];
    for (let x = 39.5; x <= 49; x += 1.8) list.push([x, 5, B]);
    for (let y = 22.6; y <= 33.5; y += 1.8) list.push([0.45, y, B]);
    inst(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 10).translate(0, 0.45, 0), dark, list, true);
  }

  // ---------- 6 道路標線：分向線、斑馬線、通學區減速鋪面 ----------
  {
    const PG = new THREE.PlaneGeometry(1, 1).rotateX(-HP);       // 平放單位方塊，sx 沿東西、sz 沿南北
    const band = mesh(PG, slowBand, false); band.scale.set(20, 1, 10); put(band, 62, -5, 0.02);
    const zebra = [], dash = [];
    const zx = (xc, w) => { for (let y = -9.4; y <= -0.5; y += 0.9) zebra.push([xc, y, 0.045, 0, w, 1, 0.45]); };   // 跨 10M 路
    zx(44, 4); zx(63.5, 4.5);
    for (let x = -11.4; x <= -0.5; x += 0.9) zebra.push([x, 28, 0.045, 0, 0.45, 1, 4]);                             // 跨 12M 路往市場
    const skipX = x => (x > -13.5 && x < 1.5) || (x > 40.5 && x < 47.5) || (x > 60 && x < 67);
    for (let x = -58; x < 123; x += 6) if (!skipX(x)) dash.push([x, -5, 0.035, 0, 3, 1, 0.15]);
    for (let y = 2; y < 94; y += 6) if (!(y > 24.5 && y < 31.5)) dash.push([-6, y, 0.035, 0, 0.15, 1, 3]);
    inst(PG, white, zebra); inst(PG, yellow, dash);
    const slow = canvasMat(256, 256, (x, w, h) => { x.fillStyle = '#f2f2ee'; x.font = `900 210px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('慢', w / 2, h / 2 + 8); }, { alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const sg = new THREE.PlaneGeometry(2.6, 3.2).rotateX(-HP);
    put(mesh(sg, slow, false), 56, -7.5, 0.05, -HP); put(mesh(sg, slow, false), 70, -2.5, 0.05, HP);   // 駕駛前進方向可讀
  }

  // ---------- 7 緣石（12M 側留出地下車道開口、西南角圓弧） ----------
  g.add(box(-0.2, 0, 0.6, 46, 0, 0.15, kerbM, false), box(-0.2, 0, 50.5, 52, 0, 0.15, kerbM, false), box(0.6, 50, -0.2, 0, 0, 0.15, kerbM, false));
  put(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 10, 1, false, Math.PI * 1.5, HP), kerbM), 0.6, 0.6, 0.075);

  // ---------- 8 車輛與機車 ----------
  const bodyG = new THREE.BoxGeometry(4.4, 0.7, 1.8), cabG = new THREE.BoxGeometry(2.3, 0.42, 1.64), roofG = new THREE.BoxGeometry(2.05, 0.05, 1.5);
  const wheelG = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12).rotateX(HP), lightG = new THREE.BoxGeometry(0.04, 0.12, 1.5);
  const tailM = mat(0x8a1c1c), headM = mat(0xf3efe2, 1, { emissive: 0xfff4d0, emissiveIntensity: 0.3 });
  let ci = 0;
  const car = (x, y, ry, h = 0) => {
    const o = new THREE.Group(), m = CARS[ci++ % CARS.length];
    part(o, bodyG, m, 0, 0.67, 0); part(o, cabG, glass, -0.2, 1.23, 0); part(o, roofG, m, -0.25, 1.465, 0);
    part(o, lightG, headM, 2.2, 0.82, 0, false); part(o, lightG, tailM, -2.2, 0.82, 0, false);
    for (const [wx, wz] of [[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]]) part(o, wheelG, rubber, wx, 0.33, wz, false);
    return put(o, x, y, h, ry);
  };
  // 公有停車場：格位寬 2.6 m、深 5 m；面向車道頭進
  for (const [y, ry, ks] of [[55.5, -HP, [1, 3, 6, 10, 14]], [67.5, HP, [2, 8, 12]], [73.5, -HP, [4, 11, 16]], [85.5, HP, [0, 7, 13]]])
    for (const k of ks) car(4 + 2.6 * k + 1.3, y, k % 4 === 3 ? ry + Math.PI : ry, 0.01);
  car(-3, 40, HP); car(-9, 14, -HP);                          // 12M 路：靠右行駛（北向走東側）
  car(20, -7.5, 0); car(31, -2.5, Math.PI);                   // 10M 路：東向走南側
  car(6, 48.3, 0, 0.05);                                      // 地下停車車道
  const scBody = new THREE.BoxGeometry(1.3, 0.3, 0.38), scShield = new THREE.BoxGeometry(0.14, 0.6, 0.36), scSeat = new THREE.BoxGeometry(0.62, 0.12, 0.3);
  const scBar = new THREE.BoxGeometry(0.06, 0.05, 0.62), scWheel = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10).rotateX(HP);
  [-13, -13, -13].forEach((x, k) => {                          // 市場前機車
    const o = new THREE.Group(), m = CARS[(k + 2) % CARS.length];
    part(o, scBody, m, -0.05, 0.42, 0); part(o, scShield, m, 0.5, 0.75, 0); part(o, scSeat, dark, -0.25, 0.68, 0);
    part(o, scBar, metal, 0.52, 1.08, 0, false); part(o, scWheel, rubber, 0.6, 0.22, 0, false); part(o, scWheel, rubber, -0.6, 0.22, 0, false);
    put(o, x, 9 + k * 0.85, 0.02, 0);
  });

  // ---------- 9 Ubike（停靠在既有車架之間） ----------
  {
    const wG = new THREE.TorusGeometry(0.33, 0.025, 6, 18), tube = new THREE.BoxGeometry(1, 0.045, 0.045), post = new THREE.BoxGeometry(0.04, 1, 0.04);
    for (let k = 0; k < 5; k++) {
      const o = new THREE.Group();
      part(o, wG, rubber, 0.55, 0.33, 0, false); part(o, wG, rubber, -0.55, 0.33, 0, false);
      const t1 = part(o, tube, ubike, 0.05, 0.55, 0, false); t1.scale.x = 0.95; t1.rotation.z = -0.35;
      const t2 = part(o, tube, ubike, -0.3, 0.42, 0, false); t2.scale.x = 0.55;
      const sp = part(o, post, ubike, -0.18, 0.75, 0, false); sp.scale.y = 0.5; sp.rotation.z = -0.25;
      const st = part(o, post, ubike, 0.5, 0.68, 0, false); st.scale.y = 0.75; st.rotation.z = 0.25;
      bx(o, dark, -0.12, 1.0, 0, 0.26, 0.05, 0.12, false); bx(o, metal, 0.42, 1.06, 0, 0.05, 0.04, 0.56, false); bx(o, ubike, 0.68, 0.9, 0, 0.28, 0.2, 0.34, false);
      put(o, 1.4 + 0.8 * k, 1.9, B, HP);
    }
  }

  // ---------- 10 主入口指標塔（磚＋木，鄉公所字樣） ----------
  {
    g.add(box(4.1, 4.9, 22.7, 23.3, B, 2.2, tex(mat(0xb9745a), 'brick'), false), box(4.0, 5.0, 22.6, 23.4, 2.2, 2.4, wood, false));
    const sign = canvasMat(160, 450, (x, w, h) => {
      x.fillStyle = '#4a2f1d'; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(20,10,4,${rnd(0.1, 0.35)})`; x.lineWidth = rnd(1, 3); const px = rnd(0, w); x.beginPath(); x.moveTo(px, 0); x.lineTo(px + rnd(-6, 6), h); x.stroke(); }
      x.fillStyle = '#f6efe2'; x.font = `700 112px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      ['鄉', '公', '所'].forEach((s, k) => x.fillText(s, w / 2, 88 + k * 128));
      x.fillStyle = '#d9b46a'; x.fillRect(30, 18, w - 60, 4); x.fillRect(30, h - 22, w - 60, 4);
    });
    const pg = new THREE.PlaneGeometry(0.46, 1.3);
    put(mesh(pg, sign, false), 4.5, 22.69, 1.45, 0);              // 南面
    put(mesh(pg, sign, false), 4.09, 23, 1.45, -HP);              // 西面（朝 12M 路）
  }

  // ---------- 11 雨水花園：蘆葦草叢與卵石 ----------
  {
    const blades = [], stones = [];
    for (let c = 0; c < 10; c++) {
      const cx = rnd(41.6, 47.6), cy = rnd(8.4, 10.6);
      for (let k = 0; k < 14; k++) blades.push([cx + rnd(-0.35, 0.35), cy + rnd(-0.3, 0.3), 0.1, rnd(0, 6), 1, rnd(0.45, 1.1), 1, rnd(-0.3, 0.3), rnd(-0.3, 0.3)]);
    }
    for (let k = 0; k < 9; k++) stones.push([rnd(41.5, 47.7), rnd(8.3, 10.7), 0.12, rnd(0, 6), rnd(0.6, 1.3), rnd(0.35, 0.6), rnd(0.6, 1.1)]);
    inst(new THREE.BoxGeometry(0.03, 1, 0.012).translate(0, 0.5, 0), reedM, blades);
    inst(new THREE.DodecahedronGeometry(0.22, 0), stoneM, stones, true);
  }

  // ---------- 12 衛生所前庭：樹與座椅（保留 y≈22 的 6 m 通道） ----------
  {
    const trunk = mat(0x8d6e63), crown = mat(0x7cb87f), s = 0.8;
    const tG = new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 3 * s, 6), cG = new THREE.IcosahedronGeometry(1.9 * s, 2), qG = new THREE.IcosahedronGeometry(1.1 * s, 1);
    for (const [x, y] of [[55, 11], [63, 13], [55, 33], [63, 35]]) {
      const o = new THREE.Group(); part(o, tG, trunk, 0, 1.5 * s, 0); part(o, cG, crown, 0, 4.3 * s, 0);
      for (let n = 0; n < 5; n++) { const a = n * 1.26 + x; part(o, qG, crown, Math.cos(a) * 1.35 * s, (4 + (n % 2) * 1.1) * s, Math.sin(a) * 1.35 * s); }
      put(o, x, y, 0.05, x + y);
    }
    for (const [y, back] of [[17.6, -0.22], [26.4, 0.22]]) {      // 椅背背向通道
      g.add(box(58, 60, y - 0.22, y + 0.22, 0.47, 0.53, wood, false), box(58, 60, y + back - 0.03, y + back + 0.03, 0.53, 0.95, wood, false));
      for (const x of [58.2, 59.8]) g.add(box(x - 0.06, x + 0.06, y - 0.2, y + 0.2, 0.05, 0.47, concrete, false));
    }
  }

  // ---------- 每格更新：隨量體章節出現；旗面微風飄動 ----------
  return function apply(i, t) {
    setAmt(g, amt(i, +t || 0, 5, LAST, 0.5));
    if (!g.visible) return;
    const now = performance.now() * 0.001;
    for (const f of flags) {
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let k = 0; k < p.count; k++) {
        const x = b[k * 3], y = b[k * 3 + 1], w = x / 1.9;
        p.array[k * 3 + 2] = Math.sin(x * 2.4 - now * 3.2 + f.userData.ph) * 0.13 * w + Math.sin(y * 3 + now * 2) * 0.03 * w;
        p.array[k * 3 + 1] = y - 0.06 * w * w;
      }
      p.needsUpdate = true; f.geometry.computeVertexNormals();
    }
  };
}
