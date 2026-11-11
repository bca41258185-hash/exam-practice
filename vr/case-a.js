// 版本 A：依題目條件推導的示範方案（北側長條主棟＋東側獨立禮堂）
import * as THREE from 'three';

export function build(ctx) {
  const { V, box, flat, rect, line, label, arrow, flow, mat, setAmt, layer, F, amt, bump, smooth, lerp, LAST, scheme } = ctx;
  const { CONTEXT, FLOOR0, A, B, B1, PLAZA, RAMP, ZONES } = scheme;
  // ---------- 4 配置策略（地面分區泡泡圖）----------
  {
    const g = layer('zoning');
    const z = (r, c, t, col) => { g.add(flat(rect(...r), 0.15, mat(c, 0.72))); g.add(label(t, V((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, 0.6), { color: col })); };
    z([PLAZA.x0, PLAZA.x1, PLAZA.y0, PLAZA.y1], 0x86efac, '街角廣場', '#166534');
    z([A.x0, A.x1, A.y0, A.y1], 0x93c5fd, '公所主棟（東西向）', '#1e40af');
    z([B.x0, B.x1, B.y0, B.y1], 0xfcd34d, '大禮堂', '#92400e');
    z([0, 47, 45, 50.2], 0xfca5a5, '車道・服務', '#991b1b');
    g.add(arrow(V(-12, -8, 0.5), V(7, 9, 0.5), 0x16a34a, 2), arrow(V(60, -7, 0.5), V(26, 9, 0.5), 0x16a34a, 2));
    g.add(arrow(V(-7, 60, 0.5), V(-7, 48.5, 0.5), 0xdc2626, 1.8), arrow(V(-6, 47.6, 0.5), V(7, 47.6, 0.5), 0xdc2626, 1.8));
  }

  // ---------- 5 量體 ----------
  const WHITE = new THREE.Color(0xf6f4ef), HALL_ZONE = new THREE.Color(ZONES.hall.color);
  const floorsA = [];
  {
    const g = layer('mass');
    let z = FLOOR0;
    A.floors.forEach((f, k) => {
      const fg = new THREE.Group();
      const m = mat(0xf6f4ef);
      fg.add(box(A.cores[0].x1, A.cores[1].x0, A.y0, A.y1, z, z + f.h, m));
      const cm = mat(0xc9ced6);
      for (const c of A.cores) fg.add(box(c.x0, c.x1, A.y0, A.y1, z, z + f.h, cm));
      fg.userData = { m, z, zone: new THREE.Color(ZONES[f.zone].color), h: f.h };
      g.add(fg); floorsA.push(fg);
      z += f.h;
    });
    A.top = z;
    F.hallMat = mat(0xf6f4ef);
    F.hall = box(B.x0, B.x1, B.y0, B.y1 - 0.3, FLOOR0, FLOOR0 + B.h, F.hallMat);
    g.add(F.hall);
    F.podium = new THREE.Group();
    F.podium.add(box(A.x0, A.x1, A.y0 - 3, A.y1, 0, FLOOR0, mat(0xdedad0)), box(B.x0 - 3, B.x1, B.y0, A.y0 - 3, 0, FLOOR0, mat(0xdedad0)));
    g.add(F.podium);
    // 簷廊
    const cv = layer('arcade'), cm = mat(0xf6f4ef), pm = mat(0x9ca3af);
    cv.add(box(A.x0, B.x0, A.y0 - 3, A.y0, 4.6, 4.95, cm), box(B.x0 - 3, B.x0, B.y0, A.y0 - 3, 4.6, 4.95, cm));
    for (let x = A.x0 + 0.3; x < B.x0 - 3; x += 5.3) cv.add(box(x, x + 0.3, A.y0 - 3, A.y0 - 2.7, FLOOR0, 4.6, pm, false));
    for (let y = B.y0 + 0.2; y < A.y0 - 2; y += 5.3) cv.add(box(B.x0 - 3, B.x0 - 2.7, y, y + 0.3, FLOOR0, 4.6, pm, false));
    // 廣場鋪面、車道、植栽
    const ls = layer('land');
    ls.add(flat(rect(PLAZA.x0, PLAZA.x1 - 3, PLAZA.y0, PLAZA.y1 - 3), 0.06, mat(0xe7dcc6)));
    for (let x = PLAZA.x0; x <= PLAZA.x1 - 3; x += 3.8) ls.add(line([V(x, PLAZA.y0, 0.09), V(x, PLAZA.y1 - 3, 0.09)], 0xc8b998, false, 0.9));
    ls.add(flat(rect(0, 47, 45, 50.2), 0.05, mat(0xc3c9d0)));
    const rg = new THREE.BufferGeometry().setFromPoints([V(RAMP.x0, RAMP.y0, 0.07), V(RAMP.x1, RAMP.y0, -3.6), V(RAMP.x1, RAMP.y1, -3.6), V(RAMP.x0, RAMP.y0, 0.07), V(RAMP.x1, RAMP.y1, -3.6), V(RAMP.x0, RAMP.y1, 0.07)]);
    rg.computeVertexNormals();
    ls.add(new THREE.Mesh(rg, mat(0x8b95a1, 1, { side: THREE.DoubleSide })));
    ls.add(flat(rect(6, 14, 8, 13), 0.1, mat(0x9bd3a0)));   // 雨水花園
    const trunk = mat(0x8d6e63), crown = mat(0x7cb87f);
    const tree = (x, y, s = 1) => {
      const t = new THREE.Group();
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 3 * s, 6), trunk); a.position.y = 1.5 * s;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 * s, 1), crown); b.position.y = 4.4 * s;
      a.castShadow = b.castShadow = true; t.add(a, b); t.position.copy(V(x, y, 0)); ls.add(t);
    };
    for (let y = 14; y <= 44; y += 7.5) tree(2.5, y, 0.8);
    for (let x = 20; x <= 46; x += 8.5) tree(x, 2.5, 0.8);
    tree(9, 21, 0.9); tree(19, 20, 0.9); tree(48.6, 34, 0.6); tree(48.6, 40, 0.6);
  }
  { // 5 量體標註
    const g = layer('massLbl');
    g.add(label('公所主棟 42×16 m・5F', V(26, 36, A.top + 1), { color: '#1e40af' }));
    g.add(label('大禮堂 20×22 m・挑高 8.4 m', V(37, 15, FLOOR0 + B.h + 1), { color: '#92400e' }));
    g.add(label('簷廊 3 m', V(14, 26.5, 5.2), { size: 0.8 }));
    g.add(label('街角廣場 約 500㎡', V(14, 14, 0.5), { color: '#166534', size: 0.9 }));
  }

  // ---------- 6 垂直分區 ----------
  const floorLbl = [];
  {
    const g = layer('zoneLbl');
    A.floors.forEach((f, k) => {
      const l = label(f.label, V(A.x0 - 1, A.y0, 0), { size: 0.82, color: '#fff', bg: '#' + ZONES[f.zone].color.toString(16).padStart(6, '0') + 'f0' });
      l.center.set(1, 0.5); g.add(l); floorLbl.push(l);
    });
    F.hallLbl = label(B.label, V(37, 6, 6), { size: 0.82, color: '#1f2430', bg: '#e9c46af0' });
    g.add(F.hallLbl);
    const b = layer('b1');
    b.add(box(B1.x0, B1.x1, B1.y0, B1.y1, -4.1, -0.5, mat(ZONES.park.color, 0.95)));
    for (let x = B1.x0 + 3; x < B1.x1 - 2; x += 2.7) b.add(line([V(x, 30, -0.45), V(x, 24.5, -0.45)], 0xffffff), line([V(x, 16, -0.45), V(x, 10.5, -0.45)], 0xffffff));
    b.add(label(B1.label, V(18, 16, 0.5), { size: 0.85, color: '#fff', bg: 'rgba(75,85,99,.92)' }));
  }

  // ---------- 7 動線 ----------
  {
    const g = layer('paths');
    g.add(flow([V(-13, 14, 1), V(-4, 8, 1), V(8, 10, 1), V(15, 18, 1), V(16, 25, 1.4), V(16, 28, 1.6)], 0x16a34a));
    g.add(flow([V(CONTEXT.gate.x, -10, 1), V(52, -5, 1), V(30, 2.5, 1), V(20, 9, 1), V(17, 18, 1), V(16.5, 28, 1.6)], 0x16a34a));
    g.add(flow([V(48.6, -4, 1), V(48.6, 12, 1), V(48.6, 30, 1), V(47.5, 36, 1.4)], 0x7c3aed, 9));
    g.add(flow([V(-6, 78, 1), V(-6, 50, 1), V(-3, 47.7, 1), V(8, 47.7, 1), V(19, 47.7, -1), V(30, 47.7, -3.2)], 0xdc2626, 10));
    g.add(label('主入口（民眾）', V(16, 28, 5.6), { color: '#fff', bg: 'rgba(22,163,74,.93)' }));
    g.add(label('代表會專用入口', V(48.6, 22, 3), { color: '#fff', bg: 'rgba(124,58,237,.93)', size: 0.9 }));
    g.add(label('車道入口（遠離路口、校門）', V(2, 48, 3), { color: '#fff', bg: 'rgba(220,38,38,.93)', size: 0.9 }));
    g.add(label('直通樓梯 ①', V(7.5, 36, A.top + 1), { size: 0.8 }), label('直通樓梯 ②', V(44.5, 36, A.top + 1), { size: 0.8 }));
    g.add(label('最大步行距離 約 25 m', V(26, 36, A.top + 4), { size: 0.85, color: '#1d4ed8' }));
  }

  // ---------- 8 氣候 ----------
  {
    const g = layer('green');                                 // 遮陽與太陽能（出現後保留）
    const fm = mat(0xf6f4ef);
    let z = FLOOR0;
    A.floors.forEach(f => { z += f.h; g.add(box(A.cores[0].x1, A.cores[1].x0, A.y0 - 1.6, A.y0, z - 0.25, z, fm, false)); });
    const pv = mat(0x1e3a5f, 1, { roughness: 0.4, metalness: 0.3 });
    const panel = (x, y, z0) => { const p = box(x, x + 3.4, y, y + 1.9, z0 + 0.5, z0 + 0.62, pv, false); p.rotation.x = -0.26; g.add(p); };
    for (let x = 12; x < 40; x += 4.2) for (let y = 30.5; y < 42; y += 3.4) panel(x, y, A.top);
    for (let x = 29.5; x < 44; x += 4.2) for (let y = 8.5; y < 25; y += 3.4) panel(x, y, FLOOR0 + B.h);
    const l = layer('climate');
    l.add(label('西端服務核擋西曬', V(4, 36, 12), { color: '#fff', bg: 'rgba(220,38,38,.92)', size: 0.9 }));
    l.add(label('南向水平深遮陽 1.6 m', V(26, 26, 15), { size: 0.9 }));
    l.add(label('屋頂太陽能', V(26, 36, A.top + 2), { color: '#fff', bg: 'rgba(30,58,95,.92)', size: 0.9 }));
    l.add(label('透水鋪面・雨水花園', V(11, 9, 0.6), { color: '#166534', size: 0.9 }));
    l.add(arrow(V(-16, -14, 3), V(12, 14, 3), 0x0ea5e9, 2), label('西南風導入廣場', V(-10, -8, 5), { color: '#0369a1', size: 0.9 }));
    l.add(arrow(V(18, 24, 12), V(18, 48, 12), 0x0ea5e9, 1.4), label('進深 16 m 對流通風', V(18, 47, 14), { color: '#0369a1', size: 0.85 }));
  }

  // ---------- 9 防災 ----------
  {
    const g = layer('disaster');
    g.add(flat(rect(PLAZA.x0, PLAZA.x1 - 3, PLAZA.y0, PLAZA.y1 - 3), 0.2, mat(0xfb923c, 0.55)));
    g.add(label('防災廣場：物資集散・臨時指揮', V(14, 15, 0.8), { color: '#fff', bg: 'rgba(194,65,12,.93)', size: 0.9 }));
    g.add(label('大禮堂＝災民收容（約 100 人）', V(40, 10, FLOOR0 + B.h + 3), { color: '#1f2430', bg: '#e9c46af0', size: 0.9 }));
    g.add(label('5F 災害應變中心＋發電機（避洪）', V(26, 36, A.top + 1), { color: '#fff', bg: 'rgba(231,111,81,.95)', size: 0.9 }));
    g.add(flow([V(47, 17, 1.2), V(56, 18, 1), V(68, 21, 1)], 0xe11d48, 6), label('醫療支援', V(58, 19, 3), { color: '#be123c', size: 0.85 }));
    g.add(flow([V(34, 66, 1), V(36, 54, 1), V(36, 48, 1), V(47.5, 47, 1), V(48.6, 30, 1), V(47.3, 17, 1)], 0xf97316, 12), label('救災車輛集結', V(44, 66, 3), { color: '#c2410c', size: 0.85 }));
    g.add(flow([V(20, -6, 1), V(20, 4, 1), V(21, 14, 1), V(24, 17, 1.2)], 0xf97316, 6));
    g.add(label('車道口防水閘門', V(8, 47.7, 2), { size: 0.8, color: '#0369a1' }), label('一樓墊高 60 cm', V(16, 25, 2.4), { size: 0.8, color: '#0369a1' }));
  }

  // ---------- 10 結構 ----------
  {
    const g = layer('struct');
    const cm = mat(0x374151), bm = [];
    for (const x of A.gridX) for (const y of A.gridY) g.add(box(x - 0.4, x + 0.4, y - 0.4, y + 0.4, -3.6, A.top, cm, false));
    let z = FLOOR0;
    for (const f of A.floors) {
      z += f.h;
      for (const y of A.gridY) bm.push(V(A.x0, y, z), V(A.x1, y, z));
      for (const x of A.gridX) bm.push(V(x, A.y0, z), V(x, A.y1, z));
    }
    const top = FLOOR0 + B.h;
    for (let y = B.y0; y <= B.y1 - 0.2; y += 5.4) {
      g.add(box(B.x0 - 0.35, B.x0 + 0.35, y - 0.35, y + 0.35, 0, top, cm, false), box(B.x1 - 0.35, B.x1 + 0.35, y - 0.35, y + 0.35, 0, top, cm, false));
      bm.push(V(B.x0, y, top), V(B.x1, y, top), V(B.x0, y, top - 1.6), V(B.x1, y, top - 1.6));
      for (let i = 0; i < 8; i++) bm.push(V(B.x0 + i * 2.5, y, top - (i % 2 ? 0 : 1.6)), V(B.x0 + (i + 1) * 2.5, y, top - (i % 2 ? 1.6 : 0)));
    }
    const lm = new THREE.LineBasicMaterial({ color: 0x111827, transparent: true }); lm.userData.o = 1;
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bm), lm));
    g.add(box(B.x0 - 0.5, B.x1 + 0.5, A.y0 - 0.3, A.y0 - 0.05, 0, top + 1.5, mat(0xef4444, 0.6), false, false));
    g.add(label('耐震縫：L 形切成兩個矩形', V(37, 28, top + 2.5), { color: '#fff', bg: 'rgba(220,38,38,.93)', size: 0.9 }));
    g.add(label('RC 耐震構架 8.4×8 m', V(20, 36, A.top + 1), { size: 0.9 }));
    g.add(label('鋼桁架屋頂 跨距 20 m', V(37, 12, top + 1), { size: 0.9 }));
  }

  // ---------- 11–12 立面與材料 ----------
  const MAT_WALL = new THREE.Color(0xddd6c8), MAT_BRICK = new THREE.Color(0xb5654a);   // 抿石子、紅磚
  {
    const g = layer('facade');
    const glass = mat(0x6f97ab, 0.86, { roughness: 0.12, metalness: 0.35 });
    const frame = mat(0x4b5258), terra = mat(0xc8704a), wood = mat(0xb08a5e), roofM = mat(0x8d969c, 1, { roughness: 0.55, metalness: 0.4 }), conc = mat(0xe9e6df);
    const gx0 = A.cores[0].x1 + 0.3, gx1 = A.cores[1].x0 - 0.3;
    let z = FLOOR0;
    A.floors.forEach((f, k) => {
      const s0 = k === 0 ? z + 0.15 : z + 0.9, s1 = z + f.h - 0.55;      // 南向：橫帶窗（一樓為通透大廳）
      g.add(box(gx0, gx1, A.y0 - 0.08, A.y0 + 0.05, s0, s1, glass, false, false));
      g.add(box(gx0, gx1, A.y1 - 0.05, A.y1 + 0.08, z + 0.75, z + f.h - 0.4, glass, false, false));   // 北向：大面採光
      for (let x = gx0; x <= gx1 + 0.01; x += (gx1 - gx0) / 10) {
        g.add(box(x - 0.06, x + 0.06, A.y0 - 0.14, A.y0, s0, s1, frame, false, false));
        g.add(box(x - 0.06, x + 0.06, A.y1, A.y1 + 0.14, z + 0.75, z + f.h - 0.4, frame, false, false));
      }
      z += f.h;
    });
    for (const c of A.cores) {                                 // 樓梯間直條窗
      g.add(box(c.x0 + 1.9, c.x0 + 3.1, A.y0 - 0.08, A.y0 + 0.05, FLOOR0 + 0.4, A.top - 0.6, glass, false, false));
      g.add(box(c.x0 + 1.9, c.x0 + 3.1, A.y1 - 0.05, A.y1 + 0.08, FLOOR0 + 0.4, A.top - 0.6, glass, false, false));
    }
    for (let h = FLOOR0 + 0.9; h < A.top - 0.2; h += 0.55) {   // 東西端：陶板水平格柵
      g.add(box(A.x0 - 0.45, A.x0 - 0.2, A.y0 + 0.6, A.y1 - 0.6, h, h + 0.22, terra, false));
      g.add(box(A.x1 + 0.2, A.x1 + 0.45, A.y0 + 0.6, A.y1 - 0.6, h, h + 0.22, terra, false));
    }
    for (const y of [A.y0 + 0.6, (A.y0 + A.y1) / 2, A.y1 - 0.6]) {
      g.add(box(A.x0 - 0.3, A.x0 - 0.05, y - 0.1, y + 0.1, FLOOR0, A.top, frame, false));
      g.add(box(A.x1 + 0.05, A.x1 + 0.3, y - 0.1, y + 0.1, FLOOR0, A.top, frame, false));
    }
    g.add(box(A.x0 - 0.2, A.x1 + 0.2, A.y0 - 0.2, A.y1 + 0.2, A.top, A.top + 0.3, conc, false));      // 屋頂版
    // 大禮堂：紅磚實牆＋高窗＋面向廣場的折疊門＋金屬屋面
    const hb = FLOOR0, ht = FLOOR0 + B.h, by1 = B.y1 - 0.3;
    g.add(box(B.x0 - 0.08, B.x0 + 0.05, B.y0 + 1, by1 - 1, ht - 2.3, ht - 0.7, glass, false, false));
    g.add(box(B.x1 - 0.05, B.x1 + 0.08, B.y0 + 1, by1 - 1, ht - 2.3, ht - 0.7, glass, false, false));
    g.add(box(B.x0 + 1, B.x1 - 1, B.y0 - 0.08, B.y0 + 0.05, ht - 2.3, ht - 0.7, glass, false, false));
    g.add(box(B.x0 - 0.08, B.x0 + 0.05, B.y0 + 3, by1 - 3, hb + 0.1, hb + 3.3, glass, false, false));
    for (let y = B.y0 + 3; y <= by1 - 3 + 0.01; y += 2) g.add(box(B.x0 - 0.14, B.x0, y - 0.06, y + 0.06, hb + 0.1, hb + 3.3, frame, false, false));
    g.add(box(B.x0 - 0.5, B.x1 + 0.5, B.y0 - 0.5, by1, ht, ht + 0.25, roofM, false));
    const seams = [];
    for (let y = B.y0; y < by1; y += 1.1) seams.push(V(B.x0 - 0.5, y, ht + 0.27), V(B.x1 + 0.5, y, ht + 0.27));
    const sm = new THREE.LineBasicMaterial({ color: 0x5f686e, transparent: true }); sm.userData.o = 0.9;
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seams), sm));
    // 簷廊：木紋鋁格柵天花
    g.add(box(A.x0 + 0.2, B.x0 - 0.2, A.y0 - 2.8, A.y0 - 0.2, 4.45, 4.6, wood, false, false), box(B.x0 - 2.8, B.x0 - 0.2, B.y0 + 0.2, A.y0 - 2.8, 4.45, 4.6, wood, false, false));

    const d = layer('facLbl');                                 // 11 立面設計
    d.add(label('南向：1.6 m 深遮陽＋橫帶窗', V(22, 22.5, 14.5), { color: '#fff', bg: 'rgba(31,36,48,.9)', size: 0.9, occlude: true }));
    d.add(label('西向：實牆＋陶板格柵擋西曬', V(4, 36, A.top + 1.5), { color: '#fff', bg: 'rgba(200,112,74,.95)', size: 0.9 }));
    d.add(label('北向：大面窗・穩定天光', V(26, 49, 11), { color: '#fff', bg: 'rgba(63,110,130,.95)', size: 0.9, occlude: true }));
    d.add(label('大禮堂：實牆量體＋高窗', V(37, 4.5, ht + 1.5), { color: '#fff', bg: 'rgba(150,75,52,.95)', size: 0.9, occlude: true }));
    d.add(label('一樓：通透大廳', V(16, 24, 5.4), { size: 0.85, occlude: true }));
    const m = layer('matLbl');                                 // 12 材料
    const tag = (t, pos, bg, color = '#fff') => m.add(label(t, pos, { color, bg, size: 0.85 }));
    tag('抿石子外牆（窗台牆）', V(32, 27.5, 17.6), 'rgba(160,150,130,.96)');
    tag('Low-E 複層膠合玻璃', V(20, 27.5, 10.2), 'rgba(63,110,130,.96)');
    tag('清水混凝土遮陽板', V(34, 26.5, 12.6), 'rgba(110,112,115,.96)');
    tag('陶板格柵', V(4.5, 30, 15), 'rgba(200,112,74,.96)');
    tag('在地紅磚', V(30, 5.5, 5.4), 'rgba(150,75,52,.96)');
    tag('氟碳烤漆鋁鎂錳合金屋面', V(38, 16, ht + 1.2), 'rgba(95,104,110,.96)');
    tag('木紋鋁格柵天花', V(14, 26, 5.2), 'rgba(140,105,65,.96)');
    tag('鋼柱：熱浸鍍鋅＋氟碳塗裝', V(25.5, 14, 2.2), 'rgba(75,82,88,.96)');
  }

  // ---- 每格更新（本版本專屬圖層）----
  return function apply(i, t) {
    setAmt(F.zoning, amt(i, t, 4));
    const built = amt(i, t, 5, LAST, 0.1);
    const ghost = i === 10 ? lerp(1, 0.2, smooth(t / 0.2)) : 1;
    setAmt(F.mass, built * ghost);
    setAmt(F.arcade, amt(i, t, 5, LAST, 0.8) * ghost);
    setAmt(F.massLbl, amt(i, t, 5));
    const colorT = i < 6 ? 0 : i === 6 ? smooth(t / 0.15) : 1;
    const ex = i === 6 ? bump(t) : 0;
    const matT = amt(i, t, 11, LAST, 0.25);                   // 分區色 → 實際材料色
    floorsA.forEach((fg, k) => {
      const grow = i === 5 ? smooth((t - 0.08 - k * 0.11) / 0.14) : 1;
      fg.scale.y = Math.max(0.001, grow);
      fg.position.y = (fg.userData.z) * (1 - grow) + ex * k * 2.4;
      fg.userData.m.color.copy(WHITE).lerp(fg.userData.zone, colorT).lerp(MAT_WALL, matT);
      floorLbl[k].position.copy(V(A.x0 - 1.5, A.y0, fg.userData.z + fg.userData.h / 2 + ex * k * 2.4));
    });
    const hg = i === 5 ? Math.max(0.001, smooth((t - 0.62) / 0.2)) : 1;
    F.hall.scale.y = hg; F.hall.position.y = FLOOR0 + B.h / 2 * hg;
    F.hallMat.color.copy(WHITE).lerp(HALL_ZONE, colorT).lerp(MAT_BRICK, matT);
    setAmt(F.facade, matT);
    setAmt(F.facLbl, amt(i, t, 11));
    setAmt(F.matLbl, amt(i, t, 12));
    setAmt(F.zoneLbl, amt(i, t, 6));
    setAmt(F.b1, i === 6 ? ex : 0);
    setAmt(F.siteSurf, 1 - 0.85 * ex);
    setAmt(F.land, i === 6 ? 1 - 0.8 * ex : amt(i, t, 5, LAST, 0.3));
    setAmt(F.podium, 1 - 0.8 * ex);
    setAmt(F.paths, amt(i, t, 7));
    setAmt(F.green, amt(i, t, 8, LAST));
    setAmt(F.climate, amt(i, t, 8));
    setAmt(F.disaster, amt(i, t, 9));
    setAmt(F.struct, amt(i, t, 10));
  };
}
