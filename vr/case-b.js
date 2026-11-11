// 版本 B：依手繪解題圖重建——西側雙棟＋弧形洽公廊、東側鄰里共融廣場、頂層禮堂、GLT 構造
import * as THREE from 'three';
import { buildIntro } from './intro-fire.js';

export function build(ctx) {
  const { V, box, flat, rect, line, label, arrow, flow, mat, setAmt, layer, F, amt, bump, smooth, lerp, LAST, scheme, CX, CY } = ctx;
  const { CONTEXT, FLOOR0, M, G, C, BRIDGE, B1, PLAZA, RAMP, ZONES, OLD_TREE } = scheme;
  const WHITE = new THREE.Color(0xf6f4ef), BRICK = new THREE.Color(0xb9745a);
  const hex = z => '#' + ZONES[z].color.toString(16).padStart(6, '0') + 'f0';
  const prism = (pts, z0, z1, material) => {                 // 任意平面形狀拉伸
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x - CX, y - CY)));
    const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: 16 });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, material); m.position.y = z0; m.castShadow = m.receiveShadow = true;
    return m;
  };
  const arcPts = () => {                                     // 弧形洽公廊平面：北側兩角為四分之一圓
    const p = [[G.x0, G.y0], [G.x1, G.y0]];
    for (let a = 0; a <= 90; a += 7.5) p.push([G.x1 - G.r + G.r * Math.cos(a * Math.PI / 180), G.y0 + G.r * Math.sin(a * Math.PI / 180)]);
    for (let a = 90; a <= 180; a += 7.5) p.push([G.x0 + G.r + G.r * Math.cos(a * Math.PI / 180), G.y0 + G.r * Math.sin(a * Math.PI / 180)]);
    return p;
  };
  const xs = k => M.x0 + M.step * k;                         // 各層西緣（逐層退 2 m）
  const zs = []; { let z = FLOOR0; for (const f of M.floors) { zs.push(z); z += f.h; } M.top = z; }
  const cz = []; { let z = FLOOR0; for (const f of C.floors) { cz.push(z); z += f.h; } C.top = z; }

  // ---------- 4 配置策略 ----------
  {
    const g = layer('zoning');
    const z = (r, c, t, col) => { g.add(flat(rect(...r), 0.15, mat(c, 0.72))); g.add(label(t, V((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, 0.6), { color: col, size: 0.9 })); };
    z([M.x0, M.x1, M.y0, G.y1], 0x93c5fd, '鄉公所行政大樓', '#1e40af');
    z([C.x0, C.x1, C.y0, C.y1], 0xc4b5fd, '里民代表辦公處', '#5b21b6');
    z([M.x0, C.x1, G.y1, C.y0], 0xbbf7d0, '鄰里同樂道', '#166534');
    z([PLAZA.x0, PLAZA.x1, PLAZA.y0, PLAZA.y1], 0xfcd34d, '鄰里共融廣場', '#92400e');
    z([PLAZA.x1, PLAZA.ext, 6, 42], 0xfde68a, '串連衛生所前庭', '#92400e');
    z([0, 6, 22, 34], 0x86efac, '主入口廣場', '#166534');
    z([0, 26, 46, 50.5], 0xfca5a5, '地下停車入口', '#991b1b');
    z([38, 50, 44.5, 50.5], 0x4ade80, '防風喬林', '#14532d');
    g.add(arrow(V(-14, 28, 0.5), V(4, 28, 0.5), 0x16a34a, 2), arrow(V(62, -8, 0.5), V(46, 8, 0.5), 0x16a34a, 2));
    g.add(arrow(V(-7, 62, 0.5), V(-7, 49.5, 0.5), 0xdc2626, 1.8), arrow(V(-6, 48.3, 0.5), V(5, 48.3, 0.5), 0xdc2626, 1.8));
  }

  // ---------- 5 量體 ----------
  const floorsM = [], floorsC = [], floorLbl = [], cLbl = [];
  const terrace = mat(0x86c98a);
  {
    const g = layer('mass');
    M.floors.forEach((f, k) => {
      const fg = new THREE.Group(), m = mat(0xf6f4ef), z = zs[k];
      fg.add(box(xs(k), M.coreX, M.y0, M.y1, z, z + f.h, m));
      fg.add(box(M.coreX, M.x1, M.y0, M.y1, z, z + f.h, mat(0xc9ced6)));
      if (k < M.floors.length - 1) {                         // 退台：植栽平臺＋通往上層的階梯
        fg.add(box(xs(k), xs(k + 1), M.y0, M.y1, z + f.h, z + f.h + 0.3, terrace, false));
        fg.add(box(xs(k) + 0.2, xs(k + 1), M.y0 + 1, M.y0 + 3.2, z + f.h * 0.5, z + f.h + 0.3, mat(0xd9d4c8), false));
      }
      fg.userData = { m, z, h: f.h, zone: new THREE.Color(ZONES[f.zone].color) };
      g.add(fg); floorsM.push(fg);
    });
    F.gallMat = mat(0xf6f4ef, 1, { roughness: 0.3 });
    F.gallery = new THREE.Group();
    F.gallery.add(prism(arcPts(), FLOOR0, FLOOR0 + G.h, F.gallMat));
    F.gallery.add(prism(arcPts().map(([x, y]) => [x + (x < 22 ? -0.5 : 0.5), y > G.y0 ? y + 0.5 : y]), FLOOR0 + G.h, FLOOR0 + G.h + 0.3, mat(0xe9e6df)));
    g.add(F.gallery);
    C.floors.forEach((f, k) => {
      const fg = new THREE.Group(), m = mat(0xf6f4ef), z = cz[k];
      fg.add(box(C.x0, C.x1, C.y0, C.y1, z, z + f.h, m));
      fg.userData = { m, z, h: f.h, zone: new THREE.Color(ZONES[f.zone].color) };
      g.add(fg); floorsC.push(fg);
    });
    F.bridge = new THREE.Group();
    const bz = zs[1];
    F.bridge.add(box(BRIDGE.x0, BRIDGE.x1, BRIDGE.y0 - 0.5, BRIDGE.y1, bz - 0.35, bz, mat(0xe9e6df)));
    F.bridge.add(box(BRIDGE.x0, BRIDGE.x0 + 0.1, BRIDGE.y0, BRIDGE.y1, bz, bz + 1.1, mat(0x6f97ab, 0.6), false, false), box(BRIDGE.x1 - 0.1, BRIDGE.x1, BRIDGE.y0, BRIDGE.y1, bz, bz + 1.1, mat(0x6f97ab, 0.6), false, false));
    g.add(F.bridge);
    // 斜屋頂（朝南傾斜，承載太陽能）與東端戶外逃生梯
    F.roof = new THREE.Group();
    F.roof.position.copy(V((xs(4) + M.x1) / 2, (M.y0 + M.y1) / 2, M.top + 1.0));
    F.roof.rotation.x = 0.09;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(M.x1 - xs(4) + 1.2, 0.3, M.y1 - M.y0 + 1.6), mat(0xe9e6df));
    slab.castShadow = true; F.roof.add(slab);
    g.add(F.roof);
    F.stair = new THREE.Group();
    for (let z = FLOOR0; z < M.top - 1; z += 1.9) F.stair.add(box(M.x1, M.x1 + 2.6, 11, 17, z, z + 0.2, mat(0xbfc4c9), false));
    for (const y of [11, 17]) F.stair.add(box(M.x1 + 2.4, M.x1 + 2.6, y - 0.1, y + 0.1, 0, M.top - 1, mat(0x6b7280), false));
    g.add(F.stair);

    const ls = layer('land');
    ls.add(flat(rect(PLAZA.x0, PLAZA.x1, PLAZA.y0, PLAZA.y1), 0.06, mat(0xf3d9a0)));
    ls.add(flat(rect(PLAZA.x1, PLAZA.ext, 6, 42), 0.05, mat(0xf7e8c4, 0.9)));
    for (let x = PLAZA.x0; x <= PLAZA.ext; x += 3.6) ls.add(line([V(x, x > PLAZA.x1 ? 6 : PLAZA.y0, 0.1), V(x, x > PLAZA.x1 ? 42 : PLAZA.y1, 0.1)], 0xd8b76a, false, 0.8));
    for (let y = 8; y <= 42; y += 3.6) ls.add(line([V(PLAZA.x0, y, 0.1), V(PLAZA.ext, y, 0.1)], 0xd8b76a, false, 0.8));
    ls.add(flat(rect(M.x0, C.x1, G.y1, C.y0), 0.06, mat(0xe7efe0)));           // 鄰里同樂道
    ls.add(flat(rect(0, 6, 22, 34), 0.07, mat(0xe9dfc8)));                      // 主入口廣場
    ls.add(flat(rect(0, 6, 0, 6), 0.07, mat(0xf2d7c0)));                        // 藝術轉角廣場
    ls.add(flat(rect(40, 48, 8, 11), 0.1, mat(0x9bd3a0)));                      // 雨水花園
    ls.add(flat(rect(0, 26, 46, 50.5), 0.05, mat(0xc3c9d0)));
    const rg = new THREE.BufferGeometry().setFromPoints([V(RAMP.x0, RAMP.y0, 0.07), V(RAMP.x1, RAMP.y0, -3.6), V(RAMP.x1, RAMP.y1, -3.6), V(RAMP.x0, RAMP.y0, 0.07), V(RAMP.x1, RAMP.y1, -3.6), V(RAMP.x0, RAMP.y1, 0.07)]);
    rg.computeVertexNormals();
    ls.add(new THREE.Mesh(rg, mat(0x8b95a1, 1, { side: THREE.DoubleSide })));
    const trunk = mat(0x8d6e63), crown = mat(0x7cb87f), dark = mat(0x4f9a5b), red = mat(0xd9654f);
    const tree = (x, y, s = 1, c = crown) => {
      const t = new THREE.Group();
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 3 * s, 6), trunk); a.position.y = 1.5 * s;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 * s, 1), c); b.position.y = 4.4 * s;
      a.castShadow = b.castShadow = true; t.add(a, b); t.position.copy(V(x, y, 0)); ls.add(t);
    };
    for (let x = 9; x <= 48; x += 6.5) tree(x, 2.5, 0.8);
    for (const y of [9, 15, 37, 43]) tree(2.5, y, 0.8);
    for (const x of [10, 17, 24]) tree(x, 30.5, 0.7);
    for (let x = 39.5; x <= 49.5; x += 2.6) { tree(x, 46, 1.0, dark); tree(x + 1.2, 49, 1.05, dark); }   // 防風喬林
    tree(OLD_TREE[0], OLD_TREE[1], 1.5, red);                                    // 老樹
    tree(40.5, 38, 0.8); tree(48.5, 40, 0.8);

    const l = layer('massLbl');
    l.add(label('鄉公所行政大樓 32×16 m・5F', V(24, 14, M.top + 3), { color: '#1e40af' }));
    l.add(label('里民代表辦公處 26×11 m・2F', V(20, 40, C.top + 1.5), { color: '#5b21b6' }));
    l.add(label('弧形洽公等候廊', V(22, 27.5, FLOOR0 + G.h + 1), { size: 0.85 }));
    l.add(label('西端逐層退台', V(7, 5, 14), { size: 0.85, color: '#166534' }));
    l.add(label('鄰里共融廣場', V(46, 24, 0.6), { color: '#92400e', size: 0.9 }));
    l.add(label('老樹伴讀廣場', V(OLD_TREE[0], OLD_TREE[1], 9), { color: '#b91c1c', size: 0.8 }));
  }

  // ---------- 6 垂直分區 ----------
  {
    const g = layer('zoneLbl');
    M.floors.forEach((f, k) => { const l = label(f.label, V(0, 0, 0), { size: 0.8, color: '#fff', bg: hex(f.zone) }); l.center.set(1, 0.5); g.add(l); floorLbl.push(l); });
    C.floors.forEach((f, k) => { const l = label(f.label, V(0, 0, 0), { size: 0.75, color: '#fff', bg: hex(f.zone) }); l.center.set(1, 0.5); g.add(l); cLbl.push(l); });
    g.add(label('RF 屋頂鄰里綠意開放空間', V(20, 40, C.top + 1.2), { size: 0.75, color: '#166534' }));
    const b = layer('b1');
    b.add(box(B1.x0, B1.x1, B1.y0, B1.y1, -4.1, -0.5, mat(ZONES.park.color, 0.95)));
    for (let x = B1.x0 + 3; x < B1.x1 - 2; x += 2.7) b.add(line([V(x, 20, -0.45), V(x, 14.5, -0.45)], 0xffffff), line([V(x, 40, -0.45), V(x, 34.5, -0.45)], 0xffffff));
    b.add(label(B1.label, V(22, 28, 0.5), { size: 0.8, color: '#fff', bg: 'rgba(75,85,99,.92)' }));
  }

  // ---------- 7 動線 ----------
  {
    const g = layer('paths');
    g.add(flow([V(-13, 28, 1), V(-2, 28, 1), V(5, 28.5, 1), V(12, 30, 1), V(16, 28.5, 1), V(17, 27, 1.2)], 0x16a34a));
    g.add(flow([V(CONTEXT.gate.x, -10, 1), V(54, -4, 1), V(46, 6, 1), V(43, 20, 1), V(39, 24, 1), V(35, 24.5, 1.2)], 0x16a34a));
    g.add(flow([V(4, 30, 1), V(12, 32, 1), V(18, 33, 1), V(19, 34, 1.2)], 0x7c3aed, 7));
    g.add(flow([V(-6, 78, 1), V(-6, 51, 1), V(-3, 48.3, 1), V(4, 48.3, 1), V(14, 48.3, -1.2), V(24, 48.3, -3.2)], 0xdc2626, 10));
    g.add(label('主入口廣場：迎接市場、鄰里人潮', V(2, 28, 3), { color: '#fff', bg: 'rgba(22,163,74,.93)', size: 0.9 }));
    g.add(label('次入口：面向廣場與校門', V(38, 25, 4), { color: '#fff', bg: 'rgba(22,163,74,.93)', size: 0.85 }));
    g.add(label('代表會入口', V(19, 34, 5), { color: '#fff', bg: 'rgba(124,58,237,.93)', size: 0.85 }));
    g.add(label('地下停車入口：避開車潮、人潮', V(4, 49, 3), { color: '#fff', bg: 'rgba(220,38,38,.93)', size: 0.9 }));
    g.add(label('戶外逃生梯', V(M.x1 + 1.5, 14, M.top), { size: 0.8 }), label('通學區減速鋪面', V(58, -5, 1), { size: 0.8, color: '#b45309' }));
    g.add(label('藝術轉角廣場・Ubike', V(2, 2, 2), { size: 0.8, color: '#9a3412' }));
  }

  // ---------- 8 氣候與永續 ----------
  {
    const g = layer('green');
    const pv = mat(0x1e3a5f, 1, { roughness: 0.4, metalness: 0.3 });
    const pvG = new THREE.Group(); pvG.position.copy(F.roof.position); pvG.rotation.copy(F.roof.rotation);
    for (let x = -10; x <= 10; x += 4) for (let z = -6; z <= 6; z += 3) { const p = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.2), pv); p.position.set(x, 0.28, z); pvG.add(p); }
    g.add(pvG);
    const gw = mat(0x5fae6a);                                 // 外牆垂直綠化
    for (let x = 17; x <= 31; x += 4.6) g.add(box(x, x + 1.6, M.y0 - 0.35, M.y0 - 0.1, zs[1] + 0.3, M.top - 1.2, gw, false));
    g.add(box(C.x0 + 0.5, C.x1 - 0.5, C.y0 + 0.5, C.y1 - 0.5, C.top, C.top + 0.35, terrace, false));   // 代表會屋頂綠化
    const l = layer('climate');
    l.add(label('防風喬林：阻擋東北季風', V(44, 47.5, 9), { color: '#fff', bg: 'rgba(20,83,45,.93)', size: 0.9 }));
    l.add(arrow(V(78, 80, 6), V(52, 54, 6), 0x64748b, 2.2));
    l.add(label('BERS 屋頂太陽能設施', V(26, 14, M.top + 3.5), { color: '#fff', bg: 'rgba(30,58,95,.93)', size: 0.9 }));
    l.add(label('外牆垂直綠化', V(24, 4.5, 14), { color: '#166534', size: 0.85 }));
    l.add(label('屋頂人工基盤綠化', V(20, 40, C.top + 1.5), { color: '#166534', size: 0.85 }));
    l.add(label('雨水花園：減少都市洪災', V(44, 9.5, 0.8), { color: '#0369a1', size: 0.85 }));
    l.add(label('筏基雨水儲留・中水利用', V(20, 4.5, 1), { color: '#fff', bg: 'rgba(3,105,161,.9)', size: 0.8 }));
  }

  // ---------- 9 災害應變 ----------
  {
    const g = layer('disaster');
    g.add(flat(rect(PLAZA.x0, PLAZA.x1, PLAZA.y0, PLAZA.y1), 0.2, mat(0xfb923c, 0.5)));
    g.add(label('共融廣場：災時集結', V(45, 26, 0.8), { color: '#fff', bg: 'rgba(194,65,12,.93)', size: 0.9 }));
    g.add(label('5F 禮堂：淹水時垂直避難', V(26, 14, M.top + 3.5), { color: '#1f2430', bg: '#e9c46af0', size: 0.9 }));
    g.add(flow([V(4, 9, 1), V(7, 7, zs[1]), V(9, 7, zs[2]), V(11, 7, zs[3]), V(13, 7, zs[4]), V(18, 10, zs[4] + 1)], 0xe9a23b, 8));
    g.add(label('沿退台階梯往上', V(6, 5, 10), { size: 0.8, color: '#92400e' }));
    g.add(flow([V(46, 22, 1), V(56, 22, 1), V(68, 22, 1)], 0xe11d48, 6), label('衛生所：災時醫療聚點', V(62, 22, 3), { color: '#be123c', size: 0.85 }));
    g.add(flow([V(22, 30, 1), V(34.5, 31, 1), V(35.5, 46, 1), V(34, 58, 1), V(30, 66, 1)], 0xf97316, 9), label('地震：往北側停車場開放避難', V(30, 64, 3), { color: '#c2410c', size: 0.85 }));
  }

  // ---------- 10 結構（GLT 膠合木）----------
  {
    const g = layer('struct');
    const wood = mat(0xa8743a), rc = mat(0x6b7280), bm = [];
    for (const x of M.gridX) for (const y of M.gridY) {
      const k = Math.max(0, Math.min(4, Math.ceil((x - M.x0) / M.step)));       // 退台處柱子只到該層
      const top = x >= xs(4) ? M.top : zs[Math.min(4, Math.floor((x - M.x0) / M.step))] + M.floors[Math.min(4, Math.floor((x - M.x0) / M.step))].h;
      g.add(box(x - 0.35, x + 0.35, y - 0.35, y + 0.35, FLOOR0, top, wood, false));
      g.add(box(x - 0.6, x + 0.6, y - 0.6, y + 0.6, -3.6, FLOOR0, rc, false));
    }
    for (const x of C.gridX) for (const y of C.gridY) g.add(box(x - 0.3, x + 0.3, y - 0.3, y + 0.3, FLOOR0, C.top, wood, false));
    M.floors.forEach((f, k) => {
      const z = zs[k] + f.h;
      for (const y of M.gridY) bm.push(V(xs(k), y, z), V(M.x1, y, z));
      for (const x of M.gridX) if (x >= xs(k)) bm.push(V(x, M.y0, z), V(x, M.y1, z));
    });
    C.floors.forEach((f, k) => { const z = cz[k] + f.h; for (const y of C.gridY) bm.push(V(C.x0, y, z), V(C.x1, y, z)); for (const x of C.gridX) bm.push(V(x, C.y0, z), V(x, C.y1, z)); });
    const lm = new THREE.LineBasicMaterial({ color: 0x7a4f1d, transparent: true }); lm.userData.o = 1;
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bm), lm));
    g.add(label('GLT 膠合木構架 8×8 m', V(22, 14, M.top + 3.5), { color: '#fff', bg: 'rgba(122,79,29,.95)', size: 0.9 }));
    g.add(label('RC 基礎＋工廠預製接頭', V(8, 4, 1.2), { size: 0.85 }));
    g.add(label('頂層禮堂：16 m 跨距木梁', V(28, 5, 19), { size: 0.85 }));
    g.add(label('兩棟分離：各自規則矩形', V(20, 31, 6), { color: '#fff', bg: 'rgba(220,38,38,.9)', size: 0.85 }));
  }

  // ---------- 11–12 立面與材料 ----------
  {
    const g = layer('facade');
    const glass = mat(0x6f97ab, 0.86, { roughness: 0.12, metalness: 0.35 });
    const wood = mat(0xa8743a), drip = mat(0xe9e6df), frame = mat(0x4b5258), shrub = mat(0x5fae6a), brickM = mat(0xa9654d);
    M.floors.forEach((f, k) => {
      const z = zs[k], a = xs(k) + 0.4, b = M.coreX - 0.3, s0 = z + (k === 0 ? 0.2 : 0.9), s1 = z + f.h - 0.6;
      g.add(box(a, b, M.y0 - 0.08, M.y0 + 0.05, s0, s1, glass, false, false));
      if (k >= 2) g.add(box(a, b, M.y1 - 0.05, M.y1 + 0.08, s0, s1, glass, false, false));
      g.add(box(xs(k), M.x1, M.y0 - 1.3, M.y0, z + f.h - 0.22, z + f.h, drip, false));      // 滴水線板（兼遮陽）
      g.add(box(xs(k) - 0.08, xs(k) + 0.05, M.y0 + 4, M.y1 - 1, s0, s1, glass, false, false));  // 退台面玻璃
    });
    for (const x of M.gridX) {                                // 南面 GLT 外柱：半戶外廊
      const kk = Math.min(4, Math.floor((x - M.x0) / M.step));
      const top = x >= xs(4) ? M.top : zs[kk] + M.floors[kk].h;
      g.add(box(x - 0.3, x + 0.3, M.y0 - 1.3, M.y0 - 0.7, FLOOR0, top, wood, false));
    }
    for (const x of [10, 18, 26, 34]) g.add(box(x - 0.25, x + 0.25, M.y0 - 1.3, M.y0 - 0.8, FLOOR0, x < xs(4) ? zs[1] + M.floors[1].h : M.top, wood, false));
    C.floors.forEach((f, k) => {
      const z = cz[k];
      g.add(box(C.x0 + 1, C.x1 - 1, C.y0 - 0.08, C.y0 + 0.05, z + 0.8, z + f.h - 0.6, glass, false, false));
      g.add(box(C.x0 + 1, C.x1 - 1, C.y1 - 0.05, C.y1 + 0.08, z + 0.9, z + f.h - 0.6, glass, false, false));
      g.add(box(C.x0 - 0.6, C.x1 + 0.6, C.y0 - 0.9, C.y0, z + f.h - 0.22, z + f.h, drip, false));
    });
    for (let x = G.x0 + 3; x <= G.x1 - 3; x += 2.5) g.add(box(x - 0.06, x + 0.06, G.y1, G.y1 + 0.1, FLOOR0, FLOOR0 + G.h, frame, false, false));
    g.add(box(G.x0, G.x1, G.y0 + 0.05, G.y1 + 0.15, FLOOR0 + 4.3, FLOOR0 + 4.6, drip, false, false));

    // ---- 立面細部：窗框分割、磚縫、欄杆、植栽、人、屋架、逃生梯 ----
    const thin = (x0, x1, y0, y1, z0, z1, m = frame) => g.add(box(x0, x1, y0, y1, z0, z1, m, false, false));
    const brick = [], rail = [];
    const courses = (x0, x1, y, z0, z1) => { for (let z = z0 + 0.3; z < z1; z += 0.38) brick.push(V(x0, y, z), V(x1, y, z)); };
    M.floors.forEach((f, k) => {
      const z = zs[k], a = xs(k) + 0.4, b = M.coreX - 0.3, s0 = z + (k === 0 ? 0.2 : 0.9), s1 = z + f.h - 0.6;
      for (let x = a; x <= b + 0.01; x += (b - a) / Math.round((b - a) / 1.9)) thin(x - 0.05, x + 0.05, M.y0 - 0.16, M.y0 - 0.06, s0, s1);   // 直框
      thin(a, b, M.y0 - 0.16, M.y0 - 0.06, s0 + (s1 - s0) * 0.68, s0 + (s1 - s0) * 0.68 + 0.07);                                         // 橫框
      if (k > 0) courses(xs(k), M.coreX, M.y0 - 0.02, z, z + 0.9);                                                                       // 窗台牆磚縫
      courses(M.coreX, M.x1, M.y0 - 0.02, z, z + f.h); courses(M.coreX, M.x1, M.y1 + 0.02, z, z + f.h);
      for (let zz = z + 0.3; zz < z + f.h; zz += 0.38) brick.push(V(M.x1 + 0.02, M.y0, zz), V(M.x1 + 0.02, 11, zz), V(M.x1 + 0.02, 17, zz), V(M.x1 + 0.02, M.y1, zz));
      thin(M.coreX + 1.6, M.coreX + 3.4, M.y0 - 0.1, M.y0 + 0.03, z + 1.0, z + f.h - 0.9, glass);                                        // 服務核小窗
      if (k < 4) {                                                                                                                       // 退台：玻璃欄杆、灌木、小樹
        const tz = z + f.h + 0.3;
        thin(xs(k), xs(k) + 0.06, M.y0, M.y1, tz, tz + 1.1, mat(0x9fc3d1, 0.45));
        rail.push(V(xs(k), M.y0, tz + 1.1), V(xs(k), M.y1, tz + 1.1), V(xs(k), M.y0, tz + 1.1), V(xs(k + 1), M.y0, tz + 1.1), V(xs(k), M.y1, tz + 1.1), V(xs(k + 1), M.y1, tz + 1.1));
        for (let y = M.y0 + 4.5; y < M.y1 - 0.5; y += 2.4) {
          const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + (y * 7 % 3) * 0.12, 0), shrub); sh.position.copy(V(xs(k) + 0.9, y, tz + 0.45)); sh.castShadow = true; g.add(sh);
        }
        const tt = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), shrub); tt.position.copy(V(xs(k) + 1, M.y1 - 2.2 - k, tz + 1.9)); g.add(tt);
        thin(xs(k) + 0.94, xs(k) + 1.06, M.y1 - 2.26 - k, M.y1 - 2.14 - k, tz, tz + 1.4, wood);
      }
    });
    // 五樓禮堂：直立木格柵
    for (let x = xs(4) + 0.8; x < M.coreX - 0.4; x += 0.95) thin(x - 0.07, x + 0.07, M.y0 - 0.5, M.y0 - 0.12, zs[4] + 0.9, M.top - 0.6, wood);
    // 斜屋頂下的 GLT 椽木與南北封簷
    const raft = new THREE.Group(); raft.position.copy(F.roof.position); raft.rotation.copy(F.roof.rotation);
    const rl = M.x1 - xs(4);
    for (let x = -rl / 2; x <= rl / 2 + 0.01; x += rl / 9) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, M.y1 - M.y0 + 1.4), wood); r.position.set(x, -0.4, 0); raft.add(r); }
    g.add(raft);
    thin(xs(4), M.x1, M.y1 - 0.05, M.y1 + 0.06, M.top, M.top + 1.6, glass);                       // 北側高窗
    // 綠牆花槽
    for (let x = 17; x <= 31; x += 4.6) thin(x - 0.15, x + 1.75, M.y0 - 0.55, M.y0 - 0.05, zs[1] - 0.1, zs[1] + 0.35, drip);
    // 東端戶外逃生梯：折返梯段與扶手
    for (let z = FLOOR0, n = 0; z < M.top - 2; z += 1.9, n++) {
      const y0 = n % 2 ? 16.6 : 11.4, y1 = n % 2 ? 11.4 : 16.6;
      rail.push(V(M.x1 + 0.7, y0, z + 0.2), V(M.x1 + 0.7, y1, z + 2.1), V(M.x1 + 1.9, y0, z + 0.2), V(M.x1 + 1.9, y1, z + 2.1));
      rail.push(V(M.x1 + 2.55, 11, z + 1.2), V(M.x1 + 2.55, 17, z + 1.2));
    }
    // 弧形洽公廊：橫框、入口門框、雨庇
    for (const z of [FLOOR0 + 2.4, FLOOR0 + 6.4]) thin(G.x0 + G.r, G.x1 - G.r, G.y1, G.y1 + 0.1, z, z + 0.07);
    thin(15.5, 18.5, G.y1 + 0.05, G.y1 + 1.8, FLOOR0 + 2.9, FLOOR0 + 3.1, drip); thin(15.6, 15.75, G.y1 + 1.6, G.y1 + 1.75, FLOOR0, FLOOR0 + 2.9, wood); thin(18.25, 18.4, G.y1 + 1.6, G.y1 + 1.75, FLOOR0, FLOOR0 + 2.9, wood);
    // 代表會：磚壁柱、窗框、磚縫、屋頂欄杆與灌木、入口雨庇
    C.floors.forEach((f, k) => {
      const z = cz[k];
      for (let x = C.x0; x <= C.x1 + 0.01; x += (C.x1 - C.x0) / 6) { thin(x - 0.3, x + 0.3, C.y0 - 0.25, C.y0, z, z + f.h, brickM); thin(x - 0.3, x + 0.3, C.y1, C.y1 + 0.25, z, z + f.h, brickM); }
      for (let x = C.x0 + 1.4; x < C.x1 - 1; x += 1.45) thin(x - 0.04, x + 0.04, C.y0 - 0.15, C.y0 - 0.05, z + 0.8, z + f.h - 0.6);
      courses(C.x0, C.x1, C.y0 - 0.02, z, z + 0.8);
      for (let zz = z + 0.3; zz < z + f.h; zz += 0.38) brick.push(V(C.x0 - 0.02, C.y0, zz), V(C.x0 - 0.02, C.y1, zz), V(C.x1 + 0.02, C.y0, zz), V(C.x1 + 0.02, C.y1, zz));
    });
    rail.push(V(C.x0, C.y0, C.top + 1.3), V(C.x1, C.y0, C.top + 1.3), V(C.x1, C.y0, C.top + 1.3), V(C.x1, C.y1, C.top + 1.3), V(C.x1, C.y1, C.top + 1.3), V(C.x0, C.y1, C.top + 1.3), V(C.x0, C.y1, C.top + 1.3), V(C.x0, C.y0, C.top + 1.3));
    for (let x = C.x0 + 2; x < C.x1 - 1; x += 3.1) { const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), shrub); sh.position.copy(V(x, C.y0 + 1.6 + (x * 3 % 5), C.top + 0.8)); g.add(sh); }
    thin(17.5, 20.5, C.y0 - 1.8, C.y0, cz[0] + 2.9, cz[0] + 3.1, drip);
    const bl = new THREE.LineBasicMaterial({ color: 0x8a4f3a, transparent: true }); bl.userData.o = 0.55;
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(brick), bl));
    const rm = new THREE.LineBasicMaterial({ color: 0x3f474d, transparent: true }); rm.userData.o = 0.95;
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rail), rm));
    // 人：手繪圖用紅色小人標示活動
    const pm = mat(0xd9483b);
    const person = (x, y, h) => {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 3, 8), pm), hd = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), pm);
      b.position.copy(V(x, y, h + 0.65)); hd.position.copy(V(x, y, h + 1.5)); b.castShadow = true; g.add(b, hd);
    };
    [[42, 20], [43.5, 22], [41, 33], [47, 12], [41, 9], [45, 16.5], [44, 36], [3, 27], [2, 30], [12, 30], [20, 31], [17, 28.4], [36.5, 24], [8, 3], [30, 2.5], [56, 20], [60, 24]].forEach(([x, y]) => person(x, y, 0.05));
    for (let k = 0; k < 4; k++) person(xs(k) + 1.1, M.y0 + 5 + k * 2, zs[k] + M.floors[k].h + 0.3);
    person(14, 40, C.top + 0.35); person(26, 38, C.top + 0.35); person(31.5, 30, zs[1]);
    // 廣場座椅與 Ubike 架
    for (const [x, y] of [[41, 16], [47, 17], [44, 18.5]]) thin(x - 0.9, x + 0.9, y - 0.25, y + 0.25, 0.05, 0.5, wood);
    for (let x = 1; x <= 5; x += 0.8) thin(x - 0.05, x + 0.05, 1.2, 2.6, 0.05, 1.0, frame);

    const e = layer('elevLbl');                                // 剖立面視角的帶狀標註
    const strip = (t, x) => e.add(label(t, V(x, -1, 0.3), { size: 0.85 }));
    strip('市場', -29); strip('12M 道路', -6); strip('人行道', 2.5); strip('鄉公所行政大樓', 22); strip('鄰里共融廣場', 45); strip('衛生所', 77); strip('住宅區', 101);
    e.add(label('5F 鄰里共享禮堂', V(26, M.y0 - 1, zs[4] + 2.5), { color: '#1f2430', bg: '#e9c46af0', size: 0.85 }));
    e.add(label('屋頂開放空間・人工基盤綠化', V(7, M.y0 - 1, zs[3] + 5.5), { color: '#166534', size: 0.8 }));
    e.add(label('BERS 屋頂太陽能設施', V(27, M.y0 - 1, M.top + 4), { color: '#fff', bg: 'rgba(30,58,95,.93)', size: 0.85 }));
    e.add(label('老樹伴讀廣場', V(OLD_TREE[0], OLD_TREE[1], 10.5), { color: '#b91c1c', size: 0.8 }));
    e.add(label('人本人行道・全區鋪面透水', V(-2, -1, 5), { size: 0.8, color: '#166534' }));

    const d = layer('facLbl');
    d.add(label('西端退台與階梯：垂直綠化開放空間', V(5, 5, 16), { color: '#fff', bg: 'rgba(22,101,52,.93)', size: 0.9, occlude: true }));
    d.add(label('南面：GLT 外柱＋滴水線板＝半戶外廊', V(26, 3, 10), { color: '#fff', bg: 'rgba(122,79,29,.95)', size: 0.9, occlude: true }));
    d.add(label('外牆垂直綠化', V(24, 3.5, 17), { color: '#166534', size: 0.85, occlude: true }));
    d.add(label('弧形玻璃洽公廊：通透親民', V(26, 30, 10), { color: '#fff', bg: 'rgba(63,110,130,.95)', size: 0.9, occlude: true }));
    d.add(label('東端：服務核＋戶外逃生梯', V(42, 14, M.top + 1), { size: 0.85, occlude: true }));
    const m = layer('matLbl');
    const tag = (t, pos, bg) => m.add(label(t, pos, { color: '#fff', bg, size: 0.85 }));
    tag('一級清水磚外牆', V(35.5, 5, 12), 'rgba(150,75,52,.96)');
    tag('GLT 膠合木柱（碳化層防火）', V(14, 4, 6), 'rgba(122,79,29,.96)');
    tag('滴水線板', V(26, 4.5, zs[2] + 0.3), 'rgba(110,112,115,.96)');
    tag('木質天花＋防火塗層', V(20, 5.5, 3.2), 'rgba(140,105,65,.96)');
    tag('屋頂綠化：植栽／覆土層／防水・阻根層', V(8, 8, zs[2] + 1.5), 'rgba(22,101,52,.96)');
    tag('Low-E 玻璃', V(24, 5.5, 15.5), 'rgba(63,110,130,.96)');
    tag('RC 基礎＋防蝕金屬接頭', V(6, 3.5, 0.8), 'rgba(75,82,88,.96)');
    tag('透水鋪面', V(3, 28, 0.6), 'rgba(160,140,100,.96)');
  }

  // ---- 每格更新 ----
  const grow = (grp, base, g, lift = 0) => { grp.scale.y = Math.max(0.001, g); grp.position.y = base * (1 - g) + lift; };
  const intro = buildIntro(ctx);                             // 序章：原始人學會用火（i === -1）
  return function apply(i, t) {
    intro(i, t);
    setAmt(F.zoning, amt(i, t, 4));
    const ghost = i === 10 ? lerp(1, 0.2, smooth(t / 0.2)) : 1;
    setAmt(F.mass, amt(i, t, 5, LAST, 0.1) * ghost);
    setAmt(F.massLbl, amt(i, t, 5));
    const colorT = i < 6 ? 0 : i === 6 ? smooth(t / 0.15) : 1;
    const ex = i === 6 ? bump(t) : 0;
    const matT = amt(i, t, 11, LAST, 0.25);
    const st = s => (i === 5 ? smooth((t - s) / 0.13) : 1);
    floorsM.forEach((fg, k) => {
      grow(fg, fg.userData.z, st(0.06 + k * 0.09), ex * k * 2.2);
      fg.userData.m.color.copy(WHITE).lerp(fg.userData.zone, colorT).lerp(BRICK, matT);
      floorLbl[k].position.copy(V(xs(k) - 1.5, M.y0, fg.userData.z + fg.userData.h / 2 + ex * k * 2.2));
    });
    grow(F.gallery, FLOOR0, st(0.55));
    F.gallMat.color.copy(WHITE).lerp(new THREE.Color(0x8fb4c4), Math.max(colorT * 0.5, matT));
    floorsC.forEach((fg, k) => {
      grow(fg, fg.userData.z, st(0.66 + k * 0.08), ex * k * 2.2);
      fg.userData.m.color.copy(WHITE).lerp(fg.userData.zone, colorT).lerp(BRICK, matT);
      cLbl[k].position.copy(V(C.x0 - 1.5, C.y0, fg.userData.z + fg.userData.h / 2 + ex * k * 2.2));
    });
    F.bridge.visible = st(0.84) > 0.5 && ex < 0.05;
    F.roof.visible = st(0.52) > 0.5; F.roof.position.y = M.top + 1.0 + ex * 5 * 2.2;
    F.stair.visible = st(0.9) > 0.5 && ex < 0.05;
    setAmt(F.zoneLbl, amt(i, t, 6));
    setAmt(F.b1, i === 6 ? ex : 0);
    setAmt(F.siteSurf, 1 - 0.85 * ex);
    setAmt(F.land, i === 6 ? 1 - 0.8 * ex : amt(i, t, 5, LAST, 0.3));
    setAmt(F.paths, amt(i, t, 7));
    setAmt(F.green, amt(i, t, 8, LAST));
    setAmt(F.climate, amt(i, t, 8));
    setAmt(F.disaster, amt(i, t, 9));
    setAmt(F.struct, amt(i, t, 10));
    setAmt(F.facade, matT);
    const elev = i === 11 && t < 0.42;                         // 立面段前半：正南向剖立面視角
    setAmt(F.elevLbl, elev ? smooth(t / 0.12) : 0);
    for (const b of F.southBlocks || []) b.visible = !(i === 11 && t < 0.5);
    setAmt(F.facLbl, i === 11 && t > 0.5 ? smooth((t - 0.5) / 0.1) : 0);
    setAmt(F.matLbl, amt(i, t, 12));
  };
}
