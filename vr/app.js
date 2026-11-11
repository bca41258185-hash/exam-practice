import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { StereoEffect } from './vendor/StereoEffect.js';
import { META, SITE, CONTEXT, FLOOR0, A, B, B1, PLAZA, RAMP, ZONES, PROGRAM, CHECKS, CHAPTERS } from './scheme.js';

const $ = id => document.getElementById(id);
const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","WenQuanYi Zen Hei",sans-serif';
const CX = 25, CY = 25;                                   // 模型中心（基地座標）
const V = (x, y, h = 0) => new THREE.Vector3(x - CX, h, -(y - CY));
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- renderer / scene ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  $('err').style.display = 'block';
  $('err').textContent = '此瀏覽器無法啟用 WebGL，無法顯示 3D 講解。請改用 Chrome 或 Safari 最新版。';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
$('gl').appendChild(renderer.domElement);
const stereoFx = new StereoEffect(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);
scene.fog = new THREE.Fog(0xdfe7ee, 260, 620);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1500);
scene.add(camera);
const world = new THREE.Group();                           // 所有模型都放這裡，VR 時整體縮放成桌上模型
scene.add(world);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c2cc, 1.15));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 400 });
sun.shadow.bias = -0.0006;
world.add(sun, sun.target);
const SUN_HOME = V(-45, -60, 95);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 3; controls.maxDistance = 320;

// ---------- 建模工具 ----------
const EDGE = new THREE.LineBasicMaterial({ color: 0x4b5563, transparent: true, opacity: 0.45 });
function mat(color, o = 1, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra });
  m.userData.o = o; m.opacity = o; m.transparent = o < 1;
  return m;
}
function box(x0, x1, y0, y1, z0, z1, material, edges = true, shadow = true) {
  const g = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0);
  const m = new THREE.Mesh(g, material);
  m.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  m.castShadow = shadow; m.receiveShadow = true;
  if (edges) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(g), EDGE.clone());
    l.material.userData.o = 0.45;
    m.add(l);
  }
  return m;
}
function shapeOf(poly) {
  const s = new THREE.Shape();
  poly.forEach(([x, y], i) => (i ? s.lineTo(x - CX, y - CY) : s.moveTo(x - CX, y - CY)));
  s.closePath();
  return s;
}
function flat(poly, h, material) {
  const g = new THREE.ShapeGeometry(shapeOf(poly));
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = h; m.receiveShadow = true;
  return m;
}
const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function line(pts, color, dashed = false, o = 1) {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: o })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: o });
  m.userData.o = o;
  const l = new THREE.Line(g, m);
  if (dashed) l.computeLineDistances();
  return l;
}
const labels = [];
function label(text, pos, { color = '#1f2430', bg = 'rgba(255,255,255,.93)', size = 1, occlude = false } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const fs = 44, pad = 18;
  x.font = `700 ${fs}px ${FONT}`;
  const w = Math.ceil(x.measureText(text).width) + pad * 2, h = fs + pad * 1.5;
  c.width = w; c.height = h;
  x.font = `700 ${fs}px ${FONT}`;
  x.fillStyle = bg;
  x.beginPath(); x.roundRect(0, 0, w, h, 16); x.fill();
  x.fillStyle = color; x.textBaseline = 'middle';
  x.fillText(text, pad, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: occlude, depthWrite: false, sizeAttenuation: false });
  m.userData.o = 1;
  const s = new THREE.Sprite(m);
  s.userData.base = [0.03 * size * (w / h), 0.03 * size];
  s.scale.set(s.userData.base[0], s.userData.base[1], 1);
  s.center.set(0.5, 0);
  s.position.copy(pos);
  s.renderOrder = 10;
  labels.push(s);
  return s;
}
function arrow(p0, p1, color, w = 1.6) {
  const g = new THREE.Group(), len = p0.distanceTo(p1), head = Math.min(len * 0.35, w * 2.6);
  const m = mat(color, 0.9, { emissive: color, emissiveIntensity: 0.25 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, len - head), m);
  shaft.position.z = (len - head) / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 1.25, head, 4), m);
  tip.rotation.x = Math.PI / 2; tip.rotation.y = Math.PI / 4; tip.position.z = len - head / 2;
  tip.scale.y = 1; tip.scale.z = 0.25;
  g.add(shaft, tip);
  g.position.copy(p0); g.lookAt(p1);
  return g;
}
const flows = [];
function flow(pts, color, n = 14, r = 0.75) {            // 沿路徑流動的光點：表示動線
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
  const m = mat(color, 1, { emissive: color, emissiveIntensity: 0.6 });
  const dots = [];
  for (let i = 0; i < n; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m);
    g.add(d); dots.push(d);
  }
  g.add(line(curve.getPoints(60), color, false, 0.55));
  flows.push({ curve, dots, speed: 9 / curve.getLength() });
  return g;
}
function setAmt(g, a) {                                    // 0..1 淡入；0 則隱藏
  a = Math.min(1, Math.max(0, a));
  if (g.userData.a === a) return;
  g.userData.a = a;
  g.visible = a > 0.002;
  if (!g.visible) return;
  g.traverse(o => {
    const m = o.material;
    if (!m || m.userData.o === undefined) return;
    const op = m.userData.o * a;
    m.opacity = op;
    if (!o.isSprite && !o.isLine) { m.transparent = op < 0.995; m.depthWrite = op > 0.5; }
  });
}
const F = {};                                              // 各「圖層」
const TABLE_R = 104;                                       // VR 桌面模型的地面半徑（公尺）
const layer = name => (F[name] = new THREE.Group(), world.add(F[name]), F[name]);

// ---------- 周邊環境 ----------
{
  const g = layer('ctx');
  const sq = r => { const q = new THREE.Shape(); q.moveTo(-r, -r); q.lineTo(r, -r); q.lineTo(r, r); q.lineTo(-r, r); q.closePath(); return q; };
  const ground = (shape, hole) => {
    shape.holes.push(hole);
    const gg = new THREE.ShapeGeometry(shape); gg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(gg, mat(0xeef1ec));
    m.position.y = -0.03; m.receiveShadow = true;
    g.add(m); return m;
  };
  ground(sq(TABLE_R), shapeOf(SITE.poly));                 // 基地挖洞，才能在分區章節看到地下室
  F.outer = ground(sq(420), sq(TABLE_R));                  // 外圈：VR 桌面模型模式時隱藏
  const pit = box(-0.5, 50.5, -0.5, 52.5, -4.6, -4.2, mat(0xcfd6dc), false, false);
  g.add(pit);
  for (const r of CONTEXT.roads) {
    g.add(flat(rect(r.x0, r.x1, r.y0, r.y1), 0.0, mat(0xb8c0c8)));
    g.add(label(r.name, V(r.at[0], r.at[1], 0.5), { color: '#fff', bg: 'rgba(75,85,99,.85)', size: 0.8, occlude: true }));
  }
  g.add(flat([[-12, -10], [-22, -10], [-50, -48], [-40, -48]], 0.0, mat(0xb8c0c8)));   // 西南斜向 10M 道路
  for (const l of CONTEXT.lots) {
    g.add(flat(rect(l.x0, l.x1, l.y0, l.y1), 0.01, mat(l.color || 0xd9dde2)));
    g.add(label(l.name, V((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2, 1), { size: 0.85, color: '#374151', occlude: true }));
  }
  const pk = CONTEXT.lots[0];
  for (let x = pk.x0 + 4; x < pk.x1 - 2; x += 2.6)
    for (const y of [58, 70, 76, 88]) g.add(line([V(x, y, 0.05), V(x, y - 5, 0.05)], 0xffffff, false, 0.9));
  for (const b of CONTEXT.blocks) {
    g.add(box(b.x0, b.x1, b.y0, b.y1, 0, b.h, mat(0xd3d8de)));
    if (b.name) g.add(label(b.name, V((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.h + 1), { size: 0.85, color: '#374151', occlude: true }));
  }
  g.add(label(CONTEXT.gate.name, V(CONTEXT.gate.x, CONTEXT.gate.y, 1), { size: 0.8, color: '#b45309' }));
  // 指北
  const n = arrow(V(-34, 74, 0.3), V(-34, 88, 0.3), 0x1f2430, 1.2);
  g.add(n, label('北', V(-34, 90, 0.5), { size: 0.9 }));
}
{ // 基地本體
  const g = layer('site');
  F.siteSurf = flat(SITE.poly, 0.0, mat(0xf7f3e8));
  g.add(F.siteSurf);
  const ring = SITE.poly.map(([x, y]) => V(x, y, 0.12)); ring.push(ring[0].clone());
  g.add(line(ring, 0xdc2626));
  F.siteLabel = label(`本案基地 約 ${SITE.area.toLocaleString()}㎡`, V(25, 26, 0.5), { color: '#b91c1c', size: 1.05 });
  world.add(F.siteLabel);
  const dims = layer('dims');
  dims.add(label('50 m', V(25, 52.5, 0.3), { size: 0.75, color: '#b91c1c' }),
    label('52 m', V(-1.5, 26, 0.3), { size: 0.75, color: '#b91c1c' }),
    label('49.82 m', V(51.5, 25, 0.3), { size: 0.75, color: '#b91c1c' }));
}

// ---------- 1 基地分析 ----------
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffb703 }));
const sunPos = a => V(25 + 62 * Math.cos(a), 25 - 62 * Math.sin(a) * 0.5, 62 * Math.sin(a) * 0.8 + 2);
{
  const g = layer('ana');
  const arc = []; for (let i = 0; i <= 48; i++) arc.push(sunPos(Math.PI * i / 48));
  g.add(line(arc, 0xf59e0b, true, 0.9), sunBall);
  g.add(label('東・日出', sunPos(0.02), { size: 0.8, color: '#b45309' }), label('西曬', sunPos(Math.PI - 0.12), { size: 1, color: '#fff', bg: 'rgba(220,38,38,.9)' }));
  g.add(arrow(V(-30, -32, 6), V(8, 6, 6), 0x0ea5e9, 2.4), label('夏季 西南風', V(-22, -24, 8), { color: '#0369a1' }));
  g.add(arrow(V(82, 82, 6), V(48, 48, 6), 0x64748b, 2.4), label('冬季 東北季風', V(72, 72, 8), { color: '#334155' }));
  F.rings = [];
  for (const [x, y, t] of [[-13, 14, '市場人潮'], [CONTEXT.gate.x, -9, '學童接送'], [0, 0, '街角節點'], [60, 22, '衛生所']]) {
    const r = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 40), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, side: THREE.DoubleSide }));
    r.material.userData.o = 0.85;
    r.rotation.x = -Math.PI / 2; r.position.copy(V(x, y, 0.3));
    g.add(r, label(t, V(x, y, 4), { color: '#b91c1c', size: 0.9 }));
    F.rings.push(r);
  }
  g.add(label('沿海低地：颱風・淹水風險', V(25, 40, 0.5), { color: '#fff', bg: 'rgba(3,105,161,.9)', size: 0.9 }));
}

// ---------- 2 法規 ----------
{
  const s = SITE.setback, g = layer('setback');
  g.add(flat(rect(0, s, 0, 52), 0.04, mat(0xfde68a, 0.75)), flat(rect(s, 50, 0, s), 0.04, mat(0xfde68a, 0.75)));
  g.add(line([V(s, 52, 0.2), V(s, s, 0.2), V(50, s, 0.2)], 0xb45309, true));
  const l = layer('legal');
  l.add(label('退縮 5 m 人行道', V(2.5, 30, 0.5), { color: '#92400e', size: 0.9 }));
  const env = box(5, 47, 14, 44.3, 0, 19, mat(0x60a5fa, 0.16, { depthWrite: false }), true, false);
  l.add(env);
  l.add(label('建蔽 50% ＝ 1,273㎡', V(26, 14, 1), { color: '#1d4ed8' }));
  l.add(label('容積 250% ＝ 6,365㎡ ≒ 蓋滿 5 層', V(26, 30, 20), { color: '#fff', bg: 'rgba(29,78,216,.92)' }));
}

// ---------- 3 需求量化（立體長條：高度＝面積）----------
{
  const g = layer('prog');
  const n = PROGRAM.length, w = 5, gap = 1, x0 = 25 - (n * (w + gap) - gap) / 2;
  let sum = 0;
  PROGRAM.forEach((p, i) => {
    const h = p.area / 36, x = x0 + i * (w + gap);
    g.add(box(x, x + w, 18, 23, 0, h, mat(ZONES[p.zone].color)));
    g.add(label(`${p.name} ${p.area}`, V(x + w / 2, 20.5, h + 0.6), { size: 0.72 }));
    sum += p.area;
  });
  g.add(label(`淨面積合計 ${sum.toLocaleString()}㎡ → 加公設約 3,800㎡（容積上限的 60%）`, V(25, 8, 0.5), { color: '#fff', bg: 'rgba(31,36,48,.9)', size: 0.9 }));
  F.progBars = g;
}

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
const WHITE = new THREE.Color(0xf6f4ef);
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

// ---------- 章節狀態 → 畫面 ----------
const amt = (i, t, k0, k1 = k0, ramp = 0.22) => (i < k0 || i > k1 ? 0 : i === k0 ? smooth(t / ramp) : 1);
const bump = t => smooth((t - 0.12) / 0.22) * (1 - smooth((t - 0.86) / 0.12));
const N = CHAPTERS.length, LAST = N - 1;
let clock = 0;
function applyState(i, t) {
  setAmt(F.dims, amt(i, t, 0, 2));
  setAmt(F.siteLabel, i <= 2 ? 1 : 0);
  setAmt(F.ana, amt(i, t, 1));
  setAmt(F.setback, amt(i, t, 2, 4));
  setAmt(F.legal, amt(i, t, 2));
  setAmt(F.prog, amt(i, t, 3));
  F.progBars.scale.y = i === 3 ? Math.max(0.001, smooth(t / 0.35)) : 1;
  setAmt(F.zoning, amt(i, t, 4));
  const built = amt(i, t, 5, LAST, 0.1);
  const ghost = i === 10 ? lerp(1, 0.2, smooth(t / 0.2)) : 1;
  setAmt(F.mass, built * ghost);
  setAmt(F.arcade, amt(i, t, 5, LAST, 0.8) * ghost);
  setAmt(F.massLbl, amt(i, t, 5));
  // 樓層逐層長出 → 上色 → 抽開看分區
  const colorT = i < 6 ? 0 : i === 6 ? smooth(t / 0.15) : 1;
  const ex = i === 6 ? bump(t) : 0;
  floorsA.forEach((fg, k) => {
    const grow = i === 5 ? smooth((t - 0.08 - k * 0.11) / 0.14) : 1;
    fg.scale.y = Math.max(0.001, grow);
    fg.position.y = (fg.userData.z) * (1 - grow) + ex * k * 2.4;
    fg.userData.m.color.copy(WHITE).lerp(fg.userData.zone, colorT);
    const l = floorLbl[k];
    l.position.copy(V(A.x0 - 1.5, A.y0, fg.userData.z + fg.userData.h / 2 + ex * k * 2.4));
  });
  const hg = i === 5 ? Math.max(0.001, smooth((t - 0.62) / 0.2)) : 1;
  F.hall.scale.y = hg; F.hall.position.y = FLOOR0 + B.h / 2 * hg;
  F.hallMat.color.copy(WHITE).lerp(new THREE.Color(ZONES.hall.color), colorT);
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
  // 太陽：基地分析章節由東向西移動
  if (i === 1) { const p = sunPos(lerp(0.12, 0.9, t) * Math.PI); sunBall.position.copy(p); sun.position.copy(p); }
  else sun.position.copy(SUN_HOME);
  F.rings.forEach((r, k) => r.scale.setScalar(1 + 0.25 * Math.sin(clock * 3 + k)));
  for (const f of flows) f.dots.forEach((d, k) => d.position.copy(f.curve.getPointAt((((k / f.dots.length + clock * f.speed) % 1) + 1) % 1)));
}

// 鏡頭
const camOf = c => ({ p: V(...c.cam), l: V(...c.look) });
function pose(i, t) {
  const c = camOf(CHAPTERS[i]);
  let p = c.p, l = c.l;
  if (i > 0) { const a = camOf(CHAPTERS[i - 1]), s = smooth(t / 0.3); p = a.p.clone().lerp(c.p, s); l = a.l.clone().lerp(c.l, s); }
  const ang = (CHAPTERS[i].walk ? 0.5 : 0.16) * (t - 0.5);
  if (CHAPTERS[i].walk) l = l.clone().sub(p).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang).add(p);
  else p = p.clone().sub(l).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang).add(l);
  return { p, l, fov: i === LAST ? lerp(45, 68, smooth(t / 0.3)) : 45 };
}

// ---------- 播放狀態 ----------
const S = { i: 0, t: 0, playing: false, free: false, voice: true, gyro: false, stereo: false, speaking: false, waited: 0 };
const segs = [];
CHAPTERS.forEach((c, k) => {
  const el = document.createElement('i'); el.title = c.title; el.innerHTML = '<b></b>';
  el.onclick = () => go(k);
  $('seg').appendChild(el); segs.push(el.firstChild);
});
function speak(text) {
  if (!S.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW'; u.rate = 1.05;
    const v = speechSynthesis.getVoices().find(v => /zh[-_]TW/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^zh/i.test(v.lang));
    if (v) u.voice = v;
    S.speaking = true; S.waited = 0;
    let started = false;
    u.onstart = () => { started = true; };
    u.onend = u.onerror = () => { S.speaking = false; };
    speechSynthesis.speak(u);
    // 有些瀏覽器（例如頭戴裝置內建瀏覽器）沒有語音引擎：2.5 秒內沒開始唸就不等旁白
    setTimeout(() => { if (!started && !speechSynthesis.speaking) S.speaking = false; }, 2500);
  } catch (e) { S.speaking = false; }
}
function hush() { S.speaking = false; try { speechSynthesis.cancel(); } catch (e) { } }
function showCaption() {
  const c = CHAPTERS[S.i];
  $('cN').textContent = `${S.i + 1}/${N}`;
  $('cT').textContent = c.title;
  $('cP').textContent = c.say;
  $('cK').innerHTML = c.key.map(k => `<span>${k}</span>`).join('');
  $('cD').hidden = !c.checks;
  if (c.checks) $('cC').innerHTML = CHECKS.map(([a, b]) => `<li><b>✔ ${a}</b>${b}</li>`).join('');
  drawPanel(c);
  layout();
}
function go(k, keepPlaying = S.playing) {
  S.i = Math.min(LAST, Math.max(0, k)); S.t = 0; S.free = false;
  hush(); showCaption();
  setPlaying(keepPlaying);
  if (keepPlaying) speak(CHAPTERS[S.i].say);
}
function setPlaying(p) {
  S.playing = p;
  $('bPlay').textContent = p ? '⏸' : '▶';
  if (!p) hush();
}
$('bPlay').onclick = () => {
  if (S.playing) return setPlaying(false);
  if (S.i === LAST && S.t >= 1) return go(0, true);
  S.free = false; setPlaying(true);
  if (S.t < 0.05) speak(CHAPTERS[S.i].say);
};
$('bPrev').onclick = () => go(S.t > 0.15 && S.playing ? S.i : S.i - 1);
$('bNext').onclick = () => go(S.i + 1);
$('bVoice').onclick = () => { S.voice = !S.voice; if (!S.voice) hush(); syncBtns(); };
controls.addEventListener('start', () => { if (!S.free) { S.free = true; setPlaying(false); } });
addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); $('bPlay').click(); }
  if (e.key === 'ArrowRight') $('bNext').click();
  if (e.key === 'ArrowLeft') $('bPrev').click();
});
function syncBtns() {
  $('bVoice').classList.toggle('on', S.voice);
  $('bGyro').classList.toggle('on', S.gyro);
  $('bStereo').classList.toggle('on', S.stereo);
}

// ---------- 陀螺儀環視 ----------
const gy = { q: new THREE.Quaternion(), ref: null, has: false };
{
  const e = new THREE.Euler(), q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2), q0 = new THREE.Quaternion(), zee = new THREE.Vector3(0, 0, 1);
  addEventListener('deviceorientation', ev => {
    if (ev.alpha == null) return;
    const d = THREE.MathUtils.degToRad, o = d(screen.orientation ? screen.orientation.angle : (window.orientation || 0));
    e.set(d(ev.beta), d(ev.alpha), -d(ev.gamma), 'YXZ');
    gy.q.setFromEuler(e).multiply(q1).multiply(q0.setFromAxisAngle(zee, -o));
    gy.has = true;
  });
  addEventListener('orientationchange', () => { gy.ref = null; });
}
async function setGyro(on) {
  if (on && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') on = false; } catch (e) { on = false; }
  }
  S.gyro = on; gy.ref = null; syncBtns();
  if (on) setTimeout(() => { if (S.gyro && !gy.has) { S.gyro = false; syncBtns(); toast('此裝置沒有陀螺儀，請改用拖曳轉視角'); } }, 1500);
}
$('bGyro').onclick = () => setGyro(!S.gyro);
function toast(msg) { const e = $('err'); e.textContent = msg; e.style.display = 'block'; setTimeout(() => (e.style.display = 'none'), 3200); }

// ---------- 雙眼（Cardboard）----------
async function setStereo(on) {
  S.stereo = on; document.body.classList.toggle('stereo', on); syncBtns();
  if (on) {
    try { await document.documentElement.requestFullscreen?.(); await screen.orientation?.lock?.('landscape'); } catch (e) { }
    if (!S.gyro) setGyro(true);
    if (!S.playing) $('bPlay').click();
  } else { try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) { } }
  layout();
}
$('bStereo').onclick = () => setStereo(true);
$('exitStereo').onclick = () => setStereo(false);
renderer.domElement.addEventListener('click', () => { if (S.stereo) go(S.i === LAST ? 0 : S.i + 1, true); });

// ---------- 雙眼／頭戴裝置內的字幕板（跟著視線）----------
const panel = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 340;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false }));
  m.position.set(0, -0.52, -1.9); m.rotation.x = -0.2; m.renderOrder = 20; m.visible = false;
  camera.add(m);
  return { c, t, m };
})();
function drawPanel(ch) {
  const x = panel.c.getContext('2d'), W = 1024, H = 340;
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.roundRect(0, 0, W, H, 28); x.fill();
  x.fillStyle = '#1d4ed8'; x.font = `700 40px ${FONT}`; x.textBaseline = 'top';
  x.fillText(`${S.i + 1}/${N}　${ch.title}`, 30, 22);
  x.fillStyle = '#1f2430'; x.font = `500 29px ${FONT}`;
  let ln = '', y = 82;
  for (const chr of ch.say) {
    if (x.measureText(ln + chr).width > W - 60) { x.fillText(ln, 30, y); y += 40; ln = ''; if (y > H - 80) break; }
    ln += chr;
  }
  if (y <= H - 80) x.fillText(ln, 30, y);
  if (renderer.xr.isPresenting || XR.session) { x.fillStyle = '#6b7280'; x.font = `500 21px ${FONT}`; x.fillText(XR_HINT, 30, H - 34); }
  panel.t.needsUpdate = true;
}

// ---------- WebXR：PC VR（SteamVR／Quest Link）與一體機 ----------
// 桌面模式＝1:100 模型放在面前；實境模式＝1:1 走進基地。
const XR = { mode: 'table', auto: true, yaw: 0, zoom: 1, pivot: new THREE.Vector3(), walkYaw: 0, k: 0, chapter: -1, prev: {}, snapReady: true, session: null };
const TABLE = { scale: 1 / 100, pos: new THREE.Vector3(0, 0.9, -1.25) };
const UP = THREE.Object3D.DEFAULT_UP;
const XR_HINT = '扳機 下一段｜握把 上一段｜A/X 桌面⇄1:1｜B/Y 播放暫停｜右搖桿 旋轉縮放｜左搖桿 行走';
const xrSupported = navigator.xr?.isSessionSupported
  ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : Promise.resolve(false);
xrSupported.then(ok => { $('bXR').hidden = !ok; });
for (let i = 0; i < 2; i++) {                               // 控制器射線
  const c = renderer.xr.getController(i);
  c.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1.2)]),
    new THREE.LineBasicMaterial({ color: 0x2563eb })));
  scene.add(c);
}
function shadowScale(k) {                                   // 模型縮小時陰影範圍要跟著縮
  Object.assign(sun.shadow.camera, { left: -110 * k, right: 110 * k, top: 110 * k, bottom: -110 * k, near: 1 * k, far: 400 * k });
  sun.shadow.camera.updateProjectionMatrix();
}
function xrWalkFrom(p, l) { XR.pivot.set(p.x, 0, p.z); XR.walkYaw = Math.atan2(l.x - p.x, -(l.z - p.z)); }
function xrToggleMode() {
  XR.auto = false;
  XR.mode = XR.mode === 'table' ? 'walk' : 'table';
  if (XR.mode === 'walk') xrWalkFrom(V(11, 8), V(30, 30));
}
async function enterXR() {
  try {
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(s);
    XR.session = s; XR.auto = true; XR.chapter = -1; XR.yaw = 0; XR.zoom = 1; XR.prev = {};
    scene.add(panel.m); panel.m.position.set(0, 1.75, -2.6); panel.m.rotation.set(0, 0, 0); panel.m.scale.setScalar(1.8);
    s.addEventListener('select', () => go(S.i === LAST ? 0 : S.i + 1, true));
    s.addEventListener('squeeze', () => go(S.i - 1, true));
    s.addEventListener('end', () => {
      XR.session = null; XR.k = 0;
      world.position.set(0, 0, 0); world.rotation.set(0, 0, 0); world.scale.setScalar(1);
      F.outer.visible = true; setLabelScale(1); shadowScale(1);
      camera.add(panel.m); panel.m.position.set(0, -0.52, -1.9); panel.m.rotation.set(-0.2, 0, 0); panel.m.scale.setScalar(1);
      S.free = false; drawPanel(CHAPTERS[S.i]); layout();
    });
    $('start')?.remove(); syncBtns();
    go(S.i, true);
  } catch (e) { toast('無法進入 VR：' + e.message); }
}
$('bXR').onclick = enterXR;
function setLabelScale(k) { for (const l of labels) l.scale.set(l.userData.base[0] * k, l.userData.base[1] * k, 1); }
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
function xrTick(ps, dt) {
  if (XR.chapter !== S.i) {                                 // 換段：最後一段自動切成 1:1（手動切換後不再自動）
    XR.chapter = S.i;
    if (XR.auto) { XR.mode = CHAPTERS[S.i].walk ? 'walk' : 'table'; if (XR.mode === 'walk') xrWalkFrom(V(...CHAPTERS[S.i].cam), V(...CHAPTERS[S.i].look)); }
  }
  for (const src of XR.session?.inputSources || []) {      // 搖桿與按鍵
    const gp = src.gamepad; if (!gp) continue;
    const dz = v => (Math.abs(v || 0) < 0.2 ? 0 : v);
    const ax = gp.axes.length >= 4 ? dz(gp.axes[2]) : dz(gp.axes[0]), ay = gp.axes.length >= 4 ? dz(gp.axes[3]) : dz(gp.axes[1]);
    const hand = src.handedness || 'none', was = XR.prev[hand] || [], now = gp.buttons.map(b => b.pressed);
    XR.prev[hand] = now;
    if (now[4] && !was[4]) xrToggleMode();
    if (now[5] && !was[5]) $('bPlay').click();
    if (XR.mode === 'table') {
      XR.yaw += ax * 1.6 * dt;
      XR.zoom = Math.min(5, Math.max(0.5, XR.zoom * Math.exp(-ay * 1.2 * dt)));
    } else if (hand === 'right') {                          // 右手：30° 分段轉向（避免暈眩）
      if (Math.abs(ax) < 0.3) XR.snapReady = true;
      else if (XR.snapReady && Math.abs(ax) > 0.6) { XR.snapReady = false; XR.walkYaw += Math.sign(ax) * Math.PI / 6; }
    } else {                                                // 左手：朝視線方向行走
      renderer.xr.getCamera().getWorldDirection(_f); _f.y = 0; _f.normalize();
      _r.crossVectors(_f, UP);
      _d.copy(_f).multiplyScalar(-ay).addScaledVector(_r, ax).multiplyScalar(3 * dt).applyAxisAngle(UP, -XR.walkYaw);
      XR.pivot.add(_d);
    }
  }
  const walk = XR.mode === 'walk', k = walk ? 1 : TABLE.scale * XR.zoom;
  const th = walk ? XR.walkYaw : Math.atan2(ps.l.x - ps.p.x, -(ps.l.z - ps.p.z)) + XR.yaw;
  world.rotation.set(0, th, 0); world.scale.setScalar(k);
  _d.copy(walk ? XR.pivot : _d.set(0, 0, 0)).multiplyScalar(k).applyAxisAngle(UP, th);
  world.position.copy(walk ? _f.set(0, 0, 0) : TABLE.pos).sub(_d);
  F.outer.visible = walk;
  panel.m.position.set(0, walk ? 0.8 : 1.75, walk ? -2.2 : -2.6); panel.m.rotation.x = walk ? -0.55 : 0;   // 1:1 時字幕板放低，不擋視線
  if (XR.k !== k) { XR.k = k; setLabelScale(1 / k); shadowScale(k); }
}

// ---------- 版面 ----------
function layout() {
  const w = innerWidth, h = innerHeight, asp = w / h;
  renderer.setSize(w, h); stereoFx.setSize(w, h);
  camera.aspect = asp;
  camera.userData.portraitBoost = asp < 1.15 ? Math.min(1.75, 1.15 / asp) : 1;
  const capH = S.stereo ? 0 : document.querySelector('.cap').offsetHeight;
  if (capH && !renderer.xr.isPresenting) camera.setViewOffset(w, h, 0, Math.round(capH * 0.42), w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', layout);

// ---------- 主迴圈 ----------
let last = performance.now();
const tmpQ = new THREE.Quaternion();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now; clock += dt;
  const ch = CHAPTERS[S.i];
  if (S.playing) {
    S.t += dt / ch.dur;
    if (S.t >= 1) {
      S.t = 1;
      if (S.speaking && (S.waited += dt) < ch.dur * 1.5) { /* 等旁白唸完 */ }
      else if (S.i < LAST) go(S.i + 1, true);
      else setPlaying(false);
    }
  }
  segs.forEach((b, k) => (b.style.width = (k < S.i ? 100 : k === S.i ? S.t * 100 : 0) + '%'));
  applyState(S.i, S.t);
  const ps = pose(S.i, S.t), xr = renderer.xr.isPresenting;
  panel.m.visible = S.stereo || xr;
  if (xr) xrTick(ps, dt);
  else if (!S.free) {
    camera.position.copy(ps.p); camera.lookAt(ps.l); controls.target.copy(ps.l);
    const fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(ps.fov / 2)) * camera.userData.portraitBoost));
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (S.gyro && gy.has) {
      if (!gy.ref) gy.ref = gy.q.clone().invert();
      camera.quaternion.multiply(tmpQ.copy(gy.ref).multiply(gy.q));
    }
  } else controls.update();
  if (S.stereo && !xr) stereoFx.render(scene, camera); else renderer.render(scene, camera);
});

// ---------- 開場 ----------
$('sTitle').textContent = `VR 設計講解｜${META.title}`;
$('sSub').textContent = META.exam;
$('sNote').textContent = `⚠ ${META.source}。面積為估算值，請自行複核。`;
$('sRefs').innerHTML = `<a href="${META.examUrl}" target="_blank" rel="noopener">考選部原題</a>　延伸參考：` +
  META.refs.map(r => `<a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>`).join('、');
const begin = voice => { S.voice = voice; $('start').remove(); syncBtns(); go(0, true); };
$('bStart').onclick = () => begin(true);
$('bStartMute').onclick = () => begin(false);
$('bStartXR').onclick = () => { S.voice = true; enterXR(); };
xrSupported.then(ok => { $('bStartXR').hidden = !ok; $('sXR').textContent = ok ? '已偵測到 VR 裝置，可直接進入。' : '未偵測到 VR 裝置：PC VR 請先用 Virtual Desktop、SteamVR 或 Quest Link 連上電腦並啟動 VR，再用 Chrome／Edge 開啟本頁（需 https 或 localhost）。'; });
$('cD').addEventListener('toggle', layout);
syncBtns(); showCaption(); applyState(0, 0);
window.__vr = { S, go, setPlaying, N, applyState, XR, world, setClock: v => { clock = v; } };          // 供自動化測試使用
