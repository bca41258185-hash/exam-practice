// 畫面端：只負責畫圖與把滑鼠事件回報給主程序，行為邏輯都在 main.js。
const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { willReadFrequently: true });

let S = { state: 'idle', dir: 1, helmet: false };
let stStart = performance.now();
let look = { x: 0, y: 0 };
let bubble = null;

function resize() {
  cv.width = Math.round(innerWidth * devicePixelRatio);
  cv.height = Math.round(innerHeight * devicePixelRatio);
}
addEventListener('resize', resize);
resize();

pet.onState((s) => {
  if (s.state !== S.state) stStart = performance.now();
  S = s;
});
pet.onCursor((c) => { look = c; });
pet.onSay((text) => { bubble = { text, start: performance.now() }; });

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - last < 30) return;
  last = now;
  const k = cv.width / 200;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 200, 200);
  if (bubble && now - bubble.start > 3200) bubble = null;
  drawPet(ctx, {
    state: S.state, dir: S.dir, helmet: S.helmet, look,
    t: now / 1000, st: (now - stStart) / 1000,
    bubble: bubble && { text: bubble.text, age: (now - bubble.start) / 1000 },
  });
}
requestAnimationFrame(frame);

// 只有游標在角色的不透明像素上才攔截滑鼠，其餘區域點擊會穿透到桌面。
function opaqueAt(e) {
  const x = Math.round(e.clientX * devicePixelRatio), y = Math.round(e.clientY * devicePixelRatio);
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return false;
  return ctx.getImageData(x, y, 1, 1).data[3] > 20;
}

let hit = null, down = null, dragging = false;
addEventListener('mousemove', (e) => {
  if (down && !dragging && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
    dragging = true;
    pet.send('drag-start');
  }
  if (down) return;
  const h = opaqueAt(e);
  if (h !== hit) { hit = h; pet.send('hit', h); }
});
addEventListener('mouseleave', () => { if (!down && hit !== false) { hit = false; pet.send('hit', false); } });
addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !opaqueAt(e)) return;
  down = { x: e.screenX, y: e.screenY };
  dragging = false;
});
addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !down) return;
  pet.send(dragging ? 'drag-end' : 'click');
  down = null; dragging = false;
});
addEventListener('contextmenu', (e) => { e.preventDefault(); pet.send('menu'); });
addEventListener('wheel', (e) => { if (opaqueAt(e)) pet.send('roll', e.deltaY > 0 ? 1 : -1); }, { passive: true });
