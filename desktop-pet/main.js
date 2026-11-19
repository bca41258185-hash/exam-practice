// 桌面寵物主程序：視窗、位置物理、行為狀態機、選單。
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, shell, powerMonitor, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const POEMS = require('./poems');
const Q = require('./quotes');
const HEX = require('./iching');
const LORE = require('./lore');

const BASE = 200;           // 視窗邏輯邊長（畫布座標）
const TICK = 33;            // 毫秒
const FORWARD = process.platform !== 'linux'; // 點擊穿透的滑鼠轉送只有 Windows / macOS 支援

let win, tray;
let cfg = { scale: 1, top: true, curfew: 23, wishes: [], stretch: 50, water: true, eyes: true, lastMorning: '', notes: [], todos: { date: '', items: [] }, scrollPos: null, species: 'cat', hat: 'none', robe: 'qing', gear: 'none', talk: true, xp: 0 };

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
  if (![0, 0.5, 21, 22, 23].includes(cfg.curfew)) cfg.curfew = 23;
  if (!Array.isArray(cfg.wishes)) cfg.wishes = [];
  if (cfg.xpVersion !== 2) {
    let r = 0; while (r + 1 < OLD_NEED.length && cfg.xp >= OLD_NEED[r + 1]) r++;
    cfg.xp = NEED[r]; cfg.xpVersion = 2;
    saveCfg();   // 換算完馬上存，免得下次又換算一次
  }
  if (process.env.PET_TEST_XP) cfg.xp = Number(process.env.PET_TEST_XP) || 0;
  if (process.env.PET_TEST_XP && process.env.PET_TEST_SPECIES) cfg.species = process.env.PET_TEST_SPECIES;   // 測試用：換角色（不存檔）   // 測試用：假裝修為是這個數字（不存檔）
  if (typeof cfg.merit !== 'number' || cfg.merit < 0) cfg.merit = 0;
  if (!Array.isArray(cfg.history)) cfg.history = [];
  if (![0, 3, 5, 10, 20].includes(cfg.saver)) cfg.saver = 10;
  // 已經慶祝過的境界會存檔：突破後還沒演天劫就關掉程式，下次開啟會補演
  if (typeof cfg.seenRealm !== 'number') { cfg.seenRealm = realmOf(cfg.xp); cfg.seenDone = cfg.xp >= MAX_XP; }
  pending = realmOf(cfg.xp) > cfg.seenRealm || (cfg.xp >= MAX_XP && !cfg.seenDone);
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
    ymin: a.y - 40 * cfg.scale, ground: a.y + a.height - w + 2 * cfg.scale,   // 腳離工作列一點，影子不會被蓋住
  };
}

function send(ch, arg) { if (win && !win.isDestroyed()) win.webContents.send(ch, arg); }
function pushState() { send('state', { state: state === 'peekout' ? 'walk' : state, dir, outfit: { species: morph || (disguise && disguise.as) || cfg.species, fake: disguise && !morph && cfg.species === 'fox' ? 'fox' : undefined, poof, hat: cfg.hat, robe: cfg.robe, gear: cfg.gear, carry: !!(deliver || carrying), realm: realm(), done: isDone(), heaven: heaven(), grab: state === 'drag' ? grabFace : undefined, evo: cfg.evolve === false ? 0 : undefined, fx: fxOn || undefined, move: strikeMove, hex: hexShow, lantern: curfewOn(), demon: demon && { hp: demon.hp, t0: demon.t0, hitAt: demon.hitAt }, zone: touchZone, spar: sparInfo(), foxmove: state === 'foxtrain' ? foxMove : undefined } }); }
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
function healthFree() { return !BUSY.includes(state) && !spar && !demon && !['taichi', 'drink', 'gaze', 'fireworks', 'spin', 'divine', 'hexagram', 'laugh'].includes(state) && !deliver && Date.now() - lastHealth > 90000; }
function startDrink() {
  lastHealth = Date.now(); lastTouch = now();
  set('drink', 4200);
  const w = Q.pick(Q.WATER);
  sayLines(['道友也喝口水吧', ...Q.verseLines(w)], 2600);
  if (cfg.species === 'dragon') setTimeout(() => { gain(5, 'skill'); xpNotes.push(['行雲布雨', '陪你喝水，修為 +5']); }, 4300);   // 小青龍的天賦
}
function startGaze() {
  lastHealth = Date.now(); lastTouch = now();
  set('gaze', 20000);   // 陪你看遠方 20 秒
  const f = Q.pick(Q.FAR);
  sayLines(['看看 6 公尺外', '遠眺 20 秒～', ...Q.verseLines(f)], 3200);
  setTimeout(() => { if (state === 'gaze') { gain(5, 'eye'); stat('gazes'); set('happy', 1400); say('眼睛舒服多了吧，修為 +5', true); } }, 20000);
}
let activeSec = 0, awaySec = 0, awayGained = 0;
function checkXp(idle) {
  if (idle < 60) {
    awaySec = 0; awayGained = 0;
    activeSec += 10;
    if (activeSec >= 60) {
      activeSec -= 60; stat('totalMin');
      const d = daily(); d.min += 1;
      // 熬夜（過了宵禁時間）不長修為；一天專注修為最多八小時，免得越加班升越快
      if (curfewOn()) { if (!d.lateTold) { d.lateTold = true; xpNotes.push(['夜深了，道友', '熬夜不長修為喔']); } }
      else if ((d.xp.work || 0) >= WORK_CAP) { if (!d.capTold) { d.capTold = true; xpNotes.push(['今日專注滿八小時', '修為到頂，該歇了']); } }
      else gain(1, 'work');
    }
    flushXpNotes();
  } else {
    awaySec += 10;
    if (awaySec >= 120 && awayGained < awayCap()) { awaySec -= 120; awayGained += 1; gain(1, 'retreat'); }   // 每兩分鐘 +1，最多 120
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
  checkDemon(idle);
  checkVillain(idle);
  checkCurfew(idle);
  checkOmen(idle);
  checkSaver(idle);
  if (idle >= BREAK_SEC) {   // 你離開座位了：重新計時；如果是被提醒之後才去休息，回來時誇你
    if (reminded) praise = true;
    sitSince = Date.now(); reminded = false;
    return;
  }
  if (praise && idle < 5 && !['drag', 'fall', 'tribulation'].includes(state)) {
    praise = false; gain(restGain(), 'rest'); stat('breaks'); set('happy', 1600); sayLines([`休息得好！修為 +${restGain()}`, Q.pick(Q.CHEER)]);
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
const UNLOCK = ['點、拖、甩、吟詩、雙擊彈指', '腳下靈氣圈、來追我', '金丹微光、御劍飛行、本命絕技', '壁虎遊牆功、元嬰小分身',
  '雙擊多四式武學', '畫圈縮地成寸', '召喚同門、本命奧義', '腳踏祥雲、大乘語錄', '天雷閃避'];
// 外觀進化：到這些境界時樣子會變（draw.js 依境界畫），突破時順便說一句各角色變了什麼
const EVOLVE = {
  2: { cat: '掛上師父的鈴鐺', fox: '長出第二條尾巴', rabbit: '耳尖染金', panda: '頭頂冒出竹葉', dragon: '龍角長大了' },
  4: { cat: '修出第二條尾巴', fox: '三尾了', rabbit: '眉心一彎金月', panda: '兩片竹葉、太極佩', dragon: '龍角分叉了' },
  6: { cat: '尾尖燃起靈火', fox: '五尾如屏', rabbit: '身後升起彎月', panda: '身後長出靈竹', dragon: '披帛飄飄' },
  8: { cat: '三尾，眉心金蓮', fox: '八尾齊開', rabbit: '眉心金月更亮', panda: '師父的丹爐來了', dragon: '龍珠回來了' },
};
const ABILITY = { chase: 1, roll: 2, climb: 3, strike: 0, blink: 5, companion: 6, thunder: 8 };
function realm() { return realmOf(cfg.xp); }
function can(a) { return realm() >= ABILITY[a]; }
function lockLabel(label, a) { return can(a) ? label : `${label}（${REALMS[ABILITY[a]]}解鎖）`; }
let pending = false, lastPill = 0, lastSave = 0;
// 小境界：每個大境界分四段，到了會說一聲（不演天劫）
const STAGES = ['初期', '中期', '後期', '巔峰'];
// 每日上限：小遊戲與切磋的修為、專注工作的修為（分鐘）。超過照樣能玩、能用，只是不再加修為
const GAME_CAP = 60, WORK_CAP = 480;
// 渡劫圓滿之後，多出來的修為化為功德；每 1500 功德飛升一重天，共九重
const HEAVEN_STEP = 1500, HEAVEN_MAX = 9, NUM = '一二三四五六七八九';
const SRC = { work: '專注工作', todo: '今日三件事', rest: '起身休息', eye: '護眼遠眺', pet: '摸頭', pill: '靈丹', retreat: '閉關',
  game: '切磋與小遊戲', skill: '本命技能', omen: '心魔與祥瑞', thunder: '天雷', bonus: '連續修煉', other: '其他' };
let xpNotes = [], ascend = false;   // 等牠有空時要說的話（每則是幾行泡泡）；飛升了還沒慶祝
function realmOf(xp) { let i = 0; while (i + 1 < NEED.length && xp >= NEED[i + 1]) i++; return i; }
function stageOf(xp) {
  if (xp >= MAX_XP) return 3;
  const r = realmOf(xp), top = r + 1 < NEED.length ? NEED[r + 1] : MAX_XP;
  return Math.max(0, Math.min(3, Math.floor(4 * (xp - NEED[r]) / (top - NEED[r]))));
}
function isDone() { return cfg.xp >= MAX_XP; }
function heaven() { return Math.min(HEAVEN_MAX, Math.floor((cfg.merit || 0) / HEAVEN_STEP)); }
function heavenText() { const h = heaven(); return h ? `飛升第${NUM[h - 1]}重天` : '渡劫圓滿'; }
function realmText() {
  const i = realmOf(cfg.xp);
  if (isDone()) return heaven() >= HEAVEN_MAX ? `${heavenText()}（圓滿）` : `${heavenText()}（功德 ${Math.floor(cfg.merit % HEAVEN_STEP)}／${HEAVEN_STEP}）`;
  return `${REALMS[i]}${STAGES[stageOf(cfg.xp)]}（${Math.floor(cfg.xp)}／${i + 1 < NEED.length ? NEED[i + 1] : MAX_XP}）`;
}
// 加修為。src 是來源（SRC 的鍵），用來記今天各來源拿了多少。回傳實際加到的數字（碰到每日上限會變少，甚至是 0）
function gain(n, src) {
  src = SRC[src] ? src : 'other';
  n = Math.max(0, Number(n) || 0);
  const d = daily();
  if (src === 'game') {
    n = Math.min(n, gameCap() - (d.xp.game || 0));
    if (n <= 0) { if (!d.gameTold) { d.gameTold = true; xpNotes.push(['今日切磋修為已滿', '再玩純屬娛樂～']); } return 0; }
  }
  if (!n) return 0;
  const before = realmOf(cfg.xp), sBefore = stageOf(cfg.xp), wasDone = isDone(), hBefore = heaven();
  const room = MAX_XP - cfg.xp;
  cfg.xp += Math.min(n, room);
  if (n > room) cfg.merit = (cfg.merit || 0) + (n - Math.max(0, room));
  d.xp[src] = (d.xp[src] || 0) + n;
  if (realmOf(cfg.xp) > before || (!wasDone && isDone())) pending = true;
  else if (!wasDone && stageOf(cfg.xp) > sBefore) xpNotes.push([`${REALMS[before]}${STAGES[stageOf(cfg.xp)]}了！`, stageOf(cfg.xp) === 3 ? '離突破只差一步' : '穩紮穩打']);
  if (heaven() > hBefore) ascend = true;
  if (now() - lastSave > 30000) { lastSave = now(); saveCfg(); }
  if (tray) tray.setToolTip('桌面靈寵｜' + realmText());
  pushState();
  return n;
}
function dayXp(d) { return Object.values((d && d.xp) || {}).reduce((a, b) => a + (Number(b) || 0), 0); }
// 今天的次數與各來源修為。換日時把昨天收進歷史、結算連續修煉
function daily() {
  const t = today();
  if (!cfg.daily || cfg.daily.date !== t) {
    const prev = cfg.daily, st = cfg.stats = cfg.stats || {};
    if (prev && prev.date) cfg.history = [...(cfg.history || []), { date: prev.date, xp: Math.round(dayXp(prev)), min: prev.min || 0 }].slice(-30);
    // 連續修煉：隔一到三天都算連續（週末不開電腦不會斷），更久就重新算
    const gap = prev && prev.date ? Math.round((Date.parse(t) - Date.parse(prev.date)) / 86400000) : 0;
    st.streak = gap >= 1 && gap <= 3 ? (st.streak || 1) + 1 : 1;
    st.bestStreak = Math.max(st.bestStreak || 1, st.streak);
    cfg.daily = { date: t, clicks: 0, pills: 0, wrote: false, min: 0, xp: {} };
    if (st.streak > 1) {
      const n = st.streak, bonus = 5 * Math.min(n - 1, 6);
      setTimeout(() => { gain(bonus, 'bonus'); xpNotes.push([`連續修煉 ${n} 天`, `修為 +${bonus}`]); }, 0);
    }
  }
  if (!cfg.daily.xp) cfg.daily.xp = {};
  return cfg.daily;
}
function stat(key, n) {
  cfg.stats = cfg.stats || {};
  cfg.stats[key] = (cfg.stats[key] || 0) + (n || 1);
  const d = today();
  if (cfg.stats.lastDay !== d) { cfg.stats.lastDay = d; cfg.stats.days = (cfg.stats.days || 0) + 1; }
}
// 有話要說（小境界、每日上限、連續修煉）就等牠有空時說
function flushXpNotes() {
  if (!xpNotes.length || BUSY.includes(state) || spar || demon || deliver || pending) return;
  if (['idle', 'walk'].includes(state)) set('happy', 1300);
  sayLines(xpNotes.shift(), 2400);
}
function touchGain() {   // 摸頭、點牠：每次 +1，每天最多 30
  const d = daily();
  if (d.clicks < 30) { d.clicks += 1; gain(1, 'pet'); }
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
  if (r < 0.69) { say(idleLine()); }
  else if (r < 0.72) { if (!(Date.now() - lastStory > 15 * 60000 && tellStory())) encourage(); }
  else if (r < 0.75) recite();
  if (pos.x < l.xmin || pos.x > l.xmax) { dir = pos.x < l.xmin ? 1 : -1; return set('walk', 1500); }
  set('idle', rnd(2000, 6000));
}
function startPeek() {
  const l = limits();
  dir = pos.x - l.xmin < l.xmax - pos.x ? -1 : 1;
  set('peekout', 15000);
}
const KUNGFU = ['leap', 'hover', 'land', 'swordland', 'climb', 'hang', 'vanish', 'appear'];   // 輕功動作（都在空中，自己處理位置）
const BUSY = ['drag', 'fall', 'tribulation', 'roll', 'foxride', ...KUNGFU];

// ---- 角色的故事：照境界一段一段說；同門在旁邊時，兩隻會聊彼此的關係
let lastStory = 0;
function storyOf(sp) { return (LORE.CHARS[sp] || LORE.CHARS.cat).story; }
function tellStory(force) {
  const sp = cfg.species, list = storyOf(sp);
  cfg.loreSeen = cfg.loreSeen || {};
  const seen = cfg.loreSeen[sp] || 0, next = list[seen];
  if (next && next.realm <= realm()) {
    cfg.loreSeen[sp] = seen + 1; saveCfg(); lastStory = Date.now();
    sayLines(next.lines, 2700);
    return true;
  }
  if (!force) return false;
  if (next) sayLines(['後面的事……', `等你到${REALMS[next.realm]}再說`], 2600);
  else if (seen) sayLines(['我的故事都說完了', ...list[Math.floor(Math.random() * seen)].lines], 2700);
  return false;
}
function idleLine() {   // 閒聊：角色自己的口頭禪、一般閒話、打氣話
  const r = Math.random(), c = LORE.CHARS[cfg.species];
  if (c && r < 0.4) return Q.pick(c.idle);
  return r < 0.7 ? CHAT[Math.floor(Math.random() * CHAT.length)] : Q.pick(Q.CHEER);
}
function pairTalk() {   // 同門對話：一句一句輪流說
  if (!comp) return false;
  const ex = LORE.PAIRS[`${cfg.species}-${compSpecies()}`];
  if (!ex) return false;
  const turns = Q.pick(ex);
  turns.forEach((tn, i) => setTimeout(() => {
    if (tn.who === 'a') say(tn.text, true); else compSend('say', tn.text);
  }, i * 2600));
  return true;
}

// ---- 每日一卦：一天一次，搖銅錢起卦，頭上顯示卦象，白話解卦
let hexShow = null;
function divine() {
  if (BUSY.includes(state)) return;
  lastTouch = now();
  const d = cfg.divine;
  if (d && d.date === today()) {   // 今天已經卜過：再念一次，但不重抽
    const h = HEX[d.n - 1];
    hexShow = h.lines; set('hexagram', 9000);
    sayLines(['天機不可多問', `今天是${h.name}`, ...h.advice]);
    return;
  }
  const h = HEX[Math.floor(Math.random() * HEX.length)];
  cfg.divine = { date: today(), n: h.n }; saveCfg();
  set('divine', 2600); say('誠心起卦……', true);
  setTimeout(() => {
    hexShow = h.lines; pushState();
    set('hexagram', Math.max(9000, (h.plain.length + h.advice.length + 3) * 2700));
    sayLines([`第 ${h.n} 卦・${h.luck}`, h.name, `「${h.gua}」`, ...h.plain, ...h.advice], 2700);
  }, 2600);
}

// ---- 摸哪裡有講究：點到的部位不同，反應不同
let touchZone = '', touchAt = 0;
const TOUCH = {
  ear: ['耳朵好癢～', '別拉耳朵！', '耳朵是聽天道的'], head: ['點我天靈蓋？大膽！', '靈台清明～', '額頭的印記是傳承'],
  tail: ['尾巴不能摸！', '哼，炸毛了', '尾巴是本座的命根子'], belly: ['肚子給你摸～', '嘿嘿，舒服', '肚裡有金丹，輕點'],
  feet: ['腳底好癢！', '別搔腳啦～', '這雙腳踏過三山五嶽'],
};
function onTouch(zone) {
  touchZone = zone; touchAt = now();
  if (zone === 'laugh') {
    const first = !(cfg.stats && cfg.stats.laughFound);
    stat('laughFound'); touchGain();
    set('laugh', 2200);
    say(first ? '被你發現笑穴了！哈哈哈' : ['哈哈哈別點那裡！', '笑到岔氣了！', '饒命啊哈哈'][Math.floor(Math.random() * 3)], true);
    return true;
  }
  if (TOUCH[zone]) {
    touchGain();
    set(zone === 'tail' ? 'startle' : zone === 'belly' ? 'belly' : zone === 'head' ? 'startle' : 'happy', zone === 'belly' ? 2200 : 1300);
    say(Q.pick(TOUCH[zone]));
    return true;
  }
  return false;
}

// ---- 比法術（快速連點五下）與比劍（游標在牠身上來回揮）
// 十秒一場：你每出手一次算一擊；牠每隔兩秒左右會亮紅光準備反擊，0.8 秒內再出手就「擋！」，沒擋到扣一顆心。
let spar = null, swipes = [];
const SPAR_MS = 10000, COUNTER_MS = 800;
const SPAR = {
  spell: { state: 'spell', need: 25, start: '要比法術？看我五雷符！', counter: '看我反擊！' },
  sword: { state: 'sword', need: 30, start: '要比劍？接招！', counter: '看劍！' },
};
function sparInfo() {
  if (!spar) return null;
  return { kind: spar.kind, hits: spar.hits, need: SPAR[spar.kind].need, hearts: spar.hearts, blocks: spar.blocks,
    counter: !!spar.counter, hurt: spar.hurtAt, blockAt: spar.blockAt, sound: cfg.sound !== false, flying: spar.flying, running: spar.running, vx: Math.round(spar.vx || 0), vy: Math.round(spar.vy || 0), blinkAt: spar.blinkAt || 0, combo: spar.combo, maxCombo: spar.maxCombo, crits: spar.crits };
}
function startSpar(kind) {
  const t = now();
  spar = { kind, hits: 0, hearts: 3, blocks: 0, until: t + SPAR_MS, counter: null, nextCounter: t + rnd(1600, 2400), hurtAt: 0, blockAt: 0, target: null, nextMove: t + 900, flying: false, running: false, combo: 0, maxCombo: 0, crits: 0, lastAct: 0 };
  lastTouch = t;
  set(SPAR[kind].state, SPAR_MS); say(SPAR[kind].start, true);
}
function sparAct() {   // 你出手一次（法術：點一下；劍：揮一下）
  const t = now();
  spar.combo = t - spar.lastAct < 1000 ? spar.combo + 1 : 1;   // 一秒內接著出手才算連擊
  spar.lastAct = t; spar.maxCombo = Math.max(spar.maxCombo, spar.combo);
  if (Math.random() < 0.1 + Math.min(0.15, spar.combo * 0.005)) { spar.crits += 1; spar.hits += 2; }   // 暴擊：連擊越高越容易
  if (spar.counter) {   // 牠正要反擊：這一下算格擋
    spar.counter = null; spar.blocks += 1; spar.hits += 2; spar.blockAt = t;
    spar.nextCounter = t + rnd(1700, 2600);
    say(['擋下了！', '好身手！', '破招！'][Math.floor(Math.random() * 3)], true);
  } else {
    spar.hits += 1;
    const need = SPAR[spar.kind].need;
    if (spar.hits === Math.floor(need / 2)) say('有兩下子！', true);
    if (spar.hits === need) say(spar.kind === 'spell' ? '好強的法力！' : '好快的劍！', true);
  }
  set(SPAR[spar.kind].state, Math.max(200, spar.until - t));   // 重設動畫時間，讓每一下都有火花
}
function sparTick(t) {
  if (!spar) return;
  if (t > spar.until) return endSpar();
  if (!spar.counter && t > spar.nextCounter && spar.until - t > 900) {
    spar.counter = { at: t }; say(SPAR[spar.kind].counter, true); pushState();
  } else if (spar.counter && t - spar.counter.at > COUNTER_MS) {   // 沒擋到
    spar.counter = null; spar.hearts -= 1; spar.hurtAt = t;
    spar.nextCounter = t + rnd(1800, 2800);
    if (spar.hearts <= 0) return endSpar();
    say(['中！', '被打到了吧～', '破綻！'][Math.floor(Math.random() * 3)], true);
    pushState();
  }
}
function endSpar() {
  if (!spar) return;
  const { kind, hits, hearts, blocks, maxCombo, crits } = spar, need = SPAR[kind].need;
  spar = null;
  const win = hearts > 0 && hits >= need;
  const airborne = pos.y < limits().ground - 5;
  const xp = win ? Math.min(15, 3 + Math.floor(hits / 6) + blocks + Math.floor(maxCombo / 10)) : Math.min(5, Math.floor(hits / 8) + blocks);
  const got = xp ? gain(xp, 'game') : 0;
  if (win) stat(kind === 'spell' ? 'spellWins' : 'swordWins');
  if (airborne) { landAfter = true; set('land'); }   // 在空中就收劍飄下來
  else if (win) set('fireworks', 2400);
  else set(hearts <= 0 ? 'happy' : 'dizzy', 1800);
  const head = win ? (hits >= need * 1.6 ? '神乎其技！' : '道友贏了！') : hearts <= 0 ? '承讓承讓～' : '時間到！';
  sayLines([head, `${kind === 'spell' ? '法術' : '劍招'} ${hits}・連擊 ${maxCombo}`, `暴擊 ${crits}・格擋 ${blocks}`, got ? `修為 +${got}` : xp ? '今日切磋修為已滿' : '再接再厲～'], 2400);
}
function onSwipe() {   // 畫面端：游標在身上來回揮了一下
  const t = now();
  if (spar) { if (spar.kind === 'sword' && t < spar.until) sparAct(); return; }
  if (BUSY.includes(state) || demon || saverVillain) return;   // 反派／BOSS 在場：揮劍是去打牠，不是跟靈寵對練
  swipes = swipes.filter((x) => t - x < 1500); swipes.push(t);
  if (swipes.length >= 3) { swipes = []; startSpar('sword'); }
}

// ---- 心魔來襲：偶爾冒出一隻黑影，說拖延的話；點牠三下（化神以後雙擊出招打兩格）就散
let demon = null, lastDemon = Date.now();
const DEMON_SAYS = [['心魔：「三件事？', '明天再做吧～」'], ['心魔：「再滑一下手機', '就好～」'], ['心魔：「圖明天再改', '業主不會發現」'],
  ['心魔：「休息？', '那是弱者的藉口」'], ['心魔：「考試還久', '先別讀了～」'], ['心魔：「先看一集', '再開始～」']];
function checkDemon(idle) {
  if (demon) { if (Date.now() > demon.until) { demon = null; pushState(); say('心魔溜走了…下次要打牠', true); } return; }
  if (idle >= 60 || Date.now() - lastDemon < 60 * 60000 || !healthFree() || Math.random() > 1 / 120) return;
  lastDemon = Date.now();
  demon = { hp: 3, t0: now(), until: Date.now() + 45000, hitAt: 0 };
  set('happy', 300); pushState();
  sayLines([...Q.pick(DEMON_SAYS), '道友快點牠，打散心魔！'], 2600);
}
function hitDemon(big) {
  demon.hp -= big ? 2 : 1; demon.hitAt = now();
  if (demon.hp <= 0) {
    demon = null; gain(15, 'omen'); stat('demons'); set('fireworks', 2200);
    say('心魔散了！多謝道友護法，修為 +15', true);
  } else { set('strike', 700); strikeMove = 'flick'; say(['喝！', '看招！', '再一下！'][Math.floor(Math.random() * 3)], true); }
  pushState();
}

// ---- 宵禁燈籠：過了你設定的時間，牠提燈籠打哈欠，每半小時溫和勸你收工
let lastCurfewSay = 0;
function curfewOn() {
  if (!cfg.curfew) return false;
  const h = new Date().getHours();
  if (cfg.curfew === 0.5) return h < 4;   // 凌晨 0 點以後
  return h >= cfg.curfew || h < 4;
}
function checkCurfew(idle) {
  if (!curfewOn() || idle >= 60 || Date.now() - lastCurfewSay < 30 * 60000 || !healthFree()) return;
  lastCurfewSay = Date.now();
  const m = daily().min;
  set('yawn', 1800);
  sayLines(['呵～欠～', '夜深了，道友', `今天用了 ${Math.floor(m / 60)} 小時 ${m % 60} 分`, Q.pick(['收工歇息吧～', '明天再戰！', '睡飽才有靈感'])], 2600);
}

// ---- 鎖定螢幕：鎖住時立刻打坐；回來時說你下山多久
let lockAt = 0;
function onLock() { lockAt = Date.now(); if (!BUSY.includes(state)) set('sleep', 24 * 3600000); }
function onUnlock() {
  if (!lockAt) return;
  const mins = Math.round((Date.now() - lockAt) / 60000);
  lockAt = 0;
  if (BUSY.includes(state)) return;
  set('happy', 1600);
  say(mins >= 1 ? `道友下山 ${mins} 分鐘，歸來了` : '道友回來啦', true);
}

// ---- 小遊戲與天象視窗：三仙歸洞、比劍、天降祥瑞、流星許願
let gameWin = null, omenWin = null, wishWin = null, nextOmen = Date.now() + rnd(40, 120) * 60000;
function gameInfo() {
  return { species: cfg.species, hat: cfg.hat, robe: cfg.robe, gear: cfg.gear, realm: realm(), realmName: REALMS[realm()], scale: cfg.scale };
}
function openGame(file, w, h) {
  if (gameWin && !gameWin.isDestroyed()) { gameWin.focus(); return; }
  if (BUSY.includes(state)) return;
  const a = area(), cx = pos.x + W() / 2, cy = pos.y + W() * 0.6;
  const x = Math.round(Math.max(a.x, Math.min(a.x + a.width - w, cx - w / 2)));
  const y = Math.round(Math.max(a.y, Math.min(a.y + a.height - h, cy - h * 0.75)));
  gameWin = new BrowserWindow({
    x, y, width: w, height: h, frame: false, transparent: true, resizable: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: path.join(__dirname, 'game-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  gameWin.setAlwaysOnTop(true, 'floating');
  gameWin.loadFile(path.join(__dirname, file));
  gameWin.once('ready-to-show', () => { gameWin.show(); gameWin.focus(); });
  gameWin.on('closed', () => { gameWin = null; if (win && !win.isDestroyed()) win.showInactive(); });
  win.hide();   // 遊戲視窗裡有一隻牠，桌面上那隻先藏起來
  lastTouch = now();
}
function startOmen(kind) {
  if (omenWin && !omenWin.isDestroyed()) return;
  const a = screen.getPrimaryDisplay().workArea;
  kind = kind || Q.pick(['koi', 'crane', 'rainbow', 'meteor', 'koi', 'meteor']);
  omenWin = new BrowserWindow({
    x: a.x, y: a.y, width: a.width, height: a.height, frame: false, transparent: true, resizable: false, skipTaskbar: true,
    hasShadow: false, focusable: false, alwaysOnTop: true, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: path.join(__dirname, 'game-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  omenWin.setAlwaysOnTop(true, 'floating');
  omenWin.setIgnoreMouseEvents(true, { forward: true });
  omenWin.loadFile(path.join(__dirname, 'omen.html'));
  omenWin.once('ready-to-show', () => { omenWin.showInactive(); omenWin.webContents.send('game-start', { kind }); });
  omenWin.on('closed', () => { omenWin = null; });
  setTimeout(() => { if (omenWin && !omenWin.isDestroyed()) omenWin.close(); }, 20000);   // 保險：最多 20 秒
  const line = { koi: '看！金色錦鯉！', crane: '仙鶴飛過，吉兆！', rainbow: '彩虹出來了～', meteor: '流星！快點它許願！' }[kind];
  if (!BUSY.includes(state)) { set('happy', 1500); say(line, true); }
}
function checkOmen(idle) {
  if (idle >= 60 || Date.now() < nextOmen || !healthFree()) return;
  nextOmen = Date.now() + rnd(60, 180) * 60000;   // 很少見：大約一兩個小時一次
  startOmen();
}
function openWish() {
  if (wishWin && !wishWin.isDestroyed()) { wishWin.focus(); return; }
  wishWin = new BrowserWindow({
    width: 400, height: 460, resizable: false, title: '流星許願', alwaysOnTop: true, autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'game-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  wishWin.loadFile(path.join(__dirname, 'wish.html'));
  wishWin.once('ready-to-show', () => wishWin.show());
  wishWin.on('closed', () => { wishWin = null; });
}
ipcMain.handle('game-info', () => gameInfo());
ipcMain.handle('game-wishes', () => (cfg.wishes || []).slice().reverse());
ipcMain.on('game-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && !w.isDestroyed()) w.close(); });
ipcMain.on('game-clickable', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && !w.isDestroyed()) w.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('game-result', (_e, r) => {
  if (!r || typeof r !== 'object') return;
  if (r.game === 'cups') {
    const wins = Math.max(0, Math.min(10, Number(r.wins) || 0));
    stat('cupsWins', wins);
    const got = gain(Math.min(9, wins * 3), 'game');
    setTimeout(() => say(wins ? `猜中 ${wins} 次${got ? `，修為 +${got}` : '！'}` : '一次都沒猜中，哈哈', true), 300);
  } else if (r.game === 'duel') {
    let got = 0;
    if (r.win) { stat('duelWins'); got = gain(10, 'game'); }
    setTimeout(() => { set(r.win ? 'dizzy' : 'happy', 1600); say(r.win ? `道友劍法高明！${got ? `修為 +${got}` : ''}` : '承讓承讓～下次再比', true); }, 300);
  } else if (r.game === 'omen' && r.clicked) {
    if (r.kind === 'meteor') openWish();
    else if (r.kind === 'koi') { gain(5, 'omen'); say('摸到錦鯉，今天必有好運！修為 +5', true); }
  } else if (r.game === 'wish' && typeof r.text === 'string' && r.text.trim()) {
    cfg.wishes = [...(cfg.wishes || []), { text: r.text.trim().slice(0, 40), at: Date.now() }].slice(-100); saveCfg();
    say('願望收好了，本座幫你記著', true);
  }
});

// ---- 本命技能：每個角色各有絕技（金丹解鎖）、奧義（合體解鎖）、天賦（一直有效）
// sig / ult = [繪圖用的招式代號, 名稱, 喊的話, 說明]；trait = [名稱, 說明]
const SKILL_REALM = { sig: 2, ult: 6 };
const SKILLS = {
  cat: { sig: ['bellwave', '鈴音鎮魂', '鈴音鎮魂！', '搖響師父的鈴鐺，音波一圈圈盪開；心魔在場時直接震散'],
    ult: ['shadows', '九命貓影', '九命貓影！', '化出三道貓影繞身疾走'],
    trait: ['守山', '你離開時牠閉關的修為上限 120 → 200'] },
  fox: { sig: ['foxfire', '狐火', '狐火，去！', '尾尖點起五團青藍狐火，繞身一圈後射出'],
    ult: ['morph', '千面幻化', '看我七十二變！', '一陣煙，變成別的同門，再變回來'],
    trait: ['幻術', '切磋與小遊戲的每日修為上限 60 → 90'] },
  rabbit: { sig: ['pound', '玉杵搗藥', '搗藥搗藥～', '拿出杵臼搗藥，搗出一顆顆小丹丸'],
    ult: ['moonlight', '月華', '月華如練！', '頭上升起滿月，月光灑落'],
    trait: ['月宮靈藥', '靈丹每天 3 顆 → 4 顆'] },
  panda: { sig: ['wok', '掌勺', '大師兄開飯囉！', '架起丹爐顛勺，火光與食材齊飛'],
    ult: ['taiji', '太極推手', '兩儀，推！', '一輪黑白太極在身前轉開，往前推出'],
    trait: ['大師兄的飯', '起身休息回來的修為 +15 → +25'] },
  dragon: { sig: ['rain', '喚雨', '下雨囉～', '頭上聚起一朵雲，下一陣小雨'],
    ult: ['dragonrise', '龍吟', '吼——！', '一道青龍虛影盤旋升天'],
    trait: ['行雲布雨', '喝水提醒時陪你喝完，修為 +5'] },
};
function can2(kind) { return realm() >= SKILL_REALM[kind]; }
function skills() { return SKILLS[cfg.species] || SKILLS.cat; }
function awayCap() { return cfg.species === 'cat' ? 200 : 120; }
function gameCap() { return cfg.species === 'fox' ? 90 : GAME_CAP; }
function pillMax() { return cfg.species === 'rabbit' ? 4 : 3; }
function restGain() { return cfg.species === 'panda' ? 25 : 15; }
let morph = '';   // 狐仙千面幻化：暫時變成的角色
// 狐仙平常也會偷偷變成別的同門，但尾巴藏不住、睫毛也還在——點牠一下就被識破
let disguise = null, lastTrick = 0, poof = 0;   // poof：每變一次身加一，畫面據此冒一陣煙
const TRICK_CAUGHT = ['被你看穿了！', '尾巴又露出來了……', '嘻嘻，剛剛有騙到你嗎？', '下次一定變得更像！'];
function startDisguise() {
  const others = Object.keys(SKILLS).filter((k) => k !== 'fox');
  disguise = { as: others[Math.floor(Math.random() * others.length)], until: now() + 25000 + Math.random() * 20000 };
  lastTrick = now(); poof++; pushState();
}
function endDisguise(caught) {
  if (!disguise) return;
  disguise = null; poof++;
  if (caught) { set('happy', 1300); say(Q.pick(TRICK_CAUGHT), true); } else { say(Q.pick(['還是當自己舒服～', '玩夠了，變回來囉']), true); pushState(); }
}
function foxTrick() {
  if (cfg.species !== 'fox') { if (disguise) { disguise = null; poof++; pushState(); } return; }
  const t = now();
  if (disguise) { if (t > disguise.until && state === 'idle') endDisguise(false); return; }
  if (state === 'idle' && !morph && !spar && !demon && t - lastTouch > 20000 && t - lastTrick > 120000 && Math.random() < 0.0008) startDisguise();
}

// ---- 全螢幕特效：技能的氣勁、月光、雨、龍影畫在一個蓋滿螢幕的透明視窗上（滑鼠穿透），不會被桌寵的小視窗切掉
let fxWin = null, fxOn = false, fxTimer = null;
function playFx(move, dur) {
  if (cfg.fullFx === false) return;
  const w = W(), a = screen.getDisplayNearestPoint({ x: Math.round(pos.x + w / 2), y: Math.round(pos.y + w / 2) }).workArea;
  const arg = { move, dur, dir, scale: cfg.scale, species: cfg.species, robe: cfg.robe, x: pos.x + w / 2 - a.x, y: pos.y + w * 0.77 - a.y, ground: pos.y + w * 0.93 - a.y };
  const go = () => {
    if (!fxWin || fxWin.isDestroyed()) return;
    fxWin.showInactive(); fxWin.webContents.send('fx-play', arg);
    if (win && !win.isDestroyed()) win.moveTop();   // 角色本人留在特效上面
    fxOn = true; pushState();
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => { fxOn = false; pushState(); if (fxWin && !fxWin.isDestroyed()) fxWin.hide(); }, dur + 400);
  };
  try {
    if (fxWin && !fxWin.isDestroyed()) { fxWin.setBounds({ x: a.x, y: a.y, width: a.width, height: a.height }); return go(); }
    fxWin = new BrowserWindow({
      x: a.x, y: a.y, width: a.width, height: a.height, frame: false, transparent: true, resizable: false, skipTaskbar: true,
      hasShadow: false, focusable: false, alwaysOnTop: true, backgroundColor: '#00000000', show: false,
      webPreferences: { preload: path.join(__dirname, 'fx-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    fxWin.setAlwaysOnTop(true, 'floating');
    fxWin.setIgnoreMouseEvents(true);
    fxWin.loadFile(path.join(__dirname, 'fx.html'));
    fxWin.once('ready-to-show', go);
    fxWin.on('closed', () => { fxWin = null; fxOn = false; });
  } catch { fxOn = false; }   // 開不了就算了，小視窗裡還有原本的特效
}

// ---- 快捷輪盤：按住牠不放半秒，周圍浮出一圈常用功能，點一下就用（不必再開右鍵選單）
let wheelWin = null;
function wheelItems() {
  const sk = skills();
  return [
    { id: 'sig', ch: '絕', label: sk.sig[1], on: can2('sig'), why: `${REALMS[SKILL_REALM.sig]}解鎖` },
    { id: 'ult', ch: '奧', label: sk.ult[1], on: can2('ult'), why: `${REALMS[SKILL_REALM.ult]}解鎖` },
    { id: 'feed', ch: '丹', label: `餵靈丹（剩 ${Math.max(0, pillMax() - daily().pills)}）`, on: daily().pills < pillMax(), why: '今天吃完了' },
    { id: 'sit', ch: '坐', label: '打坐修煉', on: true },
    { id: 'roll', ch: '劍', label: '御劍飛行', on: can('roll'), why: `${REALMS[ABILITY.roll]}解鎖` },
    { id: 'todo', ch: '事', label: '今日三件事', on: true },
    { id: 'note', ch: '符', label: '寫傳音符', on: true },
    { id: 'hex', ch: '卦', label: cfg.divine && cfg.divine.date === today() ? '今日卦象' : '求一卦', on: true },
  ];
}
function closeWheel() { if (wheelWin && !wheelWin.isDestroyed()) wheelWin.close(); wheelWin = null; }
function openWheel() {
  if (!win || BUSY.includes(state) || spar) return;
  closeWheel();
  // 牠平常站在螢幕最下緣，所以輪盤是在頭上展開的半圓弧；視窗整個留在螢幕裡，靠邊時弧會往內偏一點
  const w = W(), ww = 640, wh = 300, cx = Math.round(pos.x + w / 2), cy = Math.round(pos.y + w * 0.77);
  const a = screen.getDisplayNearestPoint({ x: cx, y: cy }).workArea;
  const x = Math.max(a.x, Math.min(a.x + a.width - ww, cx - ww / 2)), y = Math.max(a.y, Math.min(a.y + a.height - wh, cy - (wh - 64)));
  const mine = wheelWin = new BrowserWindow({
    x, y, width: ww, height: wh, frame: false, transparent: true, resizable: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: path.join(__dirname, 'fx-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mine.setAlwaysOnTop(true, 'pop-up-menu');
  mine.loadFile(path.join(__dirname, 'wheel.html'));
  mine.once('ready-to-show', () => { if (mine.isDestroyed()) return; mine.show(); mine.focus(); mine.webContents.send('wheel-open', { items: wheelItems(), cx: ww / 2, cy: wh - 64 }); });
  mine.on('blur', () => { if (!mine.isDestroyed()) mine.close(); });
  mine.on('closed', () => { if (wheelWin === mine) wheelWin = null; });
  lastTouch = now();
}
function wheelPick(id) {
  closeWheel();
  if (id === 'sig' || id === 'ult') return startSkill(id);
  if (id === 'feed') return feed();
  if (id === 'sit') return set('sleep', 120000);
  if (id === 'roll') return onRoll(dir);
  if (id === 'todo') return openScroll();
  if (id === 'note') return openNotes();
  if (id === 'hex') return divine();
  if (id === 'more' && win) return menu().popup({ window: win });
}

// ---- 螢幕保護：你離開一陣子，桌面上飄出東西來（每個角色飄的不一樣）。不換畫面：視窗透明、滑鼠穿透，桌面照常看得到。
// 你回來之後還會多飄十幾秒才散掉；游標靠近它們會閃開，點到會炸成光點。
let saverWin = null, saverAt = 0, saverHold = 0, saverLeaving = false;
function openSaver(manual) {
  if (saverWin && !saverWin.isDestroyed()) return;
  if (!manual && (spar || lockAt)) return;
  const w = W(), a = screen.getDisplayNearestPoint({ x: Math.round(pos.x + w / 2), y: Math.round(pos.y + w / 2) }).workArea;
  const mine = saverWin = new BrowserWindow({
    x: a.x, y: a.y, width: a.width, height: a.height, frame: false, transparent: true, resizable: false, skipTaskbar: true,
    hasShadow: false, focusable: false, alwaysOnTop: true, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: path.join(__dirname, 'fx-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  mine.setAlwaysOnTop(true, 'floating');
  mine.setIgnoreMouseEvents(true, { forward: true });
  mine.loadFile(path.join(__dirname, 'saver.html'));
  mine.once('ready-to-show', () => { if (mine.isDestroyed()) return; mine.showInactive(); if (win && !win.isDestroyed()) win.moveTop(); });
  mine.on('closed', () => {
    if (saverWin === mine) { saverWin = null; saverBun = null; saverVillain = null; }
    if (state === 'foxtrain') set('idle', 1200);
    if (state === 'sleep' && !lockAt) set('idle', 1200);
  });
  saverAt = Date.now(); saverLeaving = false;
  saverHold = manual ? Date.now() + 45000 : 0;   // 手動開的：你明明在電腦前，所以先飄 45 秒再說
  if (!BUSY.includes(state) && !manual) saverRest();   // 你不在，牠就打坐（狐仙改成修煉狐火）
  else if (manual && cfg.species === 'fox' && !BUSY.includes(state)) setTimeout(saverRest, 2500);
  stat('savers');
}
function closeSaver() { if (saverWin && !saverWin.isDestroyed()) saverWin.close(); }
function leaveSaver() {   // 你回來了：告訴它慢慢散掉（它自己數完秒會叫 saver-exit）
  if (!saverWin || saverWin.isDestroyed() || saverLeaving) return;
  saverLeaving = true; saverWin.webContents.send('saver-leave');
  const mins = Math.round((Date.now() - saverAt) / 60000);
  if (!BUSY.includes(state)) { set('happy', 1500); say(mins >= 1 ? `道友回來了，守了 ${mins} 分鐘` : '道友回來了', true); }
  const mine = saverWin;
  setTimeout(() => { if (saverWin === mine && saverLeaving) closeSaver(); }, 20000);   // 保險（只關這一次開的；你在玩、取消散掉時不關）
}
// 螢幕保護回報：熊貓看到包子就跑去吃；黑風怪出現就跑去打
let saverBun = null, saverVillain = null, villainSaid = 0;
function saverOrigin() { const b = saverWin && !saverWin.isDestroyed() ? saverWin.getBounds() : { x: 0, y: 0 }; return b; }
let villWin = null;   // 平時黑風怪出現用的透明視窗（跟螢幕保護同一頁，只有反派）
function overlays() { return [saverWin, villWin].filter((w) => w && !w.isDestroyed()); }
function saverCmd(c) { for (const w of overlays()) w.webContents.send('saver-cmd', c); }
// 黑風怪的來歷：每打退一次，靈寵多說一段（和故事裡的心魔、師父的燈連在一起）
const VILLAIN_LORE = [
  ['這是心魔的爪牙', '黑風怪！'],
  ['牠身上有燈油味…', '是師父那盞燈的油'],
  ['心魔在找那盞燈', '派牠來探路'],
  ['牠偷的東西', '都拿去餵心魔了'],
  ['每次你累了不休息', '心魔就壯大一點'],
  ['所以黑風怪越來越多', '道友要記得歇息'],
  ['牠的黑風散開時', '我看見一隻小山妖'],
  ['原來牠是被附身的', '山下的小妖怪'],
  ['再打散牠幾次', '牠就能自由了'],
  ['黑風怪說謝謝你', '牠變回小山妖回家了'],
];
const BOSS_ORDER = ['lamp', 'jiao', 'heart'];
const BOSS_LORE = {
  lamp: ['燈影魔梟倒下了！', '牠手上那盞燈……', '是師父的燈！', '燈裡有師父的聲音', '「好好休息，別讓心魔長大」'],
  jiao: ['九幽黑蛟沉回深淵', '小青龍說牠是龍宮', '被心魔帶走的守衛', '心魔就躲在九幽之下'],
  heart: ['心魔本尊散了！', '原來心魔就是', '大家累積的疲憊', '道友好好休息', '牠就再也長不大了', '師父從燈裡走出來了！'],
};
function nextBoss() {   // 照故事順序；心魔本尊要渡劫才會出現
  const beaten = (cfg.stats && cfg.stats.bossBeat) || {};
  for (const id of BOSS_ORDER) { if (id === 'heart' && realm() < 8) continue; if (!beaten[id]) return id; }
  const pool = BOSS_ORDER.filter((id) => id !== 'heart' || realm() >= 8);
  return pool[Math.floor(Math.random() * pool.length)];
}
function villainLore() { const i = Math.min(VILLAIN_LORE.length - 1, (cfg.stats && cfg.stats.villains) || 0); return VILLAIN_LORE[i]; }
function openVillain(bossId) {   // 平時叫出黑風怪（或 BOSS）；螢幕保護開著就在螢幕保護裡出現
  if (bossId === undefined) {   // 大約每四次遇到一次 BOSS
    cfg.stats = cfg.stats || {}; cfg.stats.meets = (cfg.stats.meets || 0) + 1;
    bossId = cfg.stats.meets % 4 === 0 ? nextBoss() : '';
  }
  if (saverWin && !saverWin.isDestroyed()) { saverWin.webContents.executeJavaScript(`window.saverVillain && window.saverVillain(${JSON.stringify(bossId || '')})`); return; }
  if (villWin && !villWin.isDestroyed()) return;
  const w = W(), a = screen.getDisplayNearestPoint({ x: Math.round(pos.x + w / 2), y: Math.round(pos.y + w / 2) }).workArea;
  const mine = villWin = new BrowserWindow({
    x: a.x, y: a.y, width: a.width, height: a.height, frame: false, transparent: true, resizable: false, skipTaskbar: true,
    hasShadow: false, focusable: false, alwaysOnTop: true, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: path.join(__dirname, 'fx-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  mine.setAlwaysOnTop(true, 'floating');
  mine.setIgnoreMouseEvents(true, { forward: true });
  mine.loadFile(path.join(__dirname, 'saver.html'), { query: bossId ? { mode: 'villain', boss: bossId } : { mode: 'villain' } });
  if (bossId) setTimeout(() => { if (!BUSY.includes(state)) { stopPoem(); say(Q.pick(['好重的魔氣…', 'BOSS 來了！', '是心魔的大將！']), true); } }, 1200);
  mine.once('ready-to-show', () => { if (mine.isDestroyed()) return; mine.showInactive(); if (win && !win.isDestroyed()) win.moveTop(); });
  mine.on('closed', () => { if (villWin === mine) { villWin = null; saverVillain = null; } });
  setTimeout(() => { if (villWin === mine && !mine.isDestroyed()) mine.close(); }, 120000);   // 保險：兩分鐘一定收掉
}
let nextVillainAt = Date.now() + rnd(20, 50) * 60000;
function checkVillain(idle) {   // 平時：大約每 40～90 分鐘（你真的在用電腦、牠也沒在忙時）來一次
  if (idle >= 60 || Date.now() < nextVillainAt || (saverWin && !saverWin.isDestroyed()) || !healthFree()) return;
  nextVillainAt = Date.now() + rnd(40, 90) * 60000;
  openVillain();
}
ipcMain.on('saver-report', (e, r) => {
  if (!r || typeof r !== 'object') return;
  const sw = BrowserWindow.fromWebContents(e.sender), o = sw && !sw.isDestroyed() ? sw.getBounds() : saverOrigin();
  if (r.kind === 'bun' && cfg.species === 'panda') {
    saverBun = { id: String(r.id), x: o.x + Number(r.x), y: o.y + Number(r.y), at: Date.now() };
    if (!saverVillain && ['sleep', 'idle'].includes(state) && !BUSY.includes(state)) { set('bunrun', 9000); say(Q.pick(['包子！', '聞到包子香了！', '我的包子～']), true); }
  } else if (r.kind === 'pethit') {   // 被 BOSS 的黑氣彈打中：踉蹌一下，繼續打
    if (!BUSY.includes(state)) { set('startle', 700); say(Q.pick(['好痛！', '可惡！', '這點傷不算什麼！']), true); }
  } else if (r.kind === 'villain') {
    if (r.state === 'gone') {
      saverVillain = null;
      if (['villainrun', 'strike'].includes(state) || state === 'sleep') {
        if (r.beaten && r.boss) {   // 打倒 BOSS：大獎勵＋一段關鍵劇情
          const id = BOSS_LORE[r.boss] ? r.boss : 'lamp';
          cfg.stats = cfg.stats || {}; cfg.stats.bossBeat = Object.assign({}, cfg.stats.bossBeat, { [id]: ((cfg.stats.bossBeat || {})[id] || 0) + 1 });
          gain(30); stat('bosses'); saveCfg(); set('fireworks', 3600); sayLines(['大獲全勝！修為 +30', ...BOSS_LORE[id]], 2800);
        } else if (r.beaten) { const lore = villainLore(); gain(10); stat('villains'); set('fireworks', 2400); sayLines(['邪不勝正！修為 +10', ...lore], 2600); }
        else { set('dizzy', 1600); say(Q.pick(['讓牠跑了…可惡！', '下次別讓我遇到！']), true); }
      }
      return;
    }
    saverVillain = { x: o.x + Number(r.x), y: o.y + Number(r.y), hp: r.hp, state: r.state };
    if (!['villainrun', 'strike'].includes(state) && !BUSY.includes(state) && Date.now() - villainSaid > 4000) {
      villainSaid = Date.now(); stopPoem(); spar = null; set('villainrun', 30000); say(Q.pick(['何方妖孽！', '黑風怪！哪裡跑！', '休想偷東西！']), true);
    }
  }
});
function saverChase(t, l, k) {   // 在地面上跑向包子或反派（每格呼叫）
  const goal = state === 'bunrun' ? saverBun : saverVillain;
  if (!goal || !overlays().length) { set('idle', 800); return; }
  const tx = goal.x - 100 * k, dx = tx - pos.x, d = dx < 0 ? -1 : 1;
  if (d !== dir) { dir = d; pushState(); }
  const reach = state === 'bunrun' ? 18 * k : 120 * k;
  if (Math.abs(dx) > reach) { pos.x = Math.max(l.xmin, Math.min(l.xmax, pos.x + d * Math.min(Math.abs(dx), 12 * k))); return; }
  if (state === 'bunrun') {   // 到了：包子飛進嘴裡
    const o = saverOrigin();
    saverCmd({ kind: 'eat', id: saverBun.id, x: pos.x + 100 * k - o.x, y: pos.y + 150 * k - o.y });
    saverBun = null; set('eat', 2400); say(Q.pick(['好吃！', '再來一個～', '包子是熊貓的命', '嗯～皮薄餡多']), true); touchGain();
  } else if (t - (saverVillain.lastHit || 0) > 1100) {   // 打反派：每一秒多出一招
    saverVillain.lastHit = t; startStrike(); saverCmd({ kind: 'hit', dmg: 1 }); set('strike', 900);
  }
}

// 狐仙在螢幕保護時不只是睡：一招一招修煉狐火，螢幕上的狐火跟著動
const FOX_MOVES = ['gather', 'cast', 'spin', 'juggle', 'meditate', 'ride', 'ride'];
const FOX_SAY = { ride: ['御劍穿火！', '踏劍遊火海～'], gather: ['狐火，聚！', '聚靈成火～'], cast: ['去！', '狐火，散！'], spin: ['九尾，開！', '轉～轉～'], juggle: ['看我拋火～', '一、二、三！'], meditate: ['吐納……', '練到第幾重了呢'] };
let foxMove = '', foxMoveAt = 0, foxRide = null;
function saverRest() {
  if (cfg.species !== 'fox') return set('sleep', 24 * 3600000);
  foxMove = ''; foxMoveAt = 0; set('foxtrain', 24 * 3600000);
}
function foxTrainTick(t) {   // 每三四秒換一招
  if (t < foxMoveAt) return;
  const choices = FOX_MOVES.filter((m) => m !== foxMove);
  foxMove = choices[Math.floor(Math.random() * choices.length)];
  if (foxMove === 'ride') {   // 御劍穿火：踩著飛劍在狐火之間繞一大圈，再降落
    const a = area(), k = cfg.scale, w = W(), pts = [];
    for (let i = 0; i < 5; i++) pts.push({ x: a.x + a.width * rnd(0.08, 0.92) - w / 2, y: a.y + a.height * rnd(0.12, 0.6) - w * 0.6 });
    foxRide = { pts, i: 0, home: pos.x };
    foxMoveAt = t + 12000;
    set('foxride', 9000); say(Q.pick(FOX_SAY.ride), true);
    return;
  }
  foxMoveAt = t + (foxMove === 'meditate' ? 5000 : rnd(3200, 4200));
  pushState(); stStartPush();
  saverCmd({ kind: 'foxfx', move: foxMove });
  if (Math.random() < 0.55) say(Q.pick(FOX_SAY[foxMove]), true);
}
function stStartPush() { send('state', { state: 'idle', dir, outfit: {} }); pushState(); }   // 讓畫面端的「這一招開始了幾秒」重新計時

function checkSaver(idle) {
  const open = saverWin && !saverWin.isDestroyed();
  if (open) {
    if (idle < 10 && Date.now() > saverHold) leaveSaver();
    else if (!saverLeaving && ['idle', 'walk'].includes(state) && !saverVillain && (!saverHold || cfg.species === 'fox')) saverRest();   // 開始時牠剛好在忙，忙完再坐下（狐仙去修煉）
    return;
  }
  if (cfg.saver && idle >= cfg.saver * 60) openSaver(false);
}
function saverInfo() {
  const poems = POEMS.slice().sort(() => Math.random() - 0.5).slice(0, 8);
  const t = todos();
  return {
    outfit: { species: cfg.species, hat: cfg.hat, robe: cfg.robe, gear: cfg.gear, realm: realm(), done: isDone(), heaven: heaven(), evo: cfg.evolve === false ? 0 : undefined },
    comp: can('companion') ? compSpecies() : '',
    title: isDone() ? heavenText() : REALMS[realm()] + STAGES[stageOf(cfg.xp)], name: (LORE.CHARS[cfg.species] || {}).name || '',
    poems, todayMin: daily().min, left: t.items.filter((x) => x.text && !x.done).map((x) => x.text),
  };
}
function startSkill(kind) {
  const sk = skills()[kind], need = SKILL_REALM[kind];
  if (realm() < need) return say(`${sk[1]}要到${REALMS[need]}才會喔`, true);
  // 打坐、喝水、看遠方、打太極時叫牠：直接醒來出招；真的不行時說原因，不要安靜沒反應
  if (spar) return say('鬥法中，先打完這場！', true);
  if (['warn', 'struck'].includes(state)) return say('天雷當頭，先閃開！', true);
  if (BUSY.includes(state) || state === 'tribulation') return say('等我落地再說～', true);
  if (['strike', 'eat'].includes(state)) return;   // 正在出招或吃東西：這一下忽略
  if (['sleep', 'taichi', 'drink', 'gaze'].includes(state)) { stopPoem(); if (state === 'sleep') say('出關！', true); }
  lastTouch = now(); stat('strikes'); strikeMove = sk[0];
  if (sk[0] === 'bellwave' && demon) { demon.hp = 1; say(sk[2], true); return hitDemon(false); }   // 鈴音震散心魔
  const dur = kind === 'ult' ? 4200 : 2300;
  set('strike', dur); say(sk[2], true);
  playFx(sk[0], dur);
  if (sk[0] === 'morph') {   // 千面幻化：一陣煙換一個樣子，四位同門輪流變一遍，最後變回自己
    disguise = null;
    const others = Object.keys(SKILLS).filter((k) => k !== cfg.species).sort(() => Math.random() - 0.5);
    others.forEach((sp, i) => setTimeout(() => { if (state !== 'strike') return; morph = sp; poof++; pushState(); }, 350 + i * 700));
    setTimeout(() => { morph = ''; poof++; pushState(); }, 3300);
  }
  if (kind === 'ult' && !daily().ultDone) { daily().ultDone = true; const g = gain(10, 'skill'); setTimeout(() => xpNotes.push(['今日首次施展奧義', `修為 +${g}`]), 0); }
}

// ---- 雙擊出招（化神）
let strikeMove = '', lastClickAt = 0;
const MOVES = { palm: '降龍十八掌！', circle: '太極生兩儀～', bell: '金鐘罩！', flick: '彈指神通！' };
function startStrike() {
  // 雙擊一開始就能用：煉氣、築基是彈指神通；金丹起是自己的絕技；化神起絕技和四式武學各半
  if (can2('sig') && (realm() < 4 || Math.random() < 0.5)) return startSkill('sig');
  const keys = Object.keys(MOVES);
  strikeMove = realm() < 4 ? 'flick' : keys[Math.floor(Math.random() * keys.length)];
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
  stat('dodges'); gain(20, 'thunder');
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
  if (Date.now() - comp.said > 90000 && Math.random() < 0.004 && !poemTimer && !spar) {   // 偶爾聊兩句，透露兩隻的關係
    comp.said = Date.now();
    if (!pairTalk()) compSend('say', Q.pick(['師兄等等我', '今天也一起修煉', '一起加油！']));
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
  const w = W(); if (cur.x >= pos.x && cur.x <= pos.x + w && cur.y >= pos.y && cur.y <= pos.y + w) { shakes = []; return; }   // 在身上揮是比劍
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
    if (left === 0) { gain(80, 'todo'); stat('allDone'); if (free) set('fireworks', 3600); sayLines(['三件都完成了！', '修為 +80', ...Q.verseLines(Q.pick(Q.VERSE))]); }
    else { gain(20, 'todo'); if (free) set('happy', 1500); sayLines([Q.pick(Q.DONE), `修為 +20，還剩 ${left} 件`]); }
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
  const r = realm(), st = cfg.stats || {}, d = daily(), done = isDone(), h = heaven();
  const top = r + 1 < NEED.length ? NEED[r + 1] : MAX_XP;
  const week = [...(cfg.history || []).slice(-6), { date: d.date, xp: Math.round(dayXp(d)), min: d.min }];
  return {
    realm: r, realmName: REALMS[r], stage: stageOf(cfg.xp), stageName: STAGES[stageOf(cfg.xp)], done, xp: Math.floor(cfg.xp),
    title: done ? heavenText() : REALMS[r] + STAGES[stageOf(cfg.xp)],
    cur: done ? MAX_XP : NEED[r], next: done ? MAX_XP : top,
    // 小境界的門檻（給進度條畫刻度）
    marks: done ? [] : [1, 2, 3].map((k) => ({ name: STAGES[k], at: NEED[r] + (top - NEED[r]) * k / 4 })),
    heaven: { n: h, max: HEAVEN_MAX, step: HEAVEN_STEP, merit: Math.floor(cfg.merit || 0), into: h >= HEAVEN_MAX ? HEAVEN_STEP : Math.floor((cfg.merit || 0) % HEAVEN_STEP) },
    realms: REALMS.map((name, i) => ({ name, need: NEED[i], unlock: UNLOCK[i], got: r >= i })),
    today: { total: Math.round(dayXp(d)), by: Object.keys(SRC).filter((k) => d.xp[k]).map((k) => ({ name: SRC[k], xp: Math.round(d.xp[k]) })).sort((a, b) => b.xp - a.xp) },
    week,
    caps: [
      { name: '專注工作', used: Math.min(WORK_CAP, Math.round(d.xp.work || 0)), max: WORK_CAP },
      { name: '切磋與小遊戲', used: Math.min(gameCap(), Math.round(d.xp.game || 0)), max: gameCap() },
      { name: '摸頭', used: d.clicks || 0, max: 30 },
      { name: '靈丹', used: (d.pills || 0) * 30, max: pillMax() * 30 },
    ],
    late: curfewOn(),
    skills: ['sig', 'ult'].map((k) => ({ kind: k === 'sig' ? '絕技' : '奧義', name: skills()[k][1], desc: skills()[k][3], need: REALMS[SKILL_REALM[k]], got: r >= SKILL_REALM[k] }))
      .concat([{ kind: '天賦', name: skills().trait[0], desc: skills().trait[1], need: '', got: true }]),
    stats: { days: st.days || 1, streak: st.streak || 1, bestStreak: st.bestStreak || st.streak || 1, todayMin: d.min, totalMin: st.totalMin || 0, todosDone: st.todosDone || 0, allDone: st.allDone || 0,
      breaks: st.breaks || 0, gazes: st.gazes || 0, dodges: st.dodges || 0, strikes: st.strikes || 0, demons: st.demons || 0 },
    sources: [
      { what: '在電腦前用（離開不算）', gain: '每分鐘 +1（一天最多 480；過了宵禁時間不加）' }, { what: '劃掉一件事', gain: '+20；三件全成再 +60' },
      { what: '起身休息後回來', gain: '+15' }, { what: '護眼看完 20 秒', gain: '+5' }, { what: '每天第一次寫好三件事', gain: '+10' },
      { what: '摸頭、點牠', gain: '+1（每天最多 30）' }, { what: '餵靈丹', gain: '+30（每天三顆）' }, { what: '你離開時牠自己閉關', gain: '每兩分鐘 +1（最多 120）' },
      { what: '比法術、比劍、三仙歸洞、擂台', gain: '每場最多 +15（一天合計最多 60）' }, { what: '打散心魔、摸到錦鯉', gain: '+15、+5' },
      { what: '連續修煉（隔三天內都算連續）', gain: '每天第一次 +5 × 天數（最多 +30）' },
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
  if (items.some((x) => x.text) && !daily().wrote) { daily().wrote = true; gain(10, 'todo'); }   // 每天第一次寫好三件事 +10
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
  if (daily().pills >= pillMax()) return say(`今天的${'零一二三四'[pillMax()]}顆靈丹吃完了，明天再來`, true);
  if (now() - lastPill < 30000) return say('丹毒未消，等等再吃', true);
  lastPill = now(); daily().pills += 1;
  set('eat', 3200);
}

function tick() {
  foxTrick();
  if (!win || win.isDestroyed()) return;
  const l = limits(), k = cfg.scale, t = now();
  const cur = screen.getCursorScreenPoint();
  tickN++;
  prevPos = { x: pos.x, y: pos.y };
  watchShake(cur, t);
  watchLoop(cur, t);
  sparTick(t);

  if (state === 'drag') {
    if (lastCur) {
      vel.x = vel.x * 0.5 + (cur.x - lastCur.x) * 0.5;
      vel.y = vel.y * 0.5 + (cur.y - lastCur.y) * 0.5;
    }
    lastCur = cur;
    pos.x = cur.x - grab.x; pos.y = cur.y - grab.y;
    updateGrabFace(k);
  } else if (state === 'fall') {
    vel.y += 1.6 * k;
    pos.x += vel.x; pos.y += vel.y;
    maxSpeed = Math.max(maxSpeed, Math.hypot(vel.x, vel.y) / k);
    if (pos.x < l.xmin) { pos.x = l.xmin; vel.x = Math.abs(vel.x) * 0.6; bounces++; throwInfo.wall++; }
    if (pos.x > l.xmax) { pos.x = l.xmax; vel.x = -Math.abs(vel.x) * 0.6; bounces++; throwInfo.wall++; }
    if (pos.y < l.ymin) { pos.y = l.ymin; vel.y = Math.abs(vel.y) * 0.5; throwInfo.ceil++; }
    throwInfo.top = Math.min(throwInfo.top, pos.y);
    // 被往上丟得很高：會御劍的話，在最高點召出飛劍接住自己，慢慢飄下來
    if (vel.y > 0 && !throwInfo.saved && can('roll') && l.ground - pos.y > 320 * k && Math.random() < 0.6) {
      throwInfo.saved = true; set('swordland'); say('好險，御劍接住！', true);   // 腳下真的出現飛劍，踩著降落
    } else if (pos.y >= l.ground) {
      pos.y = l.ground;
      if (vel.y > 9 * k) { vel.y = -vel.y * 0.45; vel.x *= 0.7; bounces++; }
      else landReaction(k);
    }
  } else if (state === 'foxride' && foxRide) {   // 御劍在狐火裡遊走：一個點一個點飛過去，龍頭有轉向感
    const p = foxRide.pts[foxRide.i];
    if (!p || t > until) { set('swordland'); foxRide = null; }
    else {
      const dx = p.x - pos.x, dy = p.y - pos.y, dist = Math.hypot(dx, dy), step = Math.min(dist, Math.max(4 * k, dist * 0.09), 20 * k);
      if (dist > 1) { pos.x += dx / dist * step; pos.y += dy / dist * step; }
      const d = dx < 0 ? -1 : 1; if (d !== dir && Math.abs(dx) > 20 * k) { dir = d; pushState(); }
      if (dist < 30 * k) foxRide.i += 1;
      pos.x = Math.max(l.xmin, Math.min(l.xmax, pos.x)); pos.y = Math.max(l.ymin, Math.min(l.ground, pos.y));
    }
  } else if (spar && (state === 'spell' || state === 'sword')) {
    // 鬥法時不會站著挨打：每隔兩三秒換個位置，用輕功跑、御劍飛、或縮地成寸瞬移，範圍大半個螢幕
    if (t > spar.nextMove) {
      spar.nextMove = t + rnd(1800, 2800);
      const a = area(), r = Math.random();
      const how = can('roll') && r < 0.45 ? 'fly' : r < 0.75 ? 'dash' : 'blink';
      // 跑到角落或邊上（左右各兩成、或貼在最上面）：這一步一定往螢幕中間回來
      const w = W(), relX = (pos.x + w / 2 - a.x) / a.width, relY = (pos.y + w / 2 - a.y) / a.height;
      const cornered = relX < 0.2 || relX > 0.8 || relY < 0.15;
      const tx = cornered
        ? a.x + a.width * rnd(0.35, 0.65) - w / 2
        : Math.max(l.xmin, Math.min(l.xmax, cur.x - 100 * k + rnd(-650, 650) * k));
      const ty = how === 'dash' ? l.ground : Math.max(a.y + 10 * k, Math.min(l.ground - 140 * k, a.y + rnd(cornered ? 0.3 : 0.08, 0.7) * (l.ground - a.y)));
      spar.target = { x: Math.max(l.xmin, Math.min(l.xmax, tx)), y: how === 'blink' && Math.random() < 0.5 ? l.ground : ty, how };
      if (cornered) spar.nextMove = t + rnd(1400, 2000);   // 回到中間後很快再換位置
      if (cornered && Math.random() < 0.6) say(Q.pick(['回中間再戰！', '角落太擠了', '換個地方打！']), true);
      else if (Math.random() < 0.45) say({ fly: '御劍乘風！', dash: Q.pick(['凌波微步！', '踏雪無痕！']), blink: '縮地成寸！' }[how], true);
      if (how === 'blink') {   // 瞬移：直接到新位置，畫面端在新位置畫一圈結界
        prevPos = { x: spar.target.x, y: spar.target.y };
        pos.x = spar.target.x; pos.y = spar.target.y; spar.blinkAt = t; pushState();
      }
    }
    const tg = spar.target;
    if (tg) {
      const dx = tg.x - pos.x, dy = tg.y - pos.y, dist = Math.hypot(dx, dy);
      const fast = tg.how === 'fly' ? 26 : 16;
      const step = Math.min(dist, Math.max(3, dist * 0.12), fast * k);   // 先快後慢，像收勢
      const ox = pos.x, oy = pos.y;
      if (dist > 1) { pos.x += dx / dist * step; pos.y += dy / dist * step; }
      spar.vx = (pos.x - ox) / k; spar.vy = (pos.y - oy) / k;
      spar.running = dist > 4 && pos.y >= l.ground - 2;
      spar.flying = pos.y < l.ground - 5;
    }
    const face = cur.x < pos.x + 100 * k ? -1 : 1;   // 一直面向你
    if (face !== dir || (tickN % 3 === 0)) { dir = face; pushState(); }
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
    } else if (state === 'land' || state === 'swordland') {   // 輕輕飄下來（swordland：踩著飛劍）
      pos.y = Math.min(l.ground, pos.y + 7 * k);
      if (pos.y >= l.ground) { pos.y = l.ground; const sw = state === 'swordland'; set(sw ? 'happy' : 'idle', 1500); if (sw) say('收劍！', true); }
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
    } else if (state === 'foxtrain') {
      if (!saverWin || saverWin.isDestroyed()) set('idle', 800); else foxTrainTick(t);
    } else if (state === 'bunrun' || state === 'villainrun') {
      saverChase(t, l, k);
    } else if (state === 'peekout') {
      const target = dir < 0 ? l.xmin - 46 * k : l.xmax + 46 * k;
      pos.x += dir * 2 * k;
      if ((dir < 0 && pos.x <= target) || (dir > 0 && pos.x >= target)) {
        pos.x = target; dir = -dir; set('peek', rnd(3500, 6000));
      }
    }

    if (pending && ['idle', 'walk', 'sleep'].includes(state)) {
      pending = false; set('tribulation', 3300); say('天劫將至！', true);
    } else if (ascend && !pending && ['idle', 'walk', 'sleep'].includes(state)) {
      ascend = false; saveCfg(); set('fireworks', 3600);
      sayLines([`${heavenText()}！`, heaven() >= HEAVEN_MAX ? '九重天，到頂了' : '功德又滿一重', ...Q.verseLines(Q.pick(Q.VERSE))]);
      refreshUi();
    }

    if (t > until) {
      if (state === 'eat') { set('happy', 1500); say('修為 +30'); gain(30, 'pill'); }
      else if (state === 'tribulation') {
        cfg.seenRealm = realm(); cfg.seenDone = isDone();
        saveCfg(); set('happy', 1800);
        if (isDone()) sayLines(['渡劫圓滿！', ...(cfg.evolve === false ? [] : ['頭後生出光輪了']), '此後修為化為功德', '功德滿了就飛升', ...Q.verseLines(Q.pick(Q.VERSE))]);
        else sayLines([`突破！${REALMS[realm()]}期`, '獲得：', ...chunks(UNLOCK[realm()]), ...(realm() === SKILL_REALM.sig ? [`學會絕技：${skills().sig[1]}`] : realm() === SKILL_REALM.ult ? [`領悟奧義：${skills().ult[1]}`] : []), ...(EVOLVE[realm()] && cfg.evolve !== false ? ['外觀也進化了！', ...chunks(EVOLVE[realm()][cfg.species] || '')] : []), ...Q.verseLines(Q.pick(Q.VERSE))]);
        refreshUi();
      }
      else if (state === 'peek') { set('walk', 2500); }
      else if ((state === 'strike' || state === 'startle') && saverVillain) { set('villainrun', 30000); }
      else if (state === 'bunrun' || state === 'villainrun') { set('idle', 800); }
      else if ((state === 'spell' || state === 'sword') && !spar) { set('idle', 800); }
      else if (state === 'hexagram') { hexShow = null; set('idle', 1500); }
      else if (state === 'warn') { gain(5, 'thunder'); set('struck', 1100); say('被劈了一下…修為 +5', true); }
      else if (state === 'struck') { set('dizzy', 1800); }
      else decide();
    }
  }
  compTick(l, k);
  if (tickN % 3 === 0) for (const w of overlays()) { const o = w.getBounds(); w.webContents.send('saver-cmd', { kind: 'pet', x: pos.x + 100 * k - o.x, y: pos.y + 150 * k - o.y, dir }); }
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
function onClick(zone) {
  const t = now();
  lastTouch = t;
  clicks = clicks.filter((c) => t - c < 2500); clicks.push(t);
  if (spar) { if (spar.kind === 'spell' && now() < spar.until) return sparAct(); if (spar.kind === 'sword' && now() < spar.until) return; endSpar(); }
  if (['fall', 'drag', 'tribulation', 'struck', 'vanish', 'appear'].includes(state)) return;
  if (disguise) { clicks = []; return endDisguise(true); }   // 變裝的狐仙被點到：露餡
  if (state === 'warn') { clicks = []; return dodgeThunder(); }
  const dbl = t - lastClickAt < 380; lastClickAt = t;
  if (demon) return hitDemon(dbl && realm() >= 4);
  if (dbl && can('strike') && !BUSY.includes(state) && !['sleep', 'taichi', 'drink', 'gaze', 'strike'].includes(state)) { clicks = []; return startStrike(); }
  if (state === 'strike') return;
  if (state === 'taichi') { say('別偷懶，一起動！'); return; }
  if (state === 'drink' || state === 'gaze') { say(state === 'drink' ? '咕嚕咕嚕～' : '看遠一點～'); return; }   // 打拳中被點：繼續打
  if (state === 'climb' || state === 'hang') { say('別吵，練功中！'); return; }
  if (state === 'roll' || KUNGFU.includes(state)) { touchGain(); say('抓不到我～'); return; }   // 飛行、輕功中被點：繼續
  if (state === 'sleep') { set('startle', 900); say('修煉被打斷了！'); clicks = []; return; }
  if (clicks.length >= 5 && !BUSY.includes(state) && !saverVillain) { clicks = []; return startSpar('spell'); }   // 連點五下：比法術（反派在場時不比）
  if (onTouch(zone)) return;
  touchGain();
  set('happy', 1500);
}
// 被抓起來的表情看你怎麼抓：剛抓起來嚇一跳；甩很快＝驚嚇；左右晃＝緊閉眼；慢慢移動＝星星眼（好玩）；拿著不動＝享受
// 換表情至少隔 0.5 秒，才不會一直閃
let grabFace = 'shock', grabFaceAt = 0, grabStart = 0, grabFlips = [], grabLastSign = 0, grabStill = 0;
function updateGrabFace(k) {
  const t = now(), sp = Math.hypot(vel.x, vel.y) / k;
  const sgn = Math.abs(vel.x) / k > 3 ? Math.sign(vel.x) : 0;
  if (sgn && grabLastSign && sgn !== grabLastSign) grabFlips.push(t);
  if (sgn) grabLastSign = sgn;
  grabFlips = grabFlips.filter((x) => t - x < 1000);
  grabStill = sp < 1.5 ? grabStill || t : 0;
  let want;
  if (t - grabStart < 350) want = 'shock';
  else if (sp > 24) want = 'shock';
  else if (grabFlips.length >= 3) want = 'squeeze';
  else if (grabStill && t - grabStill > 600) want = 'comfy';
  else if (sp > 5) want = 'star';
  else want = grabFace;
  if (want !== grabFace && t - grabFaceAt > 500) { grabFace = want; grabFaceAt = t; pushState(); }
}
function onDragStart() {
  if (!win) return;
  grabFace = 'shock'; grabFaceAt = grabStart = now(); grabFlips = []; grabLastSign = 0; grabStill = 0;
  lastTouch = now();
  const c = screen.getCursorScreenPoint();
  grab = { x: c.x - pos.x, y: c.y - pos.y };
  lastCur = null; vel = { x: 0, y: 0 };
  win.setIgnoreMouseEvents(false);
  set('drag');
}
let throwInfo = { wall: 0, ceil: 0, top: 0, t0: 0, saved: false };
function landReaction(k) {
  const air = (now() - throwInfo.t0) / 1000, high = (limits().ground - throwInfo.top) / k;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (maxSpeed > 38 || bounces >= 3) { set('dizzy', 2600); say(pick(['走火入魔了…', '天旋地轉～', '眼前好多星星…', '道友下手好重…'])); }
  else if (throwInfo.ceil) { set('startle', 1300); say(pick(['頂到天了！', '頭撞到天花板…', '差點衝破天際'])); }
  else if (throwInfo.wall) { set('startle', 1300); say(pick(['撞牆了…痛痛', '這面牆好硬！', '壁虎功還沒練成…'])); }
  else if (high > 300 && can('chase') && Math.random() < 0.5) { set('happy', 1500); say(pick(['身輕如燕！', '看我穩穩落地', '輕功了得吧？'])); }
  else if (air > 1.2) { set('happy', 1500); say(pick(['飛～好高～', '再丟一次！', '我在飛！'])); }
  else if (maxSpeed < 10) { set('happy', 1200); say(pick(['輕輕放下就好～', '謝謝道友', '咚。'])); }
  else { set('idle', rnd(800, 2000)); if (Math.random() < 0.5) say(pick(['咚！', '摔得好～', '站穩了', '差點趴下'])); }
}
function onDragEnd() {
  if (state !== 'drag') return;
  throwInfo = { wall: 0, ceil: 0, top: pos.y, t0: now(), saved: false };
  const cap = 60 * cfg.scale;
  vel.x = Math.max(-cap, Math.min(cap, vel.x));
  vel.y = Math.max(-cap, Math.min(cap, vel.y));
  maxSpeed = 0; bounces = 0;
  set('fall');
}
function onRoll(d) {
  if (spar) return;   // 鬥法中滾輪不打斷
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
    { label: `餵靈丹（修為 +30，今天還有 ${Math.max(0, pillMax() - daily().pills)} 顆）`, click: feed },
    { type: 'separator' },
    {
      label: '修煉', submenu: [
        { label: '打坐修煉', click: () => set('sleep', 120000) },
        { label: lockLabel('御劍飛行', 'roll'), enabled: can('roll'), click: () => onRoll(dir) },
        { label: lockLabel('來追我', 'chase'), enabled: can('chase'), click: () => { lastTouch = now(); startChase(); } },
        { type: 'separator' },
        { label: `絕技：${skills().sig[1]}${can2('sig') ? '' : `（${REALMS[SKILL_REALM.sig]}解鎖）`}`, enabled: can2('sig'), click: () => startSkill('sig') },
        { label: `奧義：${skills().ult[1]}${can2('ult') ? '' : `（${REALMS[SKILL_REALM.ult]}解鎖）`}`, enabled: can2('ult'), click: () => startSkill('ult') },
        { label: `天賦：${skills().trait[0]}——${skills().trait[1]}`, enabled: false },
        { type: 'separator' },
        { label: '修煉紀錄…', click: openRecords },
      ],
    },
    {
      label: '玩耍', submenu: [
        { label: '躲貓貓', click: () => { lastTouch = now(); startPeek(); } },
        { label: '三仙歸洞（猜杯）', click: () => openGame('cups.html', 460, 300) },
        { label: '比劍', click: () => openGame('duel.html', 600, 360) },
        { type: 'separator' },
        { label: '引出黑風怪（練手）', click: () => openVillain('') },
        { label: '挑戰 BOSS', click: () => openVillain(nextBoss()) },
        { type: 'separator' },
        { label: cfg.divine && cfg.divine.date === today() ? '今日卦象（再看一次）' : '求一卦（每日一次）', click: divine },
        { label: '願望簿', click: openWish },
      ],
    },
    {
      label: '聽牠說', submenu: [
        { label: '聽牠講故事', click: () => tellStory(true) },
        { label: '吟詩一首', click: () => recite(true) },
        { label: '勉勵我一句', click: () => encourage(true) },
      ],
    },
    {
      label: '陪我做事', submenu: [
        { label: scrollWin ? '收起今日三件事' : '今日三件事', click: () => openScroll(true) },
        { label: '寫傳音符…（定時提醒）', click: openNotes },
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
        {
          label: '宵禁燈籠（勸你收工）', submenu: [0, 21, 22, 23, 24].map((h) => ({
            label: h ? `${h === 24 ? '凌晨 0' : h} 點以後` : '關閉', type: 'radio', checked: cfg.curfew === (h === 24 ? 0.5 : h) || (!h && !cfg.curfew),
            click: () => { cfg.curfew = h === 24 ? 0.5 : h; saveCfg(); pushState(); },
          })),
        },
      ],
    },
    {
      label: '同門', submenu: [
        can('companion')
          ? { label: comp ? '請同門回去' : '召喚同門', click: () => (comp ? closeCompanion() : openCompanion()) }
          : { label: lockLabel('召喚同門', 'companion'), enabled: false },
        {
          label: '同門的角色', visible: can('companion'), submenu: SPECIES.filter(([v]) => v !== cfg.species).map(([v, name]) => ({
            label: name, type: 'radio', checked: compSpecies() === v, click: () => { cfg.compSpecies = v; saveCfg(); compPush(); },
          })),
        },
      ],
    },
    { type: 'separator' },
    {
      label: '外觀', submenu: [
        {
          label: '角色', submenu: SPECIES.map(([v, name]) => ({
            label: name, type: 'radio', checked: cfg.species === v,
            click: () => { cfg.species = v; saveCfg(); pushState(); compPush(); set('happy', 1400); sayLines([`化身${name}！`, ...((LORE.CHARS[v] || {}).intro || [])], 2600); },
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
        {
          label: '大小', submenu: [[0.75, '小'], [1, '中'], [1.5, '大']].map(([s, label]) => ({
            label, type: 'radio', checked: cfg.scale === s, click: () => setScale(s),
          })),
        },
        { label: '外觀隨境界進化', type: 'checkbox', checked: cfg.evolve !== false, click: (m) => { cfg.evolve = m.checked; saveCfg(); pushState(); say(m.checked ? '現出真身！' : '變回小時候的樣子', true); } },
      ],
    },
    {
      label: '螢幕保護', submenu: [
        { label: '現在開始', click: () => openSaver(true) },
        { type: 'separator' },
        ...[[0, '關閉'], [3, '閒置 3 分鐘'], [5, '閒置 5 分鐘'], [10, '閒置 10 分鐘'], [20, '閒置 20 分鐘']].map(([m, label]) => ({
          label, type: 'radio', checked: cfg.saver === m, click: () => { cfg.saver = m; saveCfg(); say(m ? `閒置 ${m} 分鐘後飄出來` : '不開螢幕保護了', true); },
        })),
      ],
    },
    {
      label: '設定', submenu: [
        { label: '會說話', type: 'checkbox', checked: cfg.talk, click: (m) => { cfg.talk = m.checked; saveCfg(); } },
        { label: '鬥法音效', type: 'checkbox', checked: cfg.sound !== false, click: (m) => { cfg.sound = m.checked; saveCfg(); } },
        { label: '全螢幕技能特效', type: 'checkbox', checked: cfg.fullFx !== false, click: (m) => { cfg.fullFx = m.checked; saveCfg(); } },
        { label: '永遠在最上層', type: 'checkbox', checked: cfg.top, click: (m) => { cfg.top = m.checked; saveCfg(); win.setAlwaysOnTop(cfg.top, 'floating'); } },
        { label: '開機自動啟動', type: 'checkbox', checked: login, visible: process.platform !== 'linux', click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked }) },
      ],
    },
    { type: 'separator' },
    { label: '解除安裝…', visible: !!uninstaller(), click: uninstall },
    { label: '結束', click: () => app.quit() },
  ]);
}

function create() {
  loadCfg();
  const w = W(), a = screen.getPrimaryDisplay().workArea;
  pos = { x: a.x + a.width - w - 80, y: a.y + a.height - w + 2 * cfg.scale };
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
    powerMonitor.on('lock-screen', onLock); powerMonitor.on('suspend', onLock);
    powerMonitor.on('unlock-screen', onUnlock); powerMonitor.on('resume', onUnlock);
    if (cfg.companion && can('companion')) setTimeout(openCompanion, 2500);
    if (todos().items.some((x) => x.text)) openScroll();
    // 測試用：PET_DEMO=chase 或 roll 啟動，兩秒後自動做那個動作（一般使用不會設這個）
    const demo = process.env.PET_DEMO;
    if (demo === 'saver') setTimeout(() => openSaver(true), 2000);
    else if (demo === 'villainnow') setTimeout(() => openVillain(''), 2500);
    else if (demo && demo.startsWith('boss')) setTimeout(() => openVillain(demo.split(':')[1] || 'lamp'), 2500);
    else if (demo === 'villain') setTimeout(() => { openSaver(true); setTimeout(() => saverWin && saverWin.webContents.executeJavaScript('window.saverVillain && window.saverVillain()'), 3000); }, 2000);
    else if (demo === 'story') setTimeout(() => tellStory(true), 2500);
    else if (demo === 'pair') setTimeout(() => { openCompanion(); setTimeout(pairTalk, 2500); }, 1500);
    else if (demo === 'divine') setTimeout(() => { cfg.divine = null; divine(); }, 2500);
    else if (demo === 'demon') setTimeout(() => { lastDemon = 0; demon = { hp: 3, t0: now(), until: Date.now() + 45000, hitAt: 0 }; pushState(); sayLines([...Q.pick(DEMON_SAYS), '道友快點牠，打散心魔！'], 2600); }, 2500);
    else if (demo === 'curfew') { cfg.curfew = 0.5; lastCurfewSay = 0; setTimeout(() => { const h = new Date().getHours(); cfg.curfew = h >= 4 ? Math.max(21, Math.min(23, h)) : 0.5; if (h >= 4 && h < 21) cfg.curfew = 21; lastCurfewSay = 0; }, 100); }
    else if (demo === 'spell' || demo === 'sword') setTimeout(() => startSpar(demo), 2500);
    else if (demo === 'lock') setTimeout(() => { onLock(); setTimeout(() => { lockAt -= 42 * 60000; onUnlock(); }, 3000); }, 2500);
    else if (demo && demo.startsWith('omen')) setTimeout(() => startOmen(demo.split(':')[1]), 2500);
    else if (demo === 'cups') setTimeout(() => openGame('cups.html', 460, 300), 2500);
    else if (demo === 'duel') setTimeout(() => openGame('duel.html', 600, 360), 2500);
    else if (demo === 'strike') setInterval(() => { if (!BUSY.includes(state)) startStrike(); }, 2600);
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
ipcMain.on('click', (e, zone) => {
  if (!fromComp(e)) return onClick(typeof zone === 'string' ? zone : '');
  touchGain(); compSet('happy'); setTimeout(() => compSet('idle'), 1400);   // 點同門：牠開心一下
  compSend('say', Q.pick(['嘿嘿～', '師兄你看！', '修為 +1']));
});
ipcMain.on('drag-start', (e) => { if (!fromComp(e)) onDragStart(); });
ipcMain.on('drag-end', (e) => { if (!fromComp(e)) onDragEnd(); });
ipcMain.on('roll', (e, d) => { if (!fromComp(e)) onRoll(d); });
ipcMain.on('swipe', (e) => { if (!fromComp(e)) onSwipe(); });
ipcMain.on('menu', () => { if (win) menu().popup({ window: win }); });
ipcMain.on('hold', (e) => { if (!fromComp(e)) openWheel(); });
ipcMain.on('ult', (e) => { if (!fromComp(e)) startSkill('ult'); });
ipcMain.on('wheel-pick', (_e, id) => wheelPick(String(id)));
ipcMain.handle('saver-info', () => saverInfo());
ipcMain.on('saver-exit', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && w === villWin) w.close(); else closeSaver(); });
ipcMain.on('saver-play', () => {   // 你在玩螢幕保護裡的東西：多留 20 秒；如果已經在散，就叫它回來
  if (!saverWin || saverWin.isDestroyed()) return;
  saverHold = Date.now() + 20000;
  if (saverLeaving) { saverLeaving = false; saverWin.webContents.send('saver-stay'); }
});
ipcMain.on('saver-off', () => { cfg.saver = 0; saveCfg(); closeSaver(); say('好，螢幕保護不自動開了（右鍵可再打開）', true); });
ipcMain.on('saver-clickable', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && !w.isDestroyed()) w.setIgnoreMouseEvents(!on, { forward: true }); });

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
global.__pet = { startDisguise, endDisguise, fox: () => ({ disguise, morph, poof }), set, say, feed, gain, grabFace: () => grabFace, updateGrabFace, setVel: (x, y) => { vel = { x, y }; }, startSkill, openWheel, wheelPick, wheelItems, openSaver, closeSaver, leaveSaver, checkSaver, saverInfo, startStrike, wins: () => ({ fx: !!(fxWin && !fxWin.isDestroyed() && fxWin.isVisible()), wheel: !!wheelWin, saver: !!(saverWin && !saverWin.isDestroyed()), fxOn }), gameCap, pillMax, restGain, awayCap, records, daily, realmText, saveCfg, notes: () => xpNotes, onClick, onDragStart, onDragEnd, onRoll, startChase, startPeek, get: () => ({ state, dir, pos, cfg }) };
