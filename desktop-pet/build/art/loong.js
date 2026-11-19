// 畫出龍的四種風格對照圖 → build/loong-styles.png（左：整條；右：龍頭特寫；最右：螢幕保護裡游過去的大小）
// 用法：node build/art/loong.js [風格,風格,...] [輸出檔名]，例如 node build/art/loong.js poly,flat loong-geo.png
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const ROWS = (process.argv[2] || 'real,chibi,ink,gold').split(','), OUT = process.argv[3] || 'loong-styles.png', HT = 40 + ROWS.length * 315;
  const p = await b.newPage({ viewport: { width: 1700, height: HT } });
  p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await p.setContent(`<body style="margin:0"><canvas id="c" width="1700" height="${HT}"></canvas></body>`);
  await p.evaluate((r) => { window.LOONG_ROWS = r; }, ROWS);
  await p.addScriptTag({ path: path.join(__dirname, '..', '..', 'draw.js') });
  await p.evaluate(() => {
    const c = document.getElementById('c').getContext('2d'), KAI = '"AR PL UKai TW","DFKai-SB","KaiTi",serif';
    const HT = c.canvas.height, g = c.createLinearGradient(0, 0, 0, HT); g.addColorStop(0, '#12303A'); g.addColorStop(1, '#1E5A5A'); c.fillStyle = g; c.fillRect(0, 0, 1700, HT);
    const ALL = { real: ['國風寫實', '細長、鹿角、火焰鬃毛'], chibi: ['Q 版萌龍', '和桌寵同畫風：大頭圓眼、短胖'], ink: ['水墨', '墨色、飛白、金色點睛'], gold: ['金龍', '宮廷刺繡色、紅鰭、火焰紋'],
      poly: ['低多邊形', '每節都是明暗三角切面，像摺紙'], flat: ['扁平幾何', '直線、正圓、正三角、六角鱗，像建築圖'], cloud: ['雲中青龍', '青藍鱗身、奶白飄逸鬃毛帶金光、在祥雲裡穿梭'] };
    const rows = (window.LOONG_ROWS || ['real', 'chibi', 'ink', 'gold']).map((k, i) => [k, '①②③④⑤⑥'[i] + ALL[k][0], ALL[k][1]]);
    const spine = (x0, y0, len, amp, n, ph) => Array.from({ length: n }, (_, i) => { const q = i / (n - 1); return [x0 - q * len, y0 + Math.sin(q * 6.5 + ph) * amp]; });
    rows.forEach(([st, name, desc], r) => {
      const y = 40 + r * 315;
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.roundRect(20, y, 1660, 295, 18); c.fill();
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#F6D98A'; c.font = `bold 36px ${KAI}`; c.fillText(name, 44, y + 36); c.fillStyle = 'rgba(230,242,238,.85)'; c.font = `20px ${KAI}`; c.fillText(desc, 44, y + 76);
      const chibi = st === 'chibi';
      // 整條
      c.save(); c.beginPath(); c.rect(20, y, 900, 295); c.clip();
      drawLoong(c, spine(chibi ? 700 : 820, y + 175, chibi ? 1000 : 700, chibi ? 40 : 60, chibi ? 34 : 56, 0.4), chibi ? 1.5 : 1.35, 1.3, { style: st, sg: 1, pearl: true });
      c.restore();
      // 龍頭特寫
      c.save(); c.beginPath(); c.roundRect(940, y + 10, 460, 275, 14); c.clip(); c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(940, y + 10, 460, 275);
      drawLoong(c, spine(chibi ? 1230 : 1250, y + 160, chibi ? 900 : 1100, chibi ? 50 : 70, chibi ? 34 : 56, 0.4), chibi ? 2.3 : 2.7, 1.3, { style: st, sg: 1 });
      c.restore();
      // 螢幕保護裡的大小（淺色桌面上）
      c.save(); c.beginPath(); c.roundRect(1420, y + 10, 240, 275, 14); c.clip(); c.fillStyle = '#D6E2E0'; c.fillRect(1420, y + 10, 240, 275);
      drawLoong(c, spine(1600, y + 150, chibi ? 160 : 230, 18, chibi ? 34 : 48, 0.9), chibi ? 0.8 : 0.7, 1.3, { style: st, sg: 1 });
      c.restore();
    });
  });
  await p.locator('#c').screenshot({ path: path.join(__dirname, '..', OUT) });
  await b.close();
})();
