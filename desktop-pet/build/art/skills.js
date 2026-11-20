// 畫出「本命技能」對照圖：五種角色的絕技與奧義 → build/skills.png
// 用法：node build/art/skills.js
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1450 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await p.setContent('<body style="margin:0"><canvas id="c" width="1500" height="1450"></canvas></body>');
  await p.addScriptTag({ path: path.join(__dirname, '..', '..', 'draw.js') });
  await p.evaluate(() => {
    const c = document.getElementById('c').getContext('2d');
    const KAI = '"AR PL UKai TW","DFKai-SB","BiauKai","KaiTi",serif';
    const g = c.createLinearGradient(0, 0, 0, 1450); g.addColorStop(0, '#12303A'); g.addColorStop(1, '#1E5A5A'); c.fillStyle = g; c.fillRect(0, 0, 1500, 1450);
    const rows = [
      ['cat', '靈貓', 'qing', ['bellwave', '鈴音鎮魂'], ['shadows', '九命貓影'], '守山：離開時閉關上限 120 → 200'],
      ['fox', '狐仙', 'fei', ['foxfire', '狐火'], ['morph', '千面幻化'], '幻術：小遊戲每日上限 60 → 90'],
      ['rabbit', '玉兔', 'yuebai', ['pound', '玉杵搗藥'], ['moonlight', '月華'], '月宮靈藥：靈丹每天 3 → 4 顆'],
      ['panda', '熊貓', 'mo', ['wok', '掌勺'], ['taiji', '太極推手'], '大師兄的飯：休息回來 +15 → +25'],
      ['dragon', '小青龍', 'jin', ['rain', '喚雨'], ['dragonrise', '龍吟'], '行雲布雨：陪你喝水 +5'],
    ];
    c.textAlign = 'center'; c.textBaseline = 'middle';
    [['絕技', '金丹解鎖', 420], ['奧義', '合體解鎖', 880], ['天賦', '一直有效', 1260]].forEach(([a, bb, x]) => { c.fillStyle = '#F6D98A'; c.font = `bold 40px ${KAI}`; c.fillText(a, x, 46); c.fillStyle = 'rgba(230,242,238,.8)'; c.font = `22px ${KAI}`; c.fillText(bb, x, 86); });
    rows.forEach(([sp, name, robe, sig, ult, trait], r) => {
      const y0 = 120 + r * 264;
      c.fillStyle = '#F6D98A'; c.font = `bold 40px ${KAI}`; c.fillText(name, 90, y0 + 110);
      [[sig, 200, 2, [0.5, 1.3]], [ult, 660, 6, [0.7, 1.6]]].forEach(([mv, x0, realm, times]) => {
        times.forEach((st, k) => {
          c.save(); c.translate(x0 + k * 220, y0); c.fillStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.roundRect(0, 0, 210, 210, 14); c.fill();
          c.beginPath(); c.rect(0, 0, 210, 210); c.clip(); c.translate(5, 8);
          const species = mv[0] === 'morph' && k === 1 ? 'panda' : sp;
          drawPet(c, { state: 'strike', dir: 1, t: 10.6 + r * 0.37 + st, st, look: { x: 0, y: 0 }, outfit: { species, hat: 'none', robe, gear: 'none', realm, move: mv[0] } });
          c.restore();
        });
        c.fillStyle = '#FFF3D6'; c.font = `bold 28px ${KAI}`; c.fillText(mv[1], x0 + 215, y0 + 234);
      });
      c.fillStyle = '#E6F2EE'; c.font = `24px ${KAI}`;
      const [a, bb] = trait.split('：'); c.fillStyle = '#F6D98A'; c.font = `bold 30px ${KAI}`; c.fillText(a, 1260, y0 + 90);
      c.fillStyle = '#E6F2EE'; c.font = `20px ${KAI}`; c.fillText(bb, 1260, y0 + 132);
    });
  });
  await p.locator('#c').screenshot({ path: path.join(__dirname, '..', 'skills.png') });
  await b.close();
})();
