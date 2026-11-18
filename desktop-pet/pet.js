// 畫面端：只負責畫圖與把滑鼠事件回報給主程序，行為邏輯都在 main.js。
const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { willReadFrequently: true });

let S = { state: 'idle', dir: 1, outfit: {} };
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
let cursorAt = null;   // 游標在視窗裡的位置（主程序每格送來），滑鼠沒動時也知道
pet.onCursorAt((c) => { cursorAt = c; });
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
    state: S.state, dir: S.dir, outfit: S.outfit, look,
    t: now / 1000, st: (now - stStart) / 1000,
    bubble: bubble && { text: bubble.text, age: (now - bubble.start) / 1000 },
  });
  // 滑鼠不動、角色自己走到游標底下（或走開）時不會有 mousemove，所以每格用游標位置再判斷一次
  if (!down && cursorAt) {
    const h = opaqueXY(cursorAt.x, cursorAt.y);
    if (h !== hit) { hit = h; pet.send('hit', h); }
  }
}
requestAnimationFrame(frame);

// 只有游標在角色的不透明像素上才攔截滑鼠，其餘區域點擊會穿透到桌面。
function opaqueAt(e) { return opaqueXY(e.clientX, e.clientY); }
function opaqueXY(cx, cy) {
  const x = Math.round(cx * devicePixelRatio), y = Math.round(cy * devicePixelRatio);
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
