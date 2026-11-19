// 用法：node render.js shots 2,10,20   → 存幾張檢查用的畫面到 out/
//       node render.js video           → 逐格畫出來交給 ffmpeg，輸出 out/video.mp4（無聲）
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), http = require('http');
const FPS = 30, out = path.join(__dirname, 'out');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  // 用本機小伺服器開，讓預告片頁面可以直接取用 fx.html、saver.html 畫出來的畫面
  const root = path.join(__dirname, '..', '..'), TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split(/[?#]/)[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  await p.goto(`http://127.0.0.1:${srv.address().port}/build/trailer/trailer.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => { const a = document.getElementById('fxf').contentWindow, b = document.getElementById('svf').contentWindow; return a && a.fxPreview && b && b.saverManual; });
  const grab = (t, q) => p.evaluate(([t, q]) => { render(t); return document.getElementById('c').toDataURL('image/jpeg', q).split(',')[1]; }, [t, q]);
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'shots') {
    for (const t of arg.split(',').map(Number)) { for (let u = Math.max(0, t - 4); u < t; u += 0.1) await p.evaluate((u) => render(u), u);   // 有些段落要連續演才對（螢幕保護），先往前倒帶四秒
      fs.writeFileSync(path.join(out, `shot-${t.toFixed(2).padStart(6, '0')}.jpg`), Buffer.from(await grab(t, 0.8), 'base64')); }
  } else {
    const dur = await p.evaluate(() => DUR), n = Math.round(dur * FPS);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', path.join(out, 'video.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < n; i++) {
      const buf = Buffer.from(await grab(i / FPS, 0.95), 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 300 === 0) console.log(`${i}/${n}`);
    }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  }
  await b.close(); srv.close();
})();
