// Extract the past-paper data (Q, PAGES) from the shuke app and write it as a part file.
const fs = require('fs');
const s = fs.readFileSync('/home/user/shuke/index.html', 'utf8');
const a = s.indexOf('const COMMON');
const b = s.indexOf('];', s.indexOf('const Q=[')) + 2;
const pm = /const PAGES=(\{[^}]*\})/.exec(s) || /PAGES=(\{[^}]*\})/.exec(s);
const Q = new Function(s.slice(a, b) + '; return Q;')();
const PAGES = new Function('return ' + pm[1])();
const out = Q.map(q => ({ id: q.id, t: q.t, area: q.area || null, est: !!q.areaEst, bcr: q.bcr || null, far: q.far || null,
  floors: q.floors || null, score: q.score || '', site: q.site, hard: q.hard, prog: q.prog || [], draw: q.draw, pages: PAGES[q.id] || 0 }));
fs.writeFileSync(process.argv[2], '<script>window.KY_PAST=' + JSON.stringify(out) + ';</script>\n');
console.log(out.length, out.map(q => q.id + ':' + q.pages).join(' '), JSON.stringify(out).length);
