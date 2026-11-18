// 桌面寵物主程序：視窗、位置物理、行為狀態機、選單。
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const POEMS = require('./poems');

const BASE = 200;           // 視窗邏輯邊長（畫布座標）
const TICK = 33;            // 毫秒
const FORWARD = process.platform !== 'linux'; // 點擊穿透的滑鼠轉送只有 Windows / macOS 支援

let win, tray;
let cfg = { scale: 1, top: true, helmet: false, talk: true, xp: 0 };
let pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
let state = 'idle', dir = 1, until = 0, phase = 0;
let grab = null, lastCur = null, maxSpeed = 0, bounces = 0;
let clicks = [], lastTouch = Date.now(), lastHour = new Date().getHours(), tickN = 0;

const cfgFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadCfg() {
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch { /* 首次啟動 */ }
  if (![0.75, 1, 1.5].includes(cfg.scale)) cfg.scale = 1;
}
function saveCfg() {
  try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch { /* 存不了就算了 */ }
}

const W = () => Math.round(BASE * cfg.scale);
const rnd = (a, b) => a + Math.random() * (b - a);
const now = () => Date.now();

function area() {
  const w = W();
  return screen.getDisplayNearestPoint({ x: Math.round(pos.x + w / 2), y: Math.round(pos.y + w / 2) }).workArea;
}
// 角色身體碰到螢幕邊緣時的視窗座標範圍
function limits() {
  const a = area(), w = W(), pad = 58 * cfg.scale;
  return {
    xmin: a.x - pad, xmax: a.x + a.width - w + pad,
    ymin: a.y - 40 * cfg.scale, ground: a.y + a.height - w + 12 * cfg.scale,
  };
}

function send(ch, arg) { if (win && !win.isDestroyed()) win.webContents.send(ch, arg); }
function pushState() { send('state', { state: state === 'peekout' ? 'walk' : state, dir, helmet: cfg.helmet }); }
function say(text, force) { stopPoem(); if (cfg.talk || force) send('say', text); }

// 吟詩：泡泡一次一行，一句一句唸，最後報出處。其他話插進來就停。
let poemTimer = null, lastPoem = -1;
function stopPoem() { if (poemTimer) { clearTimeout(poemTimer); poemTimer = null; } }
function recite(force) {
  if (!cfg.talk && !force) return;
  stopPoem();
  let i = Math.floor(Math.random() * POEMS.length);
  if (i === lastPoem) i = (i + 1) % POEMS.length;   // 不連續唸同一首
  lastPoem = i;
  const p = POEMS[i], m = p.by.match(/^(.*?)(《.*》)$/);
  const tail = p.by.length <= 10 || !m ? ['——' + p.by] : ['——' + m[1], m[2]];   // 出處太長就分兩次說
  const parts = [...p.lines, ...tail];
  let k = 0;
  (function next() {
    send('say', parts[k]);
    k += 1;
    poemTimer = k < parts.length ? setTimeout(next, 2600) : null;
  })();
}
function set(s, ms) { state = s; until = now() + (ms || 0); phase = 0; pushState(); }
function place() {
  if (!win || win.isDestroyed()) return;
  const w = W();
  // 每次都帶寬高，避免 Windows 縮放比例下透明視窗尺寸漂移
  win.setBounds({ x: Math.round(pos.x), y: Math.round(pos.y), width: w, height: w });
}

const GREET = [[5, '道友早安'], [11, '該用午膳了'], [14, '午後宜打坐'], [18, '道友晚安好'], [23, '夜深了，歇息吧']];
function greeting() {
  const h = new Date().getHours();
  let g = '子時靈氣最盛…';
  for (const [from, text] of GREET) if (h >= from) g = text;
  return g;
}
const CHAT = ['此地靈氣不錯', '道心要穩', '喝口靈茶吧', '閉目養神片刻', '今日宜修煉', '摸摸本座嘛', '想吃靈丹…', '大道三千～'];

// ---- 修為與境界 ----
const REALMS = ['煉氣', '築基', '金丹', '元嬰', '化神', '煉虛', '合體', '大乘', '渡劫'];
const NEED = [0, 100, 400, 1200, 3000, 7000, 15000, 30000, 60000];
let pending = false, lastPill = 0, lastSave = 0;
function realmOf(xp) { let i = 0; while (i + 1 < NEED.length && xp >= NEED[i + 1]) i++; return i; }
function realmText() {
  const i = realmOf(cfg.xp);
  return i + 1 < NEED.length ? `${REALMS[i]}期（${Math.floor(cfg.xp)}／${NEED[i + 1]}）` : `${REALMS[i]}期（圓滿）`;
}
function gain(n) {
  const before = realmOf(cfg.xp);
  cfg.xp += n;
  if (realmOf(cfg.xp) > before) pending = true;
  if (now() - lastSave > 30000) { lastSave = now(); saveCfg(); }
  if (tray) tray.setToolTip('桌面靈寵｜' + realmText());
}

// ---- 行為 ----
function decide() {
  const l = limits(), c = screen.getCursorScreenPoint();
  const idleFor = now() - lastTouch;
  const near = Math.abs(c.x - (pos.x + W() / 2)) < 500 * cfg.scale;
  const r = Math.random();
  if (idleFor > 180000 && r < 0.5) return set('sleep', rnd(30000, 90000));
  if (r < 0.45) { dir = Math.random() < 0.5 ? -1 : 1; return set('walk', rnd(2000, 6000)); }
  if (r < 0.52) return set('sleep', rnd(15000, 40000));
  if (r < 0.60) return startPeek();
  if (r < 0.68 && near) return startChase();
  if (r < 0.71) { say(CHAT[Math.floor(Math.random() * CHAT.length)]); }
  else if (r < 0.75) recite();
  if (pos.x < l.xmin || pos.x > l.xmax) { dir = pos.x < l.xmin ? 1 : -1; return set('walk', 1500); }
  set('idle', rnd(2000, 6000));
}
function startPeek() {
  const l = limits();
  dir = pos.x - l.xmin < l.xmax - pos.x ? -1 : 1;
  set('peekout', 15000);
}
function startChase() { set('chase', 8000); say('道友留步！'); }
function feed() {
  lastTouch = now();
  if (['drag', 'fall', 'tribulation'].includes(state)) return;
  if (now() - lastPill < 30000) return say('丹毒未消，等等再吃', true);
  lastPill = now();
  set('eat', 3200);
}

function tick() {
  if (!win || win.isDestroyed()) return;
  const l = limits(), k = cfg.scale, t = now();
  const cur = screen.getCursorScreenPoint();
  tickN++;

  if (state === 'drag') {
    if (lastCur) {
      vel.x = vel.x * 0.5 + (cur.x - lastCur.x) * 0.5;
      vel.y = vel.y * 0.5 + (cur.y - lastCur.y) * 0.5;
    }
    lastCur = cur;
    pos.x = cur.x - grab.x; pos.y = cur.y - grab.y;
  } else if (state === 'fall') {
    vel.y += 1.6 * k;
    pos.x += vel.x; pos.y += vel.y;
    maxSpeed = Math.max(maxSpeed, Math.hypot(vel.x, vel.y) / k);
    if (pos.x < l.xmin) { pos.x = l.xmin; vel.x = Math.abs(vel.x) * 0.6; bounces++; }
    if (pos.x > l.xmax) { pos.x = l.xmax; vel.x = -Math.abs(vel.x) * 0.6; bounces++; }
    if (pos.y < l.ymin) { pos.y = l.ymin; vel.y = Math.abs(vel.y) * 0.5; }
    if (pos.y >= l.ground) {
      pos.y = l.ground;
      if (vel.y > 9 * k) { vel.y = -vel.y * 0.45; vel.x *= 0.7; bounces++; }
      else if (maxSpeed > 38 || bounces >= 3) { set('dizzy', 2600); say('走火入魔了…'); }
      else set('idle', rnd(800, 2000));
    }
  } else {
    // 地面上的狀態：螢幕配置改變時落回地面
    if (pos.y < l.ground - 2) { vel = { x: 0, y: 0 }; maxSpeed = 0; bounces = 0; set('fall'); }
    else pos.y = l.ground;

    if (state === 'walk') {
      pos.x += dir * 1.6 * k;
      if (pos.x <= l.xmin && dir < 0) dir = 1, pushState();
      if (pos.x >= l.xmax && dir > 0) dir = -1, pushState();
    } else if (state === 'roll') {
      pos.x += dir * 9 * k;
      if (pos.x <= l.xmin) { pos.x = l.xmin; dir = 1; pushState(); }
      if (pos.x >= l.xmax) { pos.x = l.xmax; dir = -1; pushState(); }
    } else if (state === 'chase') {
      const dx = cur.x - (pos.x + W() / 2);
      const d = dx < 0 ? -1 : 1;
      if (d !== dir) { dir = d; pushState(); }
      if (Math.abs(dx) < 34 * k) { set('happy', 1500); say('抓到道友了！'); }
      else {
        pos.x = Math.max(l.xmin, Math.min(l.xmax, pos.x + dir * 4.2 * k));
        if (t > until) { set('idle', 2500); say('靈力耗盡…'); }
      }
    } else if (state === 'peekout') {
      const target = dir < 0 ? l.xmin - 46 * k : l.xmax + 46 * k;
      pos.x += dir * 2 * k;
      if ((dir < 0 && pos.x <= target) || (dir > 0 && pos.x >= target)) {
        pos.x = target; dir = -dir; set('peek', rnd(3500, 6000));
      }
    }

    // 修為：平時緩慢累積，打坐時加速
    if (tickN % 30 === 0) gain(state === 'sleep' ? 1 : 0.1);
    if (pending && ['idle', 'walk', 'sleep'].includes(state)) {
      pending = false; set('tribulation', 3300); say('天劫將至！', true);
    }

    if (t > until && state !== 'chase') {
      if (state === 'eat') { set('happy', 1500); say('修為 +30'); gain(30); }
      else if (state === 'tribulation') { saveCfg(); set('happy', 1800); say(`突破！${REALMS[realmOf(cfg.xp)]}期`, true); }
      else if (state === 'peek') { set('walk', 2500); }
      else decide();
    }
  }
  place();

  // 游標在視窗裡的位置（畫面座標）：角色自己走到靜止的游標底下時，畫面端靠這個判斷要不要接住滑鼠
  send('cursor-at', { x: cur.x - Math.round(pos.x), y: cur.y - Math.round(pos.y) });
  if (tickN % 3 === 0) {
    send('cursor', { x: (cur.x - (pos.x + W() / 2)) / k, y: (cur.y - (pos.y + W() * 0.75)) / k });
  }
  const h = new Date().getHours();
  if (h !== lastHour) { lastHour = h; say(`${'子丑寅卯辰巳午未申酉戌亥'[Math.floor(((h + 1) % 24) / 2)]}時了（${h} 點）`); }
}

// ---- 互動 ----
function onClick() {
  const t = now();
  lastTouch = t;
  clicks = clicks.filter((c) => t - c < 2500); clicks.push(t);
  if (['fall', 'drag', 'tribulation'].includes(state)) return;
  if (state === 'sleep') { set('startle', 900); say('修煉被打斷了！'); clicks = []; return; }
  if (clicks.length >= 5) { clicks = []; set('dizzy', 2600); say('道心不穩啦～'); return; }
  gain(2);
  set('happy', 1500);
}
function onDragStart() {
  if (!win) return;
  lastTouch = now();
  const c = screen.getCursorScreenPoint();
  grab = { x: c.x - pos.x, y: c.y - pos.y };
  lastCur = null; vel = { x: 0, y: 0 };
  win.setIgnoreMouseEvents(false);
  set('drag');
}
function onDragEnd() {
  if (state !== 'drag') return;
  const cap = 60 * cfg.scale;
  vel.x = Math.max(-cap, Math.min(cap, vel.x));
  vel.y = Math.max(-cap, Math.min(cap, vel.y));
  maxSpeed = 0; bounces = 0;
  set('fall');
}
function onRoll(d) {
  if (['drag', 'fall', 'dizzy', 'tribulation', 'eat'].includes(state)) return;
  lastTouch = now();
  dir = d > 0 ? 1 : -1;
  if (state !== 'roll') say('御劍！');
  set('roll', 1600);
}

function setScale(s) {
  const l0 = limits(), cx = pos.x + W() / 2;
  const onGround = pos.y >= l0.ground - 2;
  cfg.scale = s; saveCfg();
  pos.x = cx - W() / 2;
  if (onGround) pos.y = limits().ground;
  place();
}

function menu() {
  const login = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: '境界：' + realmText(), enabled: false },
    { type: 'separator' },
    { label: '餵靈丹（修為 +30）', click: feed },
    { label: '打坐修煉', click: () => set('sleep', 120000) },
    { label: '御劍飛行', click: () => onRoll(dir) },
    { label: '來追我', click: () => { lastTouch = now(); startChase(); } },
    { label: '躲貓貓', click: () => { lastTouch = now(); startPeek(); } },
    { label: '吟詩一首', click: () => recite(true) },
    { type: 'separator' },
    {
      label: '大小', submenu: [[0.75, '小'], [1, '中'], [1.5, '大']].map(([s, label]) => ({
        label, type: 'radio', checked: cfg.scale === s, click: () => setScale(s),
      })),
    },
    { label: '戴斗笠', type: 'checkbox', checked: cfg.helmet, click: (m) => { cfg.helmet = m.checked; saveCfg(); pushState(); } },
    { label: '會說話', type: 'checkbox', checked: cfg.talk, click: (m) => { cfg.talk = m.checked; saveCfg(); } },
    { label: '永遠在最上層', type: 'checkbox', checked: cfg.top, click: (m) => { cfg.top = m.checked; saveCfg(); win.setAlwaysOnTop(cfg.top, 'floating'); } },
    { label: '開機自動啟動', type: 'checkbox', checked: login, visible: process.platform !== 'linux', click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { type: 'separator' },
    { label: '結束', click: () => app.quit() },
  ]);
}

function create() {
  loadCfg();
  const w = W(), a = screen.getPrimaryDisplay().workArea;
  pos = { x: a.x + a.width - w - 80, y: a.y + a.height - w + 12 * cfg.scale };
  win = new BrowserWindow({
    x: Math.round(pos.x), y: Math.round(pos.y), width: w, height: w,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(cfg.top, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.loadFile('pet.html');
  win.once('ready-to-show', () => {
    win.showInactive();
    set('idle', 2500);
    setTimeout(() => say(greeting()), 600);
    setInterval(tick, TICK);
  });
  win.on('closed', () => { win = null; });

  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (!icon.isEmpty()) {
    tray = new Tray(icon.resize({ width: process.platform === 'darwin' ? 18 : 16 }));
    tray.setToolTip('桌面靈寵｜' + realmText());
    tray.on('click', () => tray.popUpContextMenu(menu()));
    tray.on('right-click', () => tray.popUpContextMenu(menu()));
  }
}

ipcMain.on('hit', (_e, h) => {
  if (!win || state === 'drag' || !FORWARD) return;
  win.setIgnoreMouseEvents(!h, { forward: true });
});
ipcMain.on('click', onClick);
ipcMain.on('drag-start', onDragStart);
ipcMain.on('drag-end', onDragEnd);
ipcMain.on('roll', (_e, d) => onRoll(d));
ipcMain.on('menu', () => { if (win) menu().popup({ window: win }); });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { set('happy', 1500); say('本座在此！', true); });
  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    // Linux 的透明視窗要等合成器就緒
    setTimeout(create, process.platform === 'linux' ? 300 : 0);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', saveCfg);
}

// 供自動化測試驅動
global.__pet = { set, say, feed, gain, onClick, onDragStart, onDragEnd, onRoll, startChase, startPeek, get: () => ({ state, dir, pos, cfg }) };
