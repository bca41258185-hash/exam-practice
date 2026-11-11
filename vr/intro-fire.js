// 序章：大師出現之前，人類畫考卷如同還不會用火——穴居人鑽木取火
import * as THREE from './vendor/three.module.min.js';

export function buildIntro(ctx) {
  const { V, label, mat, setAmt, layer, smooth, lerp, world } = ctx;
  const FX = 25, FY = -320;                                    // 火堆中心（基地座標）
  const DAY = new THREE.Color(0xdfe7ee), NIGHT = new THREE.Color(0x141a33), TMP = new THREE.Color();
  const g = layer('intro');
  const at = (o, x, y, h = 0) => (o.position.copy(V(x, y, h)), o);
  const mesh = (geo, m, shadow = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; return o; };

  // ---------- 地面、巨石、洞穴 ----------
  const disc = mesh(new THREE.CircleGeometry(26, 48).rotateX(-Math.PI / 2), mat(0x6b5136), false);
  g.add(at(disc, FX, FY, 0.05));
  const rockM = mat(0x77736c), darkRock = mat(0x5b574f);
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const rock = (x, y, h, sx, sy, sz, m = rockM, ry = 0) => { const o = mesh(rockG, m); o.scale.set(sx, sz, sy); o.rotation.y = ry; g.add(at(o, x, y, h)); return o; };
  [[38, -326, 1.4, 1.1, 0.9, 0.3], [9, -330, 1.8, 1.4, 1.2, 1], [34, -306, 2.2, 1.6, 1.5, 2], [6, -318, 1.5, 1.2, 1, 0.7], [42, -316, 1.2, 1, 0.8, 1.6]]
    .forEach(([x, y, a, b, c, r]) => rock(x, y, c * 0.6, a, b, c, rockM, r));
  // 洞口：兩側岩柱＋拱頂（火堆西北方）
  const CXv = 16.5, CYv = -310.5, cave = new THREE.Group();
  for (const [dx, dy] of [[-3.2, -2.4], [3.2, 2.4]]) for (let k = 0; k < 3; k++) {
    const o = mesh(rockG, k % 2 ? darkRock : rockM); o.scale.set(1.5 - k * 0.15, 1.3, 1.4); o.rotation.y = k;
    cave.add(at(o, CXv + dx, CYv + dy, 0.9 + k * 1.8));
  }
  const top = mesh(rockG, rockM); top.scale.set(5.4, 1.6, 2.6); top.rotation.y = Math.atan2(2.4, 3.2);
  cave.add(at(top, CXv, CYv, 6));
  const hole = mesh(new THREE.PlaneGeometry(5.6, 5.4), mat(0x0d0b0a), false);
  hole.rotation.y = Math.atan2(25, 33); cave.add(at(hole, CXv - 0.6, CYv + 0.9, 2.7));
  g.add(cave);

  // ---------- 火堆：石圈、交叉木柴、火焰、光 ----------
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2;
    rock(FX + Math.cos(a) * 1.05, FY + Math.sin(a) * 1.05, 0.15, 0.24, 0.22, 0.18, darkRock, a);
  }
  const logM = mat(0x5a3a1e), logG = new THREE.CylinderGeometry(0.09, 0.11, 1.5, 7);
  for (let k = 0; k < 3; k++) { const o = mesh(logG, logM); o.rotation.set(Math.PI / 2 - 0.25, k * 2.1, 0); g.add(at(o, FX, FY, 0.25)); }
  const flame = new THREE.Group(); at(flame, FX, FY, 0.3);
  const flames = [[0xff6a00, 0.42, 1.5, 0, 0], [0xff9a1a, 0.32, 1.15, 0.14, 0.08], [0xffd23f, 0.22, 0.85, -0.1, -0.06], [0xffb000, 0.26, 1.0, 0.04, -0.15]].map(([c, r, h, ox, oz], k) => {
    const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7).translate(0, h / 2, 0), mat(c, 1, { emissive: c, emissiveIntensity: 2.4 }));
    o.position.set(ox, 0, oz); o.userData.k = k; flame.add(o); return o;
  });
  g.add(flame);
  const light = new THREE.PointLight(0xff9a40, 0, 40, 2); at(light, FX, FY, 1.4); g.add(light);
  const S0 = V(26.9, -319.1, 0.4);                             // 火星起點：鑽木處
  const sparkM = mat(0xffe08a, 1, { emissive: 0xffc040, emissiveIntensity: 3 }), sparkG = new THREE.SphereGeometry(0.04, 6, 4);
  const sparks = Array.from({ length: 7 }, (_, k) => { const o = new THREE.Mesh(sparkG, sparkM); o.userData.r = [Math.sin(k * 7.1), Math.cos(k * 3.7), 0.6 + (k % 3) * 0.3]; g.add(o); return o; });

  // ---------- 穴居人 ----------
  const fur = mat(0x7a4a26), skin = mat(0xc58c5c), hair = mat(0x2a1a10), wood = mat(0x8a5a2b), slate = mat(0x8d8a82);
  const bodyG = new THREE.CapsuleGeometry(0.27, 0.45, 4, 8), headG = new THREE.SphereGeometry(0.19, 10, 8), hairG = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, 1.4);
  const limbG = new THREE.CylinderGeometry(0.075, 0.065, 0.62, 6).translate(0, -0.31, 0), legG = new THREE.CylinderGeometry(0.1, 0.085, 0.62, 6).translate(0, -0.31, 0);
  const man = (x, y, kneel) => {
    const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
    at(root, x, y, 0.05); root.rotation.y = Math.atan2(FX - x, -(FY - y));   // 面向火堆（本地 +z 為前）
    b.add(mesh(bodyG, fur).translateY(0.98), mesh(headG, skin).translateY(1.5), mesh(hairG, hair).translateY(1.53));
    const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0.33 * s, 1.26, 0); p.add(mesh(limbG, skin)); b.add(p); return p; });
    const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0.13 * s, 0.64, 0); p.add(mesh(legG, fur)); b.add(p); return p; });
    if (kneel) { b.position.y = -0.4; legs.forEach(l => (l.rotation.x = -1.35)); }
    g.add(root); return { root, b, arms, legs, kneel };
  };
  const men = [man(27.6, -318.6, true), man(21.8, -321.2), man(22.6, -318.0), man(28.4, -321.8)];
  const drill = new THREE.Group(); drill.position.set(0, 0.3, 0.5); men[0].b.add(drill);   // 鑽木：直立木棍＋底板
  drill.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 5).translate(0, 0.3, 0), wood), mesh(new THREE.BoxGeometry(0.5, 0.05, 0.14), wood));
  const club = mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.8, 6).translate(0, -0.85, 0), wood); men[3].arms[1].add(club);
  // 石板「配置圖」：舉在頭上
  const tablet = new THREE.Group(); tablet.position.set(0, -0.72, 0.05); men[1].arms[0].add(tablet);
  tablet.add(mesh(new THREE.BoxGeometry(0.55, 0.05, 0.4), slate));
  const groove = mat(0x2b2925);
  [[0, -0.1, 0.4, 0.03], [-0.1, 0.05, 0.03, 0.22], [0.12, 0.06, 0.18, 0.12]].forEach(([px, pz, w, d]) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), groove); o.position.set(px, 0.03, pz); tablet.add(o);
  });
  const lblDark = label('還不會用火的年代', V(FX, FY, 3.4), { color: '#e5e7eb', bg: 'rgba(20,26,51,.85)', size: 1.1 });
  const lblFire = label('🔥 第一道火花', V(FX, FY, 3.4), { color: '#7c2d12', bg: 'rgba(255,237,213,.95)', size: 1.1 });
  g.add(lblDark, lblFire);

  // ---------- 場景燈光：夜晚時暫時調暗（離開序章時還原） ----------
  let lights = null, dimmed = false;
  const sceneOf = () => world && world.parent && world.parent.isScene ? world.parent : null;
  const dim = f => {
    const sc = sceneOf(); if (!sc) return;
    if (!lights) { lights = []; sc.traverse(o => { if (o.isLight && !o.isPointLight && !o.isSpotLight) lights.push([o, o.intensity]); }); }
    lights.forEach(([o, i0]) => (o.intensity = i0 * f));
  };

  return function apply(j, t) {
    const sc = sceneOf();
    if (j !== -1) {
      setAmt(g, 0); light.intensity = 0;
      if (dimmed) { dim(1); dimmed = false; }
      if (sc) { if (sc.background && sc.background.isColor) sc.background.copy(DAY); if (sc.fog) sc.fog.color.copy(DAY); }
      return;
    }
    t = Math.min(1, Math.max(0, +t || 0));
    const now = performance.now() * 0.001;
    setAmt(g, 1);
    const night = smooth(t / 0.15) * (1 - smooth((t - 0.9) / 0.1));    // 開場轉夜、結尾回到白天底色
    if (sc) {
      TMP.copy(DAY).lerp(NIGHT, night);
      if (sc.background && sc.background.isColor) sc.background.copy(TMP);
      if (sc.fog) sc.fog.color.copy(TMP);
    }
    dim(lerp(1, 0.06, night)); dimmed = true;
    const fire = smooth((t - 0.5) / 0.12);                             // 0 → 1 點燃
    const pre = t < 0.5;
    // 火焰閃爍＋點光源
    flame.visible = fire > 0.001;
    flames.forEach(o => {
      const k = o.userData.k, f = 1 + 0.18 * Math.sin(now * 13 + k * 2.1) + 0.1 * Math.sin(now * 23 + k);
      o.scale.set(fire * (1 + 0.08 * Math.sin(now * 17 + k)), Math.max(0.001, fire * f), fire);
      o.rotation.y = now * (0.8 + k * 0.3);
    });
    light.intensity = fire * (260 + 40 * Math.sin(now * 15) + 25 * Math.sin(now * 37));
    // 火星：0.4 → 0.5 從木棍冒出
    const sp = (t - 0.4) / 0.1, onSp = sp > 0 && sp < 1.3;
    sparks.forEach((o, k) => {
      const [rx, rz, up] = o.userData.r, ph = (sp * 2.5 + k * 0.37) % 1;
      o.visible = onSp;
      if (onSp) o.position.set(S0.x + rx * ph * 0.4, S0.y + ph * up, S0.z + rz * ph * 0.4);
    });
    // 穴居人：發抖／鑽木 → 歡呼跳躍
    men.forEach((m, k) => {
      const shiver = pre ? 0.025 * Math.sin(now * 60 + k * 1.7) : 0;
      const jump = fire * Math.max(0, Math.sin(now * 7 + k * 1.6)) * 0.35;
      m.b.position.x = shiver;
      m.b.position.y = (m.kneel ? -0.4 : 0) + (m.kneel ? jump * 0.4 : jump);
      m.arms.forEach((a, s) => {
        const side = s ? 1 : -1;
        if (m.kneel && pre) { a.rotation.set(-1.15 + 0.15 * Math.sin(now * 18 + s * Math.PI), 0, -side * 0.35); return; }
        const up = fire * (2.6 + 0.2 * Math.sin(now * 9 + k + s));   // 抱胸取暖 → 雙手高舉
        a.rotation.set(pre ? -0.5 : 0, 0, pre ? -side * 0.25 : side * (0.15 + up));
      });
    });
    drill.visible = pre;
    drill.rotation.y = pre ? Math.sin(now * 18) * 1.4 : 0;
    tablet.visible = fire > 0.3;
    lblDark.visible = pre; lblFire.visible = !pre;
  };
}
