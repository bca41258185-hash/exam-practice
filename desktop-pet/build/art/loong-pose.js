// 龍的大圖：設計過的 S 形盤繞姿勢 → build/loong-pose-<風格>.png
// 用法：node build/art/loong-pose.js line
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const style = process.argv[2] || 'line';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await p.setContent('<body style="margin:0"><canvas id="c" width="1600" height="1000"></canvas></body>');
  await p.addScriptTag({ path: path.join(__dirname, '..', '..', 'draw.js') });
  await p.evaluate((style) => {
    const c = document.getElementById('c').getContext('2d');
    // 左半：深色桌面；右半：淺色桌面
    c.fillStyle = '#1E3A42'; c.fillRect(0, 0, 800, 1000); c.fillStyle = '#D9E4E2'; c.fillRect(800, 0, 800, 1000);
    const pose = (ox, oy, sc) => loongSpine([[0.74, 0.17], [0.52, 0.2], [0.33, 0.33], [0.36, 0.52], [0.6, 0.58], [0.76, 0.72], [0.6, 0.88], [0.34, 0.87], [0.2, 0.78]].map(([x, y]) => [ox + x * 760 * sc, oy + y * 960 * sc]), 90);
    drawLoong(c, pose(20, 10, 1), 1.35, 1.1, { style, sg: 1, pearl: true });
    drawLoong(c, pose(820, 10, 1), 1.35, 1.1, { style, sg: 1, pearl: true });
  }, style);
  await p.screenshot({ path: path.join(__dirname, '..', `loong-pose-${style}.png`) });
  await b.close();
})();
