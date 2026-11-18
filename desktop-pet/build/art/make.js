// 重畫封面、圖示、安裝程式側邊圖：在 desktop-pet 資料夾執行  npx electron build/art/make.js
// 會產生 build/icon.png（512）、build/sidebar.png（164x314，再轉成安裝程式要的 BMP）、build/cover.png（1200x630）
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1730, height: 850, show: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true } });
  w.webContents.setZoomFactor(1);
  await w.loadFile(path.join(__dirname, 'art.html'));
  await new Promise((r) => setTimeout(r, 1200));   // 等字型載入
  const out = path.join(__dirname, '..');
  const grab = async (rect, name) => fs.writeFileSync(path.join(out, name), (await w.webContents.capturePage(rect)).toPNG());
  await grab({ x: 1210, y: 0, width: 512, height: 512 }, 'icon.png');
  await grab({ x: 1210, y: 520, width: 164, height: 314 }, 'sidebar.png');
  await grab({ x: 0, y: 0, width: 1200, height: 630 }, 'cover.png');
  app.quit();
});
