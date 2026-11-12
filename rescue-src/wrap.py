"""Build.  `python3 wrap.py` -> course.html (artifact body) + preview.html (standalone preview).
`python3 wrap.py NAME.html` -> only writes NAME.html as a standalone preview (safe to run in parallel)."""
import glob, sys
body = ''.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob('parts/*.html')))
head = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>')
if len(sys.argv) > 1:
    open(sys.argv[1], 'w', encoding='utf-8').write(head + body + '</body></html>')
else:
    open('course.html', 'w', encoding='utf-8').write(body)
    open('preview.html', 'w', encoding='utf-8').write(head + body + '</body></html>')
print(len(body))
