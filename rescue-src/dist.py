"""Build the standalone PWA folder from course.html.  usage: dist.py OUTDIR HOME_LINK"""
import os, sys
from PIL import Image, ImageDraw

out, home = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
body = open('course.html', encoding='utf-8').read()
old = 'https://arch-drill.github.io/shuke/'
assert old in body
body = body.replace(old, home)
# the artifact-only meta is not needed standalone; keep title/style from the body itself
head = '''<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="考試急救">
<meta name="theme-color" content="#1b4f9c">
<meta name="robots" content="noindex,nofollow">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-192.png">
<style>html{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
'''
tail = '''
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});</script>
</body>
</html>
'''
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(head + body + tail)

open(os.path.join(out, 'manifest.webmanifest'), 'w', encoding='utf-8').write('''{
 "name": "建築師考試急救",
 "short_name": "考試急救",
 "start_url": "./index.html",
 "scope": "./",
 "display": "standalone",
 "orientation": "any",
 "background_color": "#f3f6f9",
 "theme_color": "#1b4f9c",
 "lang": "zh-Hant",
 "icons": [
  {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
  {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"}
 ]
}
''')

open(os.path.join(out, 'sw.js'), 'w', encoding='utf-8').write('''/* 考試急救：離線快取。只管這個資料夾，不影響上層網站。 */
const C='rescue-v1';
const FILES=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith('rescue-')&&n!==C).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin)return;
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const k=r.clone();caches.open(C).then(c=>c.put('index.html',k))}return r}).catch(()=>caches.match('index.html')));
  return;
 }
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
''')

# icon: blueprint-blue tile, white drafting cross with a small set-square corner
def icon(n):
    im = Image.new('RGB', (n, n), '#1b4f9c')
    d = ImageDraw.Draw(im)
    u = n / 16
    d.rectangle([6.6*u, 3.5*u, 9.4*u, 12.5*u], fill='white')
    d.rectangle([3.5*u, 6.6*u, 12.5*u, 9.4*u], fill='white')
    d.rectangle([1.4*u, 1.4*u, 14.6*u, 14.6*u], outline='#84b4f7', width=max(1, int(u*0.35)))
    return im
for n in (180, 192, 512):
    icon(n).save(os.path.join(out, 'icon-%d.png' % n))
print('built', out, os.path.getsize(os.path.join(out, 'index.html')))
