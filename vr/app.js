import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { StereoEffect } from './vendor/StereoEffect.js';
import { Sky } from './vendor/Sky.js';
// 版本切換：?case=b 為手繪解題圖版本，預設為示範方案
const QS = new URLSearchParams(location.search);
const CASE = QS.get('case') === 'a' ? 'a' : 'b';            // 預設為版本 B（黃仁澤手繪解法）
const VER = '?v=' + (new URL(import.meta.url).searchParams.get('v') || '0');   // 版本號：避免瀏覽器沿用舊快取
const REC = QS.has('rec');                                  // 逐格錄影模式：隱藏介面，由外部腳本逐格取圖
const scheme = await import((CASE === 'b' ? './scheme-b.js' : './scheme.js') + VER);
const { META, SITE, CONTEXT, ZONES, PROGRAM, CHECKS, CHAPTERS } = scheme;

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
renderer.toneMapping = THREE.NeutralToneMapping;           // 保留圖解配色，同時讓寫實模式的高光不過曝
$('gl').appendChild(renderer.domElement);
const stereoFx = new StereoEffect(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);
scene.fog = new THREE.Fog(0xdfe7ee, 260, 620);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1500);
scene.add(camera);
const world = new THREE.Group();                           // 所有模型都放這裡，VR 時整體縮放成桌上模型
scene.add(world);

const hemi = new THREE.HemisphereLight(0xffffff, 0xb9c2cc, 1.15);
scene.add(hemi);
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
  const uv = g.attributes.uv, W = x1 - x0, H = z1 - z0, D = y1 - y0;
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4), su = f < 2 ? D : W, sv = f === 2 || f === 3 ? D : H;
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
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
    if (!m || Array.isArray(m) || m.userData.o === undefined) return;
    const op = m.userData.o * a;
    m.opacity = op;
    if (!o.isSprite && !o.isLine) { m.transparent = op < 0.995; m.depthWrite = op > 0.5; }
  });
}
// ---------- 寫實模式：程序化細節貼圖（灰階，乘在原本的材質顏色上）----------
function detailTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'), R = (a, b) => a + Math.random() * (b - a), g = v => `rgb(${v | 0},${v | 0},${v | 0})`;
  let size = 2, sizeV = 0;
  const speckle = (n, lo, hi, r = 1.5) => { for (let i = 0; i < n; i++) { x.fillStyle = g(R(lo, hi)); x.fillRect(R(0, 512), R(0, 512), R(0.5, r), R(0.5, r)); } };
  if (kind === 'brick') {                                    // 2 m 見方：順砌磚＋灰縫
    x.fillStyle = g(150); x.fillRect(0, 0, 512, 512);
    const rows = 28, cols = 9, rh = 512 / rows, bw = 512 / cols;
    for (let r = 0; r < rows; r++) for (let k = -1; k < cols; k++) {
      const v = R(196, 255); x.fillStyle = `rgb(${v | 0},${(v * R(0.93, 1)) | 0},${(v * R(0.88, 0.98)) | 0})`;
      x.fillRect((k + (r % 2) * 0.5) * bw + 1.5, r * rh + 1.5, bw - 3, rh - 3);
    }
    speckle(2500, 150, 235);
  } else if (kind === 'wood') {                              // 1 m：直紋木理
    x.fillStyle = g(232); x.fillRect(0, 0, 512, 512); size = 1;
    for (let i = 0; i < 160; i++) {
      x.strokeStyle = `rgba(90,60,30,${R(0.05, 0.28)})`; x.lineWidth = R(0.6, 2.4);
      const x0 = R(0, 512), a = R(2, 9), p = R(0, 6);
      x.beginPath(); for (let y = 0; y <= 512; y += 16) x.lineTo(x0 + Math.sin(y / 70 + p) * a, y); x.stroke();
    }
  } else if (kind === 'paver') {                             // 2.4 m：60 cm 鋪面磚
    size = 2.4; x.fillStyle = g(168); x.fillRect(0, 0, 512, 512);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { x.fillStyle = g(R(222, 252)); x.fillRect(k * 128 + 1, r * 128 + 1, 126, 126); }
    speckle(5000, 200, 255);
  } else if (kind === 'grass') {                             // 2 m：草葉斑點
    x.fillStyle = g(215); x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${R(40, 90) | 0},${R(90, 150) | 0},${R(30, 70) | 0},${R(0.15, 0.5)})`; x.fillRect(R(0, 512), R(0, 512), R(1, 3), R(2, 7)); }
  } else if (kind === 'windows') {                           // 7×3.5 m：鄰房開窗
    size = 7; sizeV = 3.5; x.fillStyle = g(236); x.fillRect(0, 0, 512, 512); speckle(3000, 205, 245, 3);
    for (let k = 0; k < 2; k++) {
      const wx = 48 + k * 256, wy = 120;
      x.fillStyle = '#5d6a73'; x.fillRect(wx - 6, wy - 6, 172, 262);
      const gr = x.createLinearGradient(0, wy, 0, wy + 250); gr.addColorStop(0, '#8fb0c2'); gr.addColorStop(1, '#3f5565');
      x.fillStyle = gr; x.fillRect(wx, wy, 160, 250);
      x.fillStyle = '#5d6a73'; x.fillRect(wx + 77, wy, 6, 250); x.fillRect(wx, wy + 90, 160, 5);
      x.fillStyle = g(205); x.fillRect(wx - 14, wy + 256, 188, 12);
    }
    x.fillStyle = g(190); x.fillRect(0, 0, 512, 10);
  } else {                                                   // noise 3 m：混凝土／柏油顆粒
    size = 3; x.fillStyle = g(228); x.fillRect(0, 0, 512, 512); speckle(14000, 170, 255, 2.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / size, 1 / (sizeV || size));
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const TEX = {}, realMats = [];
const tex = (m, kind) => { realMats.push([m, kind]); return m; };   // 登記：寫實模式時替這個材質貼上細節

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
    const m = new THREE.Mesh(gg, tex(mat(0xeef1ec), 'noise'));
    m.position.y = -0.03; m.receiveShadow = true;
    g.add(m); return m;
  };
  ground(sq(TABLE_R), shapeOf(SITE.poly));                 // 基地挖洞，才能在分區章節看到地下室
  F.outer = ground(sq(420), sq(TABLE_R));                  // 外圈：VR 桌面模型模式時隱藏
  const pit = box(-0.5, 50.5, -0.5, 52.5, -4.6, -4.2, mat(0xcfd6dc), false, false);
  g.add(pit);
  for (const r of CONTEXT.roads) {
    g.add(flat(rect(r.x0, r.x1, r.y0, r.y1), 0.0, tex(mat(0xb8c0c8), 'noise')));
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
    const bm = box(b.x0, b.x1, b.y0, b.y1, 0, b.h, mat(0xd3d8de));
    const roofM = mat(0xc4c9cf); bm.material = [bm.material, bm.material, roofM, roofM, bm.material, bm.material];   // 屋頂不貼窗
    tex(bm.material[0], 'windows'); tex(roofM, 'noise');
    g.add(bm);
    if (b.y1 < 0) (F.southBlocks ||= []).push(bm);      // 南側鄰房：看剖立面時暫時隱藏
    if (b.name) { const lb = label(b.name, V((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.h + 1), { size: 0.85, color: '#374151', occlude: true }); g.add(lb); if (b.y1 < 0) F.southBlocks.push(lb); }
  }
  g.add(label(CONTEXT.gate.name, V(CONTEXT.gate.x, CONTEXT.gate.y, 1), { size: 0.8, color: '#b45309' }));
  // 指北
  const n = arrow(V(-34, 74, 0.3), V(-34, 88, 0.3), 0x1f2430, 1.2);
  g.add(n, label('北', V(-34, 90, 0.5), { size: 0.9 }));
}
{ // 基地本體
  const g = layer('site');
  F.siteSurf = flat(SITE.poly, 0.0, tex(mat(0xf7f3e8), 'noise'));
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

// ---------- 章節狀態 → 畫面 ----------
const amt = (i, t, k0, k1 = k0, ramp = 0.22) => (i < k0 || i > k1 ? 0 : i === k0 ? smooth(t / ramp) : 1);
const bump = t => smooth((t - 0.12) / 0.22) * (1 - smooth((t - 0.86) / 0.12));
const N = CHAPTERS.length, LAST = N - 1;
const OFF = scheme.INTRO || 0;                              // 版本可在最前面加序章；其餘邏輯用 j = i - OFF
let clock = 0;
// 第 4 段以後的量體、分區、動線、立面等圖層由各版本模組建立
const CTX = { V, box, flat, rect, line, label, arrow, flow, mat, setAmt, layer, F, amt, bump, smooth, lerp, LAST: LAST - OFF, scheme, world, CX, CY, tex };
const applyCase = (await import((CASE === 'b' ? './case-b.js' : './case-a.js') + VER)).build(CTX);
// 街道設施與鄰房細部：兩個版本共用，跟著周邊環境一起顯示
const extras = [];
for (const f of ['street-detail', 'context-detail']) {
  try { extras.push((await import(`./${f}.js${VER}`)).build(CTX)); } catch (e) { console.warn('細部模組載入失敗', f, e); }
}
function applyState(ri, t) {
  const i = ri - OFF;
  F.ctx.visible = F.site.visible = i >= 0 || t > 0.93;                        // 序章時隱藏城鎮模型
  setAmt(F.dims, amt(i, t, 0, 2));
  setAmt(F.siteLabel, i >= 0 && i <= 2 ? 1 : 0);
  setAmt(F.ana, amt(i, t, 1));
  setAmt(F.setback, amt(i, t, 2, 4));
  setAmt(F.legal, amt(i, t, 2));
  setAmt(F.prog, amt(i, t, 3));
  F.progBars.scale.y = i === 3 ? Math.max(0.001, smooth(t / 0.35)) : 1;
  applyCase(i, t);
  for (const a of extras) a(i, t);
  if (F.street) F.street.visible = F.ctx.visible;
  if (F.ctxDetail) F.ctxDetail.visible = F.ctx.visible;
  // 太陽：基地分析章節由東向西移動
  if (i === 1) { const p = sunPos(lerp(0.12, 0.9, t) * Math.PI); sunBall.position.copy(p); sun.position.copy(p); }
  else sun.position.copy(SUN_HOME);
  F.rings.forEach((r, k) => r.scale.setScalar(1 + 0.25 * Math.sin(clock * 3 + k)));
  for (const f of flows) f.dots.forEach((d, k) => d.position.copy(f.curve.getPointAt((((k / f.dots.length + clock * f.speed) % 1) + 1) % 1)));
}

// ---------- 寫實模式：天空、環境反射、材質貼圖、斜陽 ----------
const ELEV_CLIP = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 9.6 + CY)];   // 只留基地座標 y > -9.6
const SUN_REAL = V(-70, -55, 48);
const skyParams = s => { const u = s.material.uniforms; u.turbidity.value = 5; u.rayleigh.value = 1.1; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(SUN_REAL).normalize(); };
const sky = new Sky(); sky.scale.setScalar(1400); sky.visible = false; skyParams(sky); scene.add(sky);
let envTex = null, realOn = false;
function setReal(on) {
  if (on === realOn) return;
  realOn = on;
  if (on && !envTex) {                                       // 第一次啟用才產生貼圖與環境圖
    for (const k of ['brick', 'wood', 'paver', 'grass', 'windows', 'noise']) TEX[k] = detailTex(k);
    const s2 = new THREE.Scene(), sk = new Sky(); sk.scale.setScalar(60); skyParams(sk); s2.add(sk);
    const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(s2, 0, 0.1, 200).texture; pm.dispose();
  }
  for (const [m, k] of realMats) {
    m.map = on ? TEX[k] : null;
    m.bumpMap = on && k !== 'windows' && k !== 'grass' ? TEX[k] : null; m.bumpScale = k === 'brick' ? 1.6 : 0.8;
    m.needsUpdate = true;
  }
  scene.environment = on ? envTex : null; scene.environmentIntensity = 0.75;
  sky.visible = on;
  hemi.intensity = on ? 0.6 : 1.15; sun.intensity = on ? 3.4 : 2.1; sun.color.set(on ? 0xffe3c0 : 0xfff4e0);
  renderer.toneMappingExposure = on ? 0.8 : 1;
  $('bReal').classList.toggle('on', on);
}

// 鏡頭
const camEnd = k => ({ p: V(...(CHAPTERS[k].cam2 || CHAPTERS[k].cam)), l: V(...(CHAPTERS[k].look2 || CHAPTERS[k].look)) });
function pose(i, t) {
  const c = CHAPTERS[i];
  let p = V(...c.cam), l = V(...c.look);
  if (i > 0 && !c.walk) { const a = camEnd(i - 1), s = smooth(t / 0.3); p = a.p.lerp(p, s); l = a.l.lerp(l, s); }
  if (c.cam2) { const s = smooth((t - 0.45) / 0.25); p.lerp(V(...c.cam2), s); l.lerp(V(...(c.look2 || c.look)), s); }   // 章節中途換機位
  const ang = (c.walk ? 0.5 : 0.16) * (t - 0.5);
  if (c.walk) l = l.clone().sub(p).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang).add(p);
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
const sayOf = c => c.say + (c.tip ? '大師心法：' + c.tip : '');
function hush() { S.speaking = false; try { speechSynthesis.cancel(); } catch (e) { } }
function showCaption() {
  const c = CHAPTERS[S.i];
  $('cN').textContent = `${S.i + 1}/${N}`;
  $('cT').textContent = c.title;
  $('cP').textContent = c.say;
  $('cTip').hidden = !c.tip; $('cTip').textContent = c.tip ? '🎓 大師心法：' + c.tip : '';
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
  if (keepPlaying) speak(sayOf(CHAPTERS[S.i]));
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
  if (S.t < 0.05) speak(sayOf(CHAPTERS[S.i]));
};
$('bPrev').onclick = () => go(S.t > 0.15 && S.playing ? S.i : S.i - 1);
$('bNext').onclick = () => go(S.i + 1);
$('bReal').onclick = () => { S.real = !S.real; };
// 錄影用乾淨畫面：隱藏工具列與控制列，只留字幕；H 鍵切換
const setClean = on => { document.body.classList.toggle('clean', on); layout(); if (on) { toast('錄影畫面：按 H 顯示按鈕，空白鍵播放／暫停'); document.documentElement.requestFullscreen?.().catch(() => { }); } };
$('bClean').onclick = () => setClean(true);
// 匯出目前畫面的模型（.glb），可匯入 Twinmotion、D5、Unreal、Blender 等做高階渲染
async function exportGlb() {
  const { GLTFExporter } = await import('./vendor/GLTFExporter.js');
  setReal(true);
  return new Promise((res, rej) => new GLTFExporter().parse(world, res, rej, { binary: true, onlyVisible: true }));
}
$('bGlb').onclick = async () => {
  toast('正在匯出模型…');
  try {
    const buf = await exportGlb(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    a.download = `township-office-case-${CASE}.glb`; a.click();
  } catch (e) { toast('匯出失敗：' + e.message); }
};
$('bVoice').onclick = () => { S.voice = !S.voice; if (!S.voice) hush(); syncBtns(); };
controls.addEventListener('start', () => { if (!S.free) { S.free = true; setPlaying(false); } });
addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); $('bPlay').click(); }
  if (e.key === 'h' || e.key === 'H') setClean(!document.body.classList.contains('clean'));
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
  for (const chr of ch.say + (ch.tip ? '　🎓 ' + ch.tip : '')) {
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
  if (XR.mode === 'walk') xrWalkFrom(V(...CHAPTERS[LAST].cam), V(...CHAPTERS[LAST].look));
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
  const pv = CHAPTERS[S.i].pivot;                           // 該段場景不在基地上時，桌面模型改以它為中心
  _d.copy(walk ? XR.pivot : pv ? V(pv[0], pv[1], 0) : _d.set(0, 0, 0)).multiplyScalar(k).applyAxisAngle(UP, th);
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
  const capH = S.stereo || REC ? 0 : document.querySelector('.cap').offsetHeight;
  if (capH && !renderer.xr.isPresenting) camera.setViewOffset(w, h, 0, Math.round(capH * 0.42), w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', layout);

// ---------- 主迴圈 ----------
let last = performance.now();
const tmpQ = new THREE.Quaternion();
function tick(now) {
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
  // 寫實模式：最後一段自動啟用，或由按鈕強制；最後一段同時隱藏標註，畫面只留建築
  const clip = !!F.elevCut && !xr;                           // 版本模組要求剖立面視角時才裁切
  if (clip !== S.clip) { S.clip = clip; renderer.clippingPlanes = clip ? ELEV_CLIP : []; }
  setReal(S.real || !!CHAPTERS[S.i].real);
  if (realOn) { sun.position.copy(SUN_REAL); scene.fog.color.set(0xd9e4ee); }
  const hideLbl = !!CHAPTERS[S.i].real;
  if (hideLbl || S.lblHidden) {
    S.lblHidden = hideLbl; for (const l of labels) l.visible = !hideLbl;
    if (!hideLbl) F.siteLabel.userData.a = undefined;         // 讓基地標籤依章節重新套用顯示狀態
  }
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
}
renderer.setAnimationLoop(tick);

// ---------- 開場 ----------
$('sTitle').textContent = `VR 設計講解｜${META.title}`;
$('vA').classList.toggle('on', CASE === 'a'); $('vB').classList.toggle('on', CASE === 'b');
$('sList').textContent = `${N} 段：` + CHAPTERS.map(c => c.title.split('：')[0]).join(' → ');
$('sSub').textContent = META.exam;
$('sNote').textContent = `⚠ ${META.source}。面積為估算值，請自行複核。`;
$('sRefs').innerHTML = `<a href="${META.examUrl}" target="_blank" rel="noopener">考選部原題</a>` + (META.refs.length ? '　延伸參考：' +
  META.refs.map(r => `<a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>`).join('、') : '');
const begin = voice => { S.voice = voice; $('start').remove(); syncBtns(); go(0, true); };
$('bStart').onclick = () => begin(true);
$('bStartMute').onclick = () => begin(false);
$('bStartXR').onclick = () => { S.voice = true; enterXR(); };
xrSupported.then(ok => { $('bStartXR').hidden = !ok; $('sXR').textContent = ok ? '已偵測到 VR 裝置，可直接進入。' : '未偵測到 VR 裝置：PC VR 請先用 Virtual Desktop、SteamVR 或 Quest Link 連上電腦並啟動 VR，再用 Chrome／Edge 開啟本頁（需 https 或 localhost）。'; });
$('cD').addEventListener('toggle', layout);
syncBtns(); showCaption(); applyState(0, 0);
if (REC) document.body.classList.add('rec');
// 逐格算圖：設定章節與進度後立刻算一格並回傳 JPEG（不依賴實際時間，所以不會掉幀）
const frame = (i, t, c) => { S.i = i; S.t = t; S.playing = false; S.free = false; clock = c; tick(last); return renderer.domElement.toDataURL('image/jpeg', 0.93); };
window.__vr = { frame, CHAPTERS, exportGlb, S, go, setPlaying, N, applyState, XR, world, setClock: v => { clock = v; } };          // 供自動化測試使用
