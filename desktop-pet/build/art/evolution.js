// 畫出「外觀進化」對照圖：五種角色 × 六個階段 → build/evolution.png
// 用法：node build/art/evolution.js
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1560, height: 1370 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await p.setContent('<body style="margin:0"><canvas id="c" width="1560" height="1370"></canvas></body>');
  await p.addScriptTag({ path: path.join(__dirname, '..', '..', 'draw.js') });
  await p.evaluate(() => {
    const c = document.getElementById('c').getContext('2d');
    const KAI = '"AR PL UKai TW","DFKai-SB","BiauKai","KaiTi",serif';
    const g = c.createLinearGradient(0, 0, 0, 1370); g.addColorStop(0, '#12303A'); g.addColorStop(1, '#1E5A5A'); c.fillStyle = g; c.fillRect(0, 0, 1560, 1370);
    const cols = [['幼年', '煉氣．築基'], ['初成', '金丹．元嬰'], ['通靈', '化神．煉虛'], ['化形', '合體．大乘'], ['渡劫', '渡劫期'], ['圓滿', '渡劫圓滿之後']];
    const rows = [['cat', '靈貓', 'qing'], ['fox', '狐仙', 'fei'], ['rabbit', '玉兔', 'yuebai'], ['panda', '熊貓', 'mo'], ['dragon', '小青龍', 'jin']];
    c.textAlign = 'center'; c.textBaseline = 'middle';
    cols.forEach(([a, bb], i) => { c.fillStyle = '#F6D98A'; c.font = `bold 40px ${KAI}`; c.fillText(a, 270 + i * 220, 50); c.fillStyle = 'rgba(230,242,238,.8)'; c.font = `22px ${KAI}`; c.fillText(bb, 270 + i * 220, 92); });
    rows.forEach(([sp, name, robe], r) => {
      c.fillStyle = '#F6D98A'; c.font = `bold 40px ${KAI}`; c.fillText(name, 80, 250 + r * 235);
      cols.forEach((_, i) => {
        c.save(); c.translate(270 + i * 220 - 110, 130 + r * 235); c.scale(1.1, 1.1);
        drawPet(c, { state: 'idle', dir: 1, t: 10.6 + r * 0.37, st: 1, look: { x: 0, y: 0 }, outfit: { species: sp, hat: 'none', robe, gear: 'none', realm: [0, 2, 4, 6, 8, 8][i], done: i === 5, evo: i } });
        c.restore();
      });
    });
  });
  await p.locator('#c').screenshot({ path: path.join(__dirname, '..', 'evolution.png') });
  await b.close();
})();
