// 桌面寵物主程序：視窗、位置物理、行為狀態機、選單。
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, shell, powerMonitor, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const POEMS = require('./poems');
const Q = require('./quotes');

const BASE = 200;           // 視窗邏輯邊長（畫布座標）
const TICK = 33;            // 毫秒
const FORWARD = process.platform !== 'linux'; // 點擊穿透的滑鼠轉送只有 Windows / macOS 支援

let win, tray;
let cfg = { scale: 1, top: true, stretch: 50, water: true, eyes: true, lastMorning: '', notes: [], todos: { date: '', items: [] }, scrollPos: null, species: 'cat', hat: 'none', robe: 'qing', gear: 'none', talk: true, xp: 0 };

// 裝扮的選項：[設定值, 選單上的名字]
const SPECIES = [['cat', '靈貓'], ['fox', '狐仙'], ['rabbit', '玉兔'], ['panda', '熊貓'], ['dragon', '小青龍']];
const HATS = [['none', '不戴'], ['douli', '斗笠'], ['guan', '道冠玉簪'], ['jin', '書生方巾'], ['lotus', '蓮花冠'], ['mask', '狐狸面具'], ['wreath', '花環']];
const ROBES = [['qing', '青'], ['yuebai', '月白'], ['fei', '緋紅'], ['mo', '墨黑'], ['zixia', '紫霞'], ['jin', '金黃']];
const GEARS = [['none', '不帶'], ['sword', '背劍'], ['gourd', '酒葫蘆'], ['fan', '摺扇']];
let pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
let state = 'idle', dir = 1, until = 0, phase = 0;
let grab = null, lastCur = null, maxSpeed = 0, bounces = 0;
let clicks = [], lastTouch = Date.now(), lastHour = new Date().getHours(), tickN = 0;

const cfgFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadCfg() {
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch { /* 首次啟動 */ }
  if (![0.75, 1, 1.5].includes(cfg.scale)) cfg.scale = 1;
  if (!STRETCH.includes(cfg.stretch)) cfg.stretch = 50;
  if (cfg.xpVersion !== 2) {
    let r = 0; while (r + 1 < OLD_NEED.length && cfg.xp >= OLD_NEED[r + 1]) r++;
    cfg.xp = NEED[r]; cfg.xpVersion = 2;
    saveCfg();   // 換算完馬上存，免得下次又換算一次
  }
  if (process.env.PET_TEST_XP) cfg.xp = Number(process.env.PET_TEST_XP) || 0;   // 測試用：假裝修為是這個數字（不存檔）
  if (!Array.isArray(cfg.notes)) cfg.notes = [];
  cfg.notes = cfg.notes.filter((n) => n && typeof n.text === 'string' && Number.isFinite(n.at));
  if (!cfg.todos || !Array.isArray(cfg.todos.items)) cfg.todos = { date: '', items: [] };
  if (cfg.helmet === true && cfg.hat === 'none') cfg.hat = 'douli';   // 舊版的「戴斗笠」
  delete cfg.helmet;
  for (const [key, list] of [['species', SPECIES], ['hat', HATS], ['robe', ROBES], ['gear', GEARS]]) {
    if (!list.some(([v]) => v === cfg[key])) cfg[key] = list[0][0];
  }
}
function saveCfg() {
  if (process.env.PET_TEST_XP) return;   // 測試模式：不寫入真正的存檔
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
function pushState() { send('state', { state: state === 'peekout' ? 'walk' : state, dir, outfit: { species: cfg.species, hat: cfg.hat, robe: cfg.robe, gear: cfg.gear, carry: !!(deliver || carrying), realm: realm(), done: isDone(), move: strikeMove } }); }
function say(text, force) { stopPoem(); if (cfg.talk || force) send('say', text); }

// 吟詩：泡泡一次一行，一句一句唸，最後報出處。其他話插進來就停。
let poemTimer = null, lastPoem = -1;
function stopPoem() { if (poemTimer) { clearTimeout(poemTimer); poemTimer = null; } }
function encourage(force) {   // 一句勵志詩詞（附作者），或一句仙俠打氣話
  if (!cfg.talk && !force) return;
  if (Math.random() < 0.6) sayLines(Q.verseLines(Q.pick(Q.VERSE)));
  else say(Q.pick(Q.CHEER), force);
}
function recite(force) {
  if (!cfg.talk && !force) return;
  stopPoem();
  let i = Math.floor(Math.random() * POEMS.length);
  if (i === lastPoem) i = (i + 1) % POEMS.length;   // 不連續唸同一首
  lastPoem = i;
  const p = POEMS[i], m = p.by.match(/^(.*?)(《.*》)$/);
  const tail = p.by.length <= 10 || !m ? ['——' + p.by] : ['——' + m[1], m[2]];   // 出處太長就分兩次說
  sayLines([...p.lines, ...tail]);
}
function sayLines(parts, gap) {   // 泡泡一次一行，依序說完；其他話插進來就停
  stopPoem();
  let k = 0;
  (function next() {
    send('say', parts[k]);
    k += 1;
    poemTimer = k < parts.length ? setTimeout(next, gap || 2600) : null;
  })();
}

// ---- 起身活動提醒：用滑鼠鍵盤多久沒動來判斷你是不是一直坐著
const STRETCH = [0, 30, 45, 50, 60];   // 分鐘；0 是關掉
const BREAK_SEC = 180;                 // 滑鼠鍵盤停超過三分鐘，就算你起來休息過了
let sitSince = Date.now(), lastRemind = 0, reminded = false, praise = false;
function sittingMinutes() { return Math.floor((Date.now() - sitSince) / 60000); }
function startTaichi(mins) {
  if (['drag', 'fall', 'tribulation', 'roll', ...KUNGFU].includes(state)) return false;
  lastTouch = now();
  set('taichi', 15000);
  sayLines([mins ? `坐了 ${mins} 分鐘了！` : '來打一套太極！', '起來跟我動一動～', '吸氣……', '吐氣……', '轉轉脖子、伸伸腰', '看看遠方，讓眼睛歇歇'], 2500);
  return true;
}
let waterAcc = 0, eyeAcc = 0, lastHealth = 0;   // 累積的使用秒數；上次提醒的時間（免得兩個提醒擠在一起）
function healthFree() { return !BUSY.includes(state) && !['taichi', 'drink', 'gaze', 'fireworks', 'spin'].includes(state) && !deliver && Date.now() - lastHealth > 90000; }
function startDrink() {
  lastHealth = Date.now(); lastTouch = now();
  set('drink', 4200);
  const w = Q.pick(Q.WATER);
  sayLines(['道友也喝口水吧', ...Q.verseLines(w)], 2600);
}
function startGaze() {
  lastHealth = Date.now(); lastTouch = now();
  set('gaze', 20000);   // 陪你看遠方 20 秒
  const f = Q.pick(Q.FAR);
  sayLines(['看看 6 公尺外', '遠眺 20 秒～', ...Q.verseLines(f)], 3200);
  setTimeout(() => { if (state === 'gaze') { gain(5); stat('gazes'); set('happy', 1400); say('眼睛舒服多了吧，修為 +5', true); } }, 20000);
}
let activeSec = 0, awaySec = 0, awayGained = 0;
function checkXp(idle) {
  if (idle < 60) {
    awaySec = 0; awayGained = 0;
    activeSec += 10;
    if (activeSec >= 60) { activeSec -= 60; gain(1); daily().min += 1; stat('totalMin'); }
  } else {
    awaySec += 10;
    if (awaySec >= 120 && awayGained < 120) { awaySec -= 120; awayGained += 1; gain(1); }   // 每兩分鐘 +1，最多 120
  }
}
function checkHealth(idle) {
  checkXp(idle);
  if (idle >= 60) return;   // 你不在電腦前：不累積
  waterAcc += 10; eyeAcc += 10;
  if (cfg.eyes && eyeAcc >= 20 * 60 && healthFree()) { eyeAcc = 0; startGaze(); return; }
  if (cfg.water && waterAcc >= 60 * 60 && healthFree()) { waterAcc = 0; startDrink(); }
}

// ---- 早安問三件事：每天第一次用電腦時
function morningDue() { return cfg.lastMorning !== today(); }
function morning() {
  cfg.lastMorning = today(); saveCfg();
  set('happy', 1600);
  const has = todos().items.some((x) => x.text);
  const h = new Date().getHours(), early = h >= 5 && h < 11;   // 早上才說「早」和朝陽；晚上第一次開機改用打氣話
  const hello = early ? '道友早！' : '道友好！', line = early ? Q.pick(Q.MORNING) : Q.pick(Q.CHEER);
  if (has) { sayLines([hello, line, '今天的三件事，記得喔'], 2600); openScroll(); return; }
  sayLines([hello, line, '今天最重要的三件事', '是什麼？寫給我吧'], 2600);
  openScroll();
}

function checkStretch() {
  let idle = 0;
  try { idle = powerMonitor.getSystemIdleTime(); } catch { return; }
  if (morningDue() && idle < 60 && !BUSY.includes(state)) { morning(); return; }   // 電腦整晚沒關，隔天回來也算
  checkHealth(idle);
  checkThunder(idle);
  if (idle >= BREAK_SEC) {   // 你離開座位了：重新計時；如果是被提醒之後才去休息，回來時誇你
    if (reminded) praise = true;
    sitSince = Date.now(); reminded = false;
    return;
  }
  if (praise && idle < 5 && !['drag', 'fall', 'tribulation'].includes(state)) {
    praise = false; gain(15); stat('breaks'); set('happy', 1600); sayLines(['休息得好！修為 +15', Q.pick(Q.CHEER)]);
    return;
  }
  if (!cfg.stretch) return;
  const mins = sittingMinutes();
  if (mins >= cfg.stretch && Date.now() - lastRemind > 10 * 60000) {   // 沒起來的話，十分鐘後再提醒一次
    if (healthFree() && startTaichi(mins)) { lastRemind = Date.now(); lastHealth = Date.now(); reminded = true; }
  }
}
function set(s, ms) { state = s; until = now() + (ms || 0); phase = 0; pushState(); }
let lastBounds = '';
function place(p) {
  if (!win || win.isDestroyed()) return;
  const w = W(), q = p || pos, x = Math.round(q.x), y = Math.round(q.y);
  const key = `${x},${y},${w}`;
  if (key === lastBounds) return;
  lastBounds = key;
  // 每次都帶寬高，避免 Windows 縮放比例下透明視窗尺寸漂移
  win.setBounds({ x, y, width: w, height: w });
}

// 90 Hz：行為邏輯照舊每 33 毫秒算一次位置（速度、時間都不變），
// 畫面端每畫一格（最多每秒 90 格）就來要一次，視窗位置在上一次和這一次之間平滑補間。
let prevPos = { x: 0, y: 0 }, tickAt = 0, lastFrameMsg = 0;
function smoothPlace() {
  lastFrameMsg = Date.now();
  if (state === 'drag' && grab) {   // 拖曳時直接跟著游標，不補間才不會覺得拖不動
    const c = screen.getCursorScreenPoint();
    pos.x = c.x - grab.x; pos.y = c.y - grab.y;
    return place();
  }
  const a = Math.min(1, (Date.now() - tickAt) / TICK);
  place({ x: prevPos.x + (pos.x - prevPos.x) * a, y: prevPos.y + (pos.y - prevPos.y) * a });
}
const fromComp = (e) => comp && !comp.win.isDestroyed() && e.sender === comp.win.webContents;
ipcMain.on('frame', (e) => (fromComp(e) ? compPlace() : smoothPlace()));

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
// 約一週修到渡劫（平常一天大約 800 修為）；渡劫期修到 6000 就圓滿，停在那裡
const NEED = [0, 150, 500, 1000, 1600, 2300, 3100, 4000, 5000];
const MAX_XP = 6000;
const OLD_NEED = [0, 100, 400, 1200, 3000, 7000, 15000, 30000, 60000];   // 舊制，換算用
// 每個境界解鎖的功夫與特效（角色、裝扮一直都開放；工作工具永遠不鎖）
const UNLOCK = ['點、拖、甩、吟詩', '腳下靈氣圈、來追我', '金丹微光、御劍飛行', '壁虎遊牆功、元嬰小分身',
  '雙擊出招', '畫圈縮地成寸', '召喚同門', '腳踏祥雲、大乘語錄', '天雷閃避'];
const ABILITY = { chase: 1, roll: 2, climb: 3, strike: 4, blink: 5, companion: 6, thunder: 8 };
function realm() { return realmOf(cfg.xp); }
function can(a) { return realm() >= ABILITY[a]; }
function lockLabel(label, a) { return can(a) ? label : `${label}（${REALMS[ABILITY[a]]}解鎖）`; }
let pending = false, lastPill = 0, lastSave = 0;
function realmOf(xp) { let i = 0; while (i + 1 < NEED.length && xp >= NEED[i + 1]) i++; return i; }
function isDone() { return cfg.xp >= MAX_XP; }
function realmText() {
  const i = realmOf(cfg.xp);
  if (isDone()) return '渡劫圓滿';
  return `${REALMS[i]}期（${Math.floor(cfg.xp)}／${i + 1 < NEED.length ? NEED[i + 1] : MAX_XP}）`;
}
function gain(n) {
  const before = realmOf(cfg.xp), wasDone = isDone();
  cfg.xp = Math.min(MAX_XP, cfg.xp + n);
  if (realmOf(cfg.xp) > before || (!wasDone && isDone())) pending = true;
  if (now() - lastSave > 30000) { lastSave = now(); saveCfg(); }
  if (tray) tray.setToolTip('桌面靈寵｜' + realmText());
  pushState();
}
// 今天的次數（摸頭上限、靈丹三顆、早上寫三件事的獎勵）
function daily() {
  if (!cfg.daily || cfg.daily.date !== today()) cfg.daily = { date: today(), clicks: 0, pills: 0, wrote: false, min: 0 };
  return cfg.daily;
}
function stat(key, n) {
  cfg.stats = cfg.stats || {};
  cfg.stats[key] = (cfg.stats[key] || 0) + (n || 1);
  const d = today();
  if (cfg.stats.lastDay !== d) { cfg.stats.lastDay = d; cfg.stats.days = (cfg.stats.days || 0) + 1; }
}
function touchGain() {   // 摸頭、點牠：每次 +1，每天最多 30
  const d = daily();
  if (d.clicks < 30) { d.clicks += 1; gain(1); }
}

// ---- 行為 ----
function decide() {
  if (poemTimer) return set('idle', 1500);   // 話還沒說完（吟詩、提醒、早安）：先站著說完，不跑去追人
  const l = limits(), c = screen.getCursorScreenPoint();
  const idleFor = now() - lastTouch;
  const near = Math.abs(c.x - (pos.x + W() / 2)) < 500 * cfg.scale;
  const r = Math.random();
  if (idleFor > 180000 && r < 0.5) return set('sleep', rnd(30000, 90000));
  if (r < 0.45) { dir = Math.random() < 0.5 ? -1 : 1; return set('walk', rnd(2000, 6000)); }
  if (r < 0.52) return set('sleep', rnd(15000, 40000));
  if (r < 0.60) return startPeek();
  if (r < 0.68 && near && can('chase')) return startChase();
  if (r < 0.69) { say(Math.random() < 0.5 ? CHAT[Math.floor(Math.random() * CHAT.length)] : Q.pick(Q.CHEER)); }
  else if (r < 0.72) encourage();
  else if (r < 0.75) recite();
  if (pos.x < l.xmin || pos.x > l.xmax) { dir = pos.x < l.xmin ? 1 : -1; return set('walk', 1500); }
  set('idle', rnd(2000, 6000));
}
function startPeek() {
  const l = limits();
  dir = pos.x - l.xmin < l.xmax - pos.x ? -1 : 1;
  set('peekout', 15000);
}
const KUNGFU = ['leap', 'hover', 'land', 'climb', 'hang', 'vanish', 'appear'];   // 輕功動作（都在空中，自己處理位置）
const BUSY = ['drag', 'fall', 'tribulation', 'roll', ...KUNGFU];

// ---- 雙擊出招（化神）
let strikeMove = '', lastClickAt = 0;
const MOVES = { palm: '降龍十八掌！', circle: '太極生兩儀～', bell: '金鐘罩！', flick: '彈指神通！' };
function startStrike() {
  const keys = Object.keys(MOVES);
  strikeMove = keys[Math.floor(Math.random() * keys.length)];
  stat('strikes'); lastTouch = now();
  set('strike', 1700); say(MOVES[strikeMove], true);
}

// ---- 畫圈縮地成寸（煉虛）：游標連畫三圈，牠消失、出現在圈的中心
let loopPts = [], lastLoop = 0, blinkTo = null;
function watchLoop(cur, t) {
  const last = loopPts[loopPts.length - 1];
  if (!last || Math.hypot(cur.x - last.x, cur.y - last.y) >= 4) loopPts.push({ x: cur.x, y: cur.y, t });
  loopPts = loopPts.filter((p) => t - p.t < 3000);
  if (loopPts.length < 12 || t - lastLoop < 6000 || !can('blink')) return;
  let turn = 0;
  for (let i = 2; i < loopPts.length; i++) {
    const a = loopPts[i - 2], b = loopPts[i - 1], c = loopPts[i];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x), a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = a2 - a1; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    turn += d;
  }
  const xs = loopPts.map((p) => p.x), ys = loopPts.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (Math.abs(turn) < Math.PI * 2 * 2.7 || size < 40 || size > 600) return;
  lastLoop = t;
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  loopPts = [];
  if (BUSY.includes(state) || ['vanish', 'appear'].includes(state)) return;
  blinkTo = { x: cx, y: cy };
  lastTouch = t; say('縮地成寸！', true);
  set('vanish', 380);
}

// ---- 天雷閃避（渡劫）：天雷先亮光預告，點牠就閃開
let nextThunder = Date.now() + 5 * 60000;
function checkThunder(idle) {
  if (!can('thunder') || isDone() || idle >= 60 || Date.now() < nextThunder) return;
  if (!healthFree() || ['sleep', 'warn', 'struck'].includes(state)) return;
  nextThunder = Date.now() + rnd(8, 15) * 60000;
  lastHealth = Date.now() - 60000;
  set('warn', 3000); say('天雷將至！點我閃開！', true);
}
function dodgeThunder() {
  const l = limits(), k = cfg.scale;
  stat('dodges'); gain(20);
  const side = Math.random() < 0.5 ? -1 : 1;
  const x1 = Math.max(l.xmin, Math.min(l.xmax, pos.x + side * 170 * k));
  dir = side;
  leap = { x0: pos.x, y0: pos.y, x1, y1: l.ground, t0: now(), dur: 520, after: '閃過了！修為 +20' };
  set('leap', 520);
}

// ---- 召喚同門（合體）：多一隻跟在旁邊的靈寵
let comp = null;
const COMP_STATES = ['sleep', 'taichi', 'drink', 'gaze', 'happy', 'fireworks', 'dizzy', 'startle'];
function compSpecies() {
  const all = ['cat', 'fox', 'rabbit', 'panda', 'dragon'];
  return all.includes(cfg.compSpecies) && cfg.compSpecies !== cfg.species ? cfg.compSpecies : all.find((s) => s !== cfg.species);
}
function compSend(ch, arg) { if (comp && !comp.win.isDestroyed()) comp.win.webContents.send(ch, arg); }
function compPush() {
  if (!comp) return;
  compSend('state', { state: comp.state, dir: comp.dir, outfit: { species: compSpecies(), hat: 'none', robe: cfg.robe === 'yuebai' ? 'qing' : 'yuebai', gear: 'none', realm: Math.min(realm(), 2) } });
}
function compSet(s) { if (comp && comp.state !== s) { comp.state = s; compPush(); } }
function openCompanion() {
  if (comp || !can('companion')) return;
  const w = W();
  const cw = new BrowserWindow({
    x: Math.round(pos.x - dir * 130 * cfg.scale), y: Math.round(pos.y), width: w, height: w,
    transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, show: false, focusable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  comp = { win: cw, pos: { x: pos.x - dir * 130 * cfg.scale, y: pos.y }, prev: null, state: 'idle', dir, said: 0 };
  cw.setAlwaysOnTop(cfg.top, 'floating');
  cw.setIgnoreMouseEvents(true, { forward: true });
  cw.loadFile('pet.html');
  cw.once('ready-to-show', () => { cw.showInactive(); compPush(); compSend('say', '師兄好！'); });
  cw.on('closed', () => { comp = null; });
  cfg.companion = true; saveCfg();
  say('同門來了！', true);
}
function closeCompanion() {
  if (comp) { compSend('say', '師兄再見～'); const w = comp.win; setTimeout(() => { if (!w.isDestroyed()) w.close(); }, 1200); }
  cfg.companion = false; saveCfg();
}
function compTick(l, k) {   // 跟在靈寵後面走；靈寵在做的事，同門也跟著做
  if (!comp || comp.win.isDestroyed()) return;
  comp.prev = { x: comp.pos.x, y: comp.pos.y };
  const tx = pos.x - dir * 130 * k, dx = tx - comp.pos.x;
  comp.pos.y = l.ground;
  if (Math.abs(dx) > 10 * k) {
    const d = dx < 0 ? -1 : 1;
    if (d !== comp.dir) { comp.dir = d; compPush(); }
    const fast = BUSY.includes(state) || state === 'walk';
    comp.pos.x += d * Math.min(Math.abs(dx), (fast ? 5 : 2) * k);
    compSet('walk');
  } else {
    if (comp.dir !== dir) { comp.dir = dir; compPush(); }
    compSet(state === 'strike' ? 'happy' : COMP_STATES.includes(state) ? state : 'idle');
  }
  if (Date.now() - comp.said > 90000 && Math.random() < 0.004) {   // 偶爾聊兩句
    comp.said = Date.now();
    compSend('say', Q.pick(['師兄等等我', '今天也一起修煉', '師兄好厲害', '我也要御劍！', '一起加油！']));
  }
}
function compPlace() {
  if (!comp || comp.win.isDestroyed()) return;
  const a = Math.min(1, (Date.now() - tickAt) / TICK), p = comp.prev || comp.pos;
  const w = W();
  comp.win.setBounds({ x: Math.round(p.x + (comp.pos.x - p.x) * a), y: Math.round(p.y + (comp.pos.y - p.y) * a), width: w, height: w });
}

// ---- 甩動滑鼠：一秒內左右甩四次以上，牠以為你在發劍氣
let shakeX = null, shakeSign = 0, shakes = [], lastShake = 0;
function watchShake(cur, t) {
  if (shakeX !== null) {
    const dx = cur.x - shakeX;
    if (Math.abs(dx) > 22) {
      const sgn = dx > 0 ? 1 : -1;
      if (sgn !== shakeSign) { shakes.push(t); shakeSign = sgn; }
    }
  }
  shakeX = cur.x;
  shakes = shakes.filter((x) => t - x < 1000);
  if (shakes.length < 4 || t - lastShake < 8000) return;
  shakes = []; lastShake = t;
  if (BUSY.includes(state) || ['spin', 'taichi', 'peekout', 'peek'].includes(state)) return;
  if (Math.abs(cur.x - (pos.x + W() / 2)) > 700 * cfg.scale) return;   // 離太遠感覺不到
  lastTouch = t;
  if (Math.random() < 0.55) { set('spin', 1500); say(['好強的劍氣！', '道友好劍法！', '轉～轉～'][Math.floor(Math.random() * 3)]); }
  else { say(['嚇死本座了！', '劍氣太重，先躲躲'][Math.floor(Math.random() * 2)]); startPeek(); }
}

// ---- 壁虎遊牆功：走到螢幕邊緣時，有時會貼著牆爬上去，在頂端倒掛一下再翻下來
function startClimb(side) {
  const a = area(), k = cfg.scale;
  dir = side;
  pos.x = side < 0 ? a.x - 68 * k : a.x + a.width - 132 * k;   // 讓腳貼著牆
  say(['壁虎遊牆功！', '看我上牆～'][Math.floor(Math.random() * 2)]);
  set('climb');
}

// ---- 傳音符：時間到了叼著符跑到游標旁，一句一句念給你聽
let deliver = null, carrying = false;
function chunks(text) {   // 泡泡一行放十個字：先在標點斷開，太長的再切
  const out = [];
  for (const piece of text.split(/(?<=[，。、！？；,.!?;\s])/)) {
    const p = piece.trim();
    for (let i = 0; i < p.length; i += 10) out.push(p.slice(i, i + 10));
  }
  return out.filter(Boolean);
}
function readNote() {
  const n = deliver;
  deliver = null;
  if (!n) return;
  const lines = ['傳音符到！', ...chunks(n.text)];
  carrying = true; pushState();   // 念完才把符放下
  sayLines(lines, 2800);
  setTimeout(() => { carrying = false; pushState(); }, lines.length * 2800);
}
function checkNotes() {
  if (deliver) return;
  const due = cfg.notes.filter((n) => n.at <= Date.now()).sort((a, b) => a.at - b.at)[0];
  if (!due || ['drag', 'fall', 'tribulation'].includes(state)) return;
  cfg.notes = cfg.notes.filter((n) => n !== due); saveCfg(); refreshUi();
  try { new Notification({ title: '傳音符', body: due.text, silent: false }).show(); } catch { /* 系統不支援通知就算了 */ }
  deliver = due;
  if (KUNGFU.includes(state) || state === 'roll') { set('idle', 100); }
  startChase(true);
}

// ---- 今日三件事
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todos() {
  const t = cfg.todos && cfg.todos.date === today() ? cfg.todos : { date: today(), items: [] };
  const items = [0, 1, 2].map((i) => ({ text: String((t.items[i] || {}).text || '').slice(0, 24), done: !!(t.items[i] || {}).done, paid: !!(t.items[i] || {}).paid }));
  return { date: today(), items };
}
function toggleTodo(i) {
  const t = todos();
  if (!t.items[i] || !t.items[i].text) return t;
  t.items[i].done = !t.items[i].done;
  cfg.todos = t; saveCfg();
  if (t.items[i].done && !t.items[i].paid) {
    t.items[i].paid = true; cfg.todos = t; saveCfg();
    const left = t.items.filter((x) => x.text && !x.done).length;
    stat('todosDone');
    const free = !BUSY.includes(state);
    if (left === 0) { gain(80); stat('allDone'); if (free) set('fireworks', 3600); sayLines(['三件都完成了！', '修為 +80', ...Q.verseLines(Q.pick(Q.VERSE))]); }
    else { gain(20); if (free) set('happy', 1500); sayLines([Q.pick(Q.DONE), `修為 +20，還剩 ${left} 件`]); }
  }
  return t;
}

// ---- 傳音符與卷軸的小視窗
let noteWin = null, scrollWin = null;
function uiWindow(file, opts) {
  return new BrowserWindow({
    show: false, autoHideMenuBar: true, ...opts,
    webPreferences: { preload: path.join(__dirname, 'ui-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
}
let recWin = null;
function openRecords() {
  if (recWin && !recWin.isDestroyed()) { recWin.show(); recWin.focus(); return; }
  recWin = uiWindow('records.html', { width: 440, height: 700, resizable: false, title: '修煉紀錄', alwaysOnTop: true, icon: path.join(__dirname, 'assets', 'icon.png') });
  recWin.loadFile(path.join(__dirname, 'records.html'));
  recWin.once('ready-to-show', () => recWin.show());
  recWin.on('closed', () => { recWin = null; });
}
function records() {
  const r = realm(), st = cfg.stats || {};
  return {
    realm: r, realmName: REALMS[r], done: isDone(), xp: Math.floor(cfg.xp),
    cur: isDone() ? MAX_XP : NEED[r], next: isDone() ? MAX_XP : (r + 1 < NEED.length ? NEED[r + 1] : MAX_XP),
    realms: REALMS.map((name, i) => ({ name, need: NEED[i], unlock: UNLOCK[i], got: r >= i })),
    stats: { days: st.days || 1, todayMin: daily().min, totalMin: st.totalMin || 0, todosDone: st.todosDone || 0, allDone: st.allDone || 0,
      breaks: st.breaks || 0, gazes: st.gazes || 0, dodges: st.dodges || 0, strikes: st.strikes || 0 },
    sources: [
      { what: '在電腦前用（離開不算）', gain: '每分鐘 +1' }, { what: '劃掉一件事', gain: '+20；三件全成再 +60' },
      { what: '起身休息後回來', gain: '+15' }, { what: '護眼看完 20 秒', gain: '+5' }, { what: '每天第一次寫好三件事', gain: '+10' },
      { what: '摸頭、點牠', gain: '+1（每天最多 30）' }, { what: '餵靈丹', gain: '+30（每天三顆）' }, { what: '你離開時牠自己閉關', gain: '每兩分鐘 +1（最多 120）' },
      { what: '渡劫期閃過天雷', gain: '+20（被劈到也有 +5）' },
    ],
  };
}
function openNotes() {
  if (noteWin && !noteWin.isDestroyed()) { noteWin.show(); noteWin.focus(); return; }
  noteWin = uiWindow('note.html', { width: 380, height: 640, resizable: false, title: '寫傳音符', alwaysOnTop: true, icon: path.join(__dirname, 'assets', 'icon.png') });
  noteWin.loadFile(path.join(__dirname, 'note.html'));
  noteWin.once('ready-to-show', () => noteWin.show());
  noteWin.on('closed', () => { noteWin = null; });
}
function openScroll(toggle) {
  if (scrollWin && !scrollWin.isDestroyed()) { if (toggle) scrollWin.close(); else scrollWin.show(); return; }
  const a = screen.getPrimaryDisplay().workArea, w = 240;
  const p = cfg.scrollPos && Number.isFinite(cfg.scrollPos.x) ? cfg.scrollPos : { x: a.x + 24, y: a.y + a.height - 360 };
  scrollWin = uiWindow('scroll.html', {
    x: Math.round(p.x), y: Math.round(p.y), width: w, height: 260, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, backgroundColor: '#00000000',
  });
  scrollWin.setAlwaysOnTop(true, 'floating');
  scrollWin.loadFile(path.join(__dirname, 'scroll.html'));
  scrollWin.once('ready-to-show', () => scrollWin.showInactive());
  scrollWin.on('moved', () => { const [x, y] = scrollWin.getPosition(); cfg.scrollPos = { x, y }; saveCfg(); });
  scrollWin.on('closed', () => { scrollWin = null; });
}
function refreshUi() {
  for (const w of [noteWin, scrollWin, recWin]) if (w && !w.isDestroyed()) w.webContents.send('ui-refresh');
}
ipcMain.handle('ui-get', () => ({ notes: cfg.notes, todos: todos(), records: records() }));
ipcMain.handle('ui-notes', (_e, notes) => {
  if (!Array.isArray(notes)) return cfg.notes;
  cfg.notes = notes.filter((n) => n && typeof n.text === 'string' && n.text.trim() && Number.isFinite(n.at)).slice(0, 50)
    .map((n) => ({ id: String(n.id || Date.now().toString(36)).slice(0, 20), text: n.text.trim().slice(0, 60), at: n.at }));
  saveCfg(); refreshUi();
  return cfg.notes;
});
ipcMain.handle('ui-todos', (_e, t) => {
  const old = todos().items;
  const items = [0, 1, 2].map((i) => {
    const text = String(((t && t.items) || [])[i]?.text || '').trim().slice(0, 24);
    const same = old[i] && old[i].text === text;   // 內容沒改：保留已領過獎勵的紀錄
    return { text, done: !!((t && t.items) || [])[i]?.done, paid: same ? old[i].paid : false };
  });
  cfg.todos = { date: today(), items }; saveCfg(); refreshUi();
  if (items.some((x) => x.text) && !daily().wrote) { daily().wrote = true; gain(10); }   // 每天第一次寫好三件事 +10
  if (items.some((x) => x.text) && !BUSY.includes(state)) { set('happy', 1200); say('好，我幫你記著！', true); }
  return todos();
});
ipcMain.handle('ui-toggle', (_e, i) => { const t = toggleTodo(Number(i)); refreshUi(); return t; });
ipcMain.on('ui-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close(); });
ipcMain.on('ui-resize', (e, h) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && w === scrollWin && Number.isFinite(h)) { const [cw] = w.getContentSize(); w.setContentSize(cw, Math.max(120, Math.min(600, Math.round(h)))); }
});
let chaseUntil = 0, leap = null, landAfter = false;
function startChase(quiet) {
  if (['drag', 'fall', 'tribulation'].includes(state)) return;
  chaseUntil = now() + 9000; landAfter = false;
  if (deliver) { pushState(); say('有你的傳音符！', true); }
  else if (!quiet) say(['道友留步！', '看我輕功！', '凌波微步！'][Math.floor(Math.random() * 3)]);
  nextLeap();
}
function nextLeap() {   // 朝游標跳一大步：落點在游標旁邊，一步最遠 280
  const k = cfg.scale, l = limits(), cur = screen.getCursorScreenPoint();
  const cx = pos.x + 100 * k, d = cur.x < cx ? -1 : 1;
  if (d !== dir) dir = d;
  let tx = cur.x - dir * 80 * k - 100 * k, ty = cur.y - 124 * k;
  const dx = tx - pos.x, dy = ty - pos.y, dist = Math.hypot(dx, dy), maxStep = 280 * k;
  if (dist > maxStep) { tx = pos.x + dx / dist * maxStep; ty = pos.y + dy / dist * maxStep; }
  tx = Math.max(l.xmin, Math.min(l.xmax, tx)); ty = Math.max(l.ymin, Math.min(l.ground, ty));
  leap = { x0: pos.x, y0: pos.y, x1: tx, y1: ty, t0: now(), dur: 430 };
  set('leap', 430);
}
function feed() {
  lastTouch = now();
  if (['drag', 'fall', 'tribulation'].includes(state)) return;
  if (daily().pills >= 3) return say('今天的三顆靈丹吃完了，明天再來', true);
  if (now() - lastPill < 30000) return say('丹毒未消，等等再吃', true);
  lastPill = now(); daily().pills += 1;
  set('eat', 3200);
}

function tick() {
  if (!win || win.isDestroyed()) return;
  const l = limits(), k = cfg.scale, t = now();
  const cur = screen.getCursorScreenPoint();
  tickN++;
  prevPos = { x: pos.x, y: pos.y };
  watchShake(cur, t);
  watchLoop(cur, t);

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
  } else if (KUNGFU.includes(state)) {
    if (state === 'leap' && leap) {   // 拋物線往前跳，空中翻一圈（翻的動作在 draw.js）
      const p = Math.min(1, (t - leap.t0) / leap.dur);
      pos.x = leap.x0 + (leap.x1 - leap.x0) * p;
      pos.y = leap.y0 + (leap.y1 - leap.y0) * p - Math.sin(p * Math.PI) * 70 * k;
      if (!leap.after) pos.y = Math.max(l.ymin, Math.min(l.ground, pos.y));   // 從牆頂翻下來時起點在螢幕外，不要夾住
      if (p >= 1) {
        const near = Math.hypot(cur.x - (pos.x + 100 * k), cur.y - (pos.y + 124 * k)) < 120 * k;
        if (leap.after) { set('happy', 1500); say(typeof leap.after === 'string' ? leap.after : ['倒掛金鉤，帥吧！', '輕功了得吧？'][Math.floor(Math.random() * 2)], true); }   // 從牆上翻下來、閃過天雷
        else if (deliver && (near || t > chaseUntil)) { landAfter = true; readNote(); set('hover', 900); }
        else if (near) { landAfter = true; touchGain(); say(['抓到道友了！', '承讓承讓～', '身法如何？'][Math.floor(Math.random() * 3)]); set('hover', 900); }
        else if (t > chaseUntil) { landAfter = true; say('靈力耗盡…'); set('hover', 400); }
        else set('hover', 140);   // 踏空，借力再跳
      }
    } else if (state === 'hover') {
      if (t > until) { if (landAfter) set('land'); else nextLeap(); }
    } else if (state === 'vanish') {   // 縮成一點不見，再出現在圈的中心
      if (t > until && blinkTo) {
        pos.x = Math.max(l.xmin, Math.min(l.xmax, blinkTo.x - 100 * k));
        pos.y = Math.max(l.ymin, Math.min(l.ground, blinkTo.y - 124 * k));
        prevPos = { x: pos.x, y: pos.y };   // 瞬移：不要補間滑過去
        blinkTo = null; set('appear', 650);
      }
    } else if (state === 'appear') {
      if (t > until) { landAfter = true; set('hover', 300); }
    } else if (state === 'climb') {   // 貼著牆往上爬
      const a = area();
      pos.y -= 2.2 * k;
      if (pos.y <= a.y + 40 * k - 154 * k) {
        pos.y = a.y - 122 * k; pos.x += -dir * 40 * k;   // 到頂了：翻過來倒掛在螢幕上緣
        set('hang', 2400);   // 這時泡泡在螢幕外，落地後再說
      }
    } else if (state === 'hang') {
      if (t > until) {   // 鬆手，翻個筋斗落地
        const x1 = Math.max(l.xmin, Math.min(l.xmax, pos.x - dir * 160 * k));
        dir = -dir;
        leap = { x0: pos.x, y0: pos.y, x1, y1: l.ground, t0: now(), dur: 650, after: true };
        set('leap', 650);
      }
    } else if (state === 'land') {   // 輕輕飄下來
      pos.y = Math.min(l.ground, pos.y + 7 * k);
      if (pos.y >= l.ground) { pos.y = l.ground; set('idle', 1500); }
    }
  } else if (state === 'roll') {
    // 御劍飛行：飛在游標旁邊追著它跑（面向游標，不擋住游標）；時間到了慢慢降落
    const cx = pos.x + 100 * k, dx = cur.x - cx;
    if (Math.abs(dx) > 40 * k && (dx < 0 ? -1 : 1) !== dir) { dir = dx < 0 ? -1 : 1; pushState(); }
    let tx = cur.x - dir * 90 * k - 100 * k, ty = cur.y - 124 * k;
    if (t > until) { tx = pos.x; ty = l.ground; }   // 靈力用完：原地降落
    const ddx = tx - pos.x, ddy = ty - pos.y, dist = Math.hypot(ddx, ddy), max = 30 * k;
    const step = Math.min(max, dist * 0.2);
    if (dist > 0.5) { pos.x += ddx / dist * step; pos.y += ddy / dist * step; }
    pos.x = Math.max(l.xmin, Math.min(l.xmax, pos.x));
    pos.y = Math.max(l.ymin, Math.min(l.ground, pos.y));
    if (t > until && pos.y >= l.ground - 1) { pos.y = l.ground; set('idle', 1500); say('收劍！'); }
  } else {
    // 地面上的狀態：螢幕配置改變時落回地面
    if (pos.y < l.ground - 2) { vel = { x: 0, y: 0 }; maxSpeed = 0; bounces = 0; set('fall'); }
    else pos.y = l.ground;

    if (state === 'walk') {
      pos.x += dir * 1.6 * k;
      if (pos.x <= l.xmin && dir < 0) { if (can('climb') && Math.random() < 0.35) startClimb(-1); else dir = 1, pushState(); }
      else if (pos.x >= l.xmax && dir > 0) { if (can('climb') && Math.random() < 0.35) startClimb(1); else dir = -1, pushState(); }
    } else if (state === 'peekout') {
      const target = dir < 0 ? l.xmin - 46 * k : l.xmax + 46 * k;
      pos.x += dir * 2 * k;
      if ((dir < 0 && pos.x <= target) || (dir > 0 && pos.x >= target)) {
        pos.x = target; dir = -dir; set('peek', rnd(3500, 6000));
      }
    }

    if (pending && ['idle', 'walk', 'sleep'].includes(state)) {
      pending = false; set('tribulation', 3300); say('天劫將至！', true);
    }

    if (t > until) {
      if (state === 'eat') { set('happy', 1500); say('修為 +30'); gain(30); }
      else if (state === 'tribulation') {
        saveCfg(); set('happy', 1800);
        if (isDone()) sayLines(['渡劫圓滿！', '道友與本座，功德圓滿', ...Q.verseLines(Q.pick(Q.VERSE))]);
        else sayLines([`突破！${REALMS[realm()]}期`, '獲得：', ...chunks(UNLOCK[realm()]), ...Q.verseLines(Q.pick(Q.VERSE))]);
        refreshUi();
      }
      else if (state === 'peek') { set('walk', 2500); }
      else if (state === 'warn') { gain(5); set('struck', 1100); say('被劈了一下…修為 +5', true); }
      else if (state === 'struck') { set('dizzy', 1800); }
      else decide();
    }
  }
  compTick(l, k);
  tickAt = Date.now();
  if (Date.now() - lastFrameMsg > 200) { place(); compPlace(); }   // 畫面端沒在要（例如被系統暫停）時，照舊每次移動

  // 游標在視窗裡的位置（畫面座標）：角色自己走到靜止的游標底下時，畫面端靠這個判斷要不要接住滑鼠
  send('cursor-at', { x: cur.x - Math.round(pos.x), y: cur.y - Math.round(pos.y) });
  if (comp) compSend('cursor-at', { x: cur.x - Math.round(comp.pos.x), y: cur.y - Math.round(comp.pos.y) });
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
  if (['fall', 'drag', 'tribulation', 'struck', 'vanish', 'appear'].includes(state)) return;
  if (state === 'warn') { clicks = []; return dodgeThunder(); }
  const dbl = t - lastClickAt < 380; lastClickAt = t;
  if (dbl && can('strike') && !BUSY.includes(state) && !['sleep', 'taichi', 'drink', 'gaze', 'strike'].includes(state)) { clicks = []; return startStrike(); }
  if (state === 'strike') return;
  if (state === 'taichi') { say('別偷懶，一起動！'); return; }
  if (state === 'drink' || state === 'gaze') { say(state === 'drink' ? '咕嚕咕嚕～' : '看遠一點～'); return; }   // 打拳中被點：繼續打
  if (state === 'climb' || state === 'hang') { say('別吵，練功中！'); return; }
  if (state === 'roll' || KUNGFU.includes(state)) { touchGain(); say('抓不到我～'); return; }   // 飛行、輕功中被點：繼續
  if (state === 'sleep') { set('startle', 900); say('修煉被打斷了！'); clicks = []; return; }
  if (clicks.length >= 5) { clicks = []; set('dizzy', 2600); say('道心不穩啦～'); return; }
  touchGain();
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
  if (['drag', 'fall', 'dizzy', 'tribulation', 'eat', ...KUNGFU].includes(state)) return;
  if (!can('roll')) return say(`御劍要到${REALMS[ABILITY.roll]}才會喔`);
  lastTouch = now();
  if (state !== 'roll') say('御劍追你！');
  set('roll', 10000);   // 追著游標飛十秒；再滾一次滾輪就再延長
}

function setScale(s) {
  const l0 = limits(), cx = pos.x + W() / 2;
  const onGround = pos.y >= l0.ground - 2;
  cfg.scale = s; saveCfg();
  pos.x = cx - W() / 2;
  if (onGround) pos.y = limits().ground;
  place();
}

// 用安裝程式裝的才有解除安裝程式（免安裝版、開發時沒有）
function uninstaller() {
  if (process.platform !== 'win32' || !app.isPackaged) return '';
  const dir = path.dirname(process.execPath);
  const exe = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => /^Uninstall .*\.exe$/i.test(f)) : '';
  return exe ? path.join(dir, exe) : '';
}
async function uninstall() {
  const exe = uninstaller();
  if (!exe) return;
  const r = await dialog.showMessageBox({
    type: 'question', buttons: ['解除安裝', '取消'], defaultId: 1, cancelId: 1, title: '解除安裝桌面靈寵',
    message: '要解除安裝桌面靈寵嗎？', detail: '修為和設定會留著，之後重新安裝可以接著修煉。',
  });
  if (r.response !== 0) return;
  shell.openPath(exe);
  setTimeout(() => app.quit(), 500);
}

function menu() {
  const login = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: '境界：' + realmText(), enabled: false },
    { label: '修煉紀錄…', click: openRecords },
    can('companion')
      ? { label: comp ? '請同門回去' : '召喚同門', click: () => (comp ? closeCompanion() : openCompanion()) }
      : { label: lockLabel('召喚同門', 'companion'), enabled: false },
    {
      label: '同門的角色', visible: can('companion'), submenu: SPECIES.filter(([v]) => v !== cfg.species).map(([v, name]) => ({
        label: name, type: 'radio', checked: compSpecies() === v, click: () => { cfg.compSpecies = v; saveCfg(); compPush(); },
      })),
    },
    { type: 'separator' },
    { label: `餵靈丹（修為 +30，今天還有 ${3 - daily().pills} 顆）`, click: feed },
    { label: '打坐修煉', click: () => set('sleep', 120000) },
    { label: lockLabel('御劍飛行', 'roll'), enabled: can('roll'), click: () => onRoll(dir) },
    { label: lockLabel('來追我', 'chase'), enabled: can('chase'), click: () => { lastTouch = now(); startChase(); } },
    { label: '躲貓貓', click: () => { lastTouch = now(); startPeek(); } },
    { label: '吟詩一首', click: () => recite(true) },
    { label: '勉勵我一句', click: () => encourage(true) },
    { type: 'separator' },
    {
      label: '大小', submenu: [[0.75, '小'], [1, '中'], [1.5, '大']].map(([s, label]) => ({
        label, type: 'radio', checked: cfg.scale === s, click: () => setScale(s),
      })),
    },
    {
      label: '角色', submenu: SPECIES.map(([v, name]) => ({
        label: name, type: 'radio', checked: cfg.species === v,
        click: () => { cfg.species = v; saveCfg(); pushState(); set('happy', 1400); say(`化身${name}！`); },
      })),
    },
    {
      label: '裝扮', submenu: [['hat', '頭飾', HATS], ['robe', '道袍顏色', ROBES], ['gear', '配件', GEARS]].map(([key, label, list]) => ({
        label, submenu: list.map(([v, name]) => ({
          label: name, type: 'radio', checked: cfg[key] === v,
          click: () => { cfg[key] = v; saveCfg(); pushState(); set('happy', 1200); say(key === 'robe' ? `換上${name}色道袍！` : v === 'none' ? '輕裝上路' : `換上${name}！`); },
        })),
      })),
    },
    { label: '會說話', type: 'checkbox', checked: cfg.talk, click: (m) => { cfg.talk = m.checked; saveCfg(); } },
    { label: '永遠在最上層', type: 'checkbox', checked: cfg.top, click: (m) => { cfg.top = m.checked; saveCfg(); win.setAlwaysOnTop(cfg.top, 'floating'); } },
    { label: '寫傳音符…（定時提醒）', click: openNotes },
    { label: scrollWin ? '收起今日三件事' : '今日三件事', click: () => openScroll(true) },
    {
      label: '健康提醒', submenu: [
        { label: '喝水（每用一小時）', type: 'checkbox', checked: cfg.water, click: (m) => { cfg.water = m.checked; saveCfg(); waterAcc = 0; } },
        { label: '護眼（每用 20 分鐘）', type: 'checkbox', checked: cfg.eyes, click: (m) => { cfg.eyes = m.checked; saveCfg(); eyeAcc = 0; } },
        { label: '現在喝口水', click: startDrink },
        { label: '現在看看遠方', click: startGaze },
        { type: 'separator' },
        { label: '起身活動：', enabled: false },
        ...STRETCH.map((m) => ({
          label: m ? `每坐 ${m} 分鐘提醒` : '關閉', type: 'radio', checked: cfg.stretch === m,
          click: () => { cfg.stretch = m; saveCfg(); sitSince = Date.now(); say(m ? `好，每 ${m} 分鐘叫你起來` : '不提醒了，記得自己動動', true); },
        })),
        { type: 'separator' },
        { label: `已經坐了 ${sittingMinutes()} 分鐘`, enabled: false },
        { label: '現在就打一套太極', click: () => startTaichi(0) },
      ],
    },
    { label: '開機自動啟動', type: 'checkbox', checked: login, visible: process.platform !== 'linux', click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { type: 'separator' },
    { label: '解除安裝…', visible: !!uninstaller(), click: uninstall },
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
    setTimeout(() => (morningDue() ? morning() : say(greeting())), 1500);
    setInterval(tick, TICK);
    setInterval(checkStretch, 10000);
    setInterval(checkNotes, 5000);
    if (cfg.companion && can('companion')) setTimeout(openCompanion, 2500);
    if (todos().items.some((x) => x.text)) openScroll();
    // 測試用：PET_DEMO=chase 或 roll 啟動，兩秒後自動做那個動作（一般使用不會設這個）
    const demo = process.env.PET_DEMO;
    if (demo === 'strike') setInterval(() => { if (!BUSY.includes(state)) startStrike(); }, 2600);
    else if (demo === 'thunder') setTimeout(() => { set('warn', 3000); say('天雷將至！點我閃開！', true); }, 2500);
    else if (demo === 'companion') setTimeout(openCompanion, 2000);
    else if (demo === 'records') openRecords();
    else if (demo === 'drink') setTimeout(startDrink, 2500);
    else if (demo === 'gaze') setTimeout(startGaze, 2500);
    else if (demo === 'ui') { openNotes(); openScroll(); }
    else if (demo === 'todo') {   // 寫兩件事、三秒後劃掉一件、七秒後劃掉另一件（應該放煙火）
      cfg.todos = { date: today(), items: [{ text: '交立面圖給業主', done: false }, { text: '回覆結構技師', done: false }, { text: '', done: false }] };
      openScroll();
      setTimeout(() => { toggleTodo(0); refreshUi(); }, 3000);
      setTimeout(() => { toggleTodo(1); refreshUi(); }, 7000);
    }
    else if (demo === 'note') cfg.notes.push({ id: 'demo', text: '三點要開會，記得帶模型和圖說', at: Date.now() + 4000 });
    else if (demo === 'climb') setTimeout(() => startClimb(1), 2000);
    else if (demo === 'stretch') sitSince = Date.now() - cfg.stretch * 60000;   // 假裝已經坐滿時間，下一次檢查就提醒
    else if (demo) setTimeout(() => (demo === 'roll' ? onRoll(1) : startChase()), 2000);
  });
  win.on('closed', () => { win = null; if (comp && !comp.win.isDestroyed()) comp.win.close(); });

  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (!icon.isEmpty()) {
    tray = new Tray(icon.resize({ width: process.platform === 'darwin' ? 18 : 16 }));
    tray.setToolTip('桌面靈寵｜' + realmText());
    tray.on('click', () => tray.popUpContextMenu(menu()));
    tray.on('right-click', () => tray.popUpContextMenu(menu()));
  }
}

ipcMain.on('hit', (e, h) => {
  if (fromComp(e)) { if (FORWARD) comp.win.setIgnoreMouseEvents(!h, { forward: true }); return; }
  if (!win || state === 'drag' || !FORWARD) return;
  win.setIgnoreMouseEvents(!h, { forward: true });
});
ipcMain.on('click', (e) => {
  if (!fromComp(e)) return onClick();
  touchGain(); compSet('happy'); setTimeout(() => compSet('idle'), 1400);   // 點同門：牠開心一下
  compSend('say', Q.pick(['嘿嘿～', '師兄你看！', '修為 +1']));
});
ipcMain.on('drag-start', (e) => { if (!fromComp(e)) onDragStart(); });
ipcMain.on('drag-end', (e) => { if (!fromComp(e)) onDragEnd(); });
ipcMain.on('roll', (e, d) => { if (!fromComp(e)) onRoll(d); });
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
