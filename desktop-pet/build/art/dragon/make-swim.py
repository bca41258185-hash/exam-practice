"""把側面游動的低多邊形青龍（geo-swim-original.png）轉成「會游」的色塊碎片龍 → ../../../loong-swim.js

每片三角形的頂點記成 (s, d)：s 是沿著身體的位置（0 尾巴、1 龍頭），d 是離身體中線多遠（以身長為單位，往下為正）。
程式再把這些點貼到一條會波動的曲線上，身體就能真的扭動著游。
用法：python3 make-swim.py [碎片大小倍數，預設 1.5]
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import Delaunay

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
K = float(sys.argv[1]) if len(sys.argv) > 1 else 1.5
rng = np.random.default_rng(5)
a = np.asarray(Image.open(os.path.join(HERE, 'geo-swim-original.png')).convert('RGB')).astype(np.float32)
H, W, _ = a.shape
bg = np.median(np.concatenate([a[:30, :30].reshape(-1, 3), a[:30, -30:].reshape(-1, 3), a[-30:, :30].reshape(-1, 3), a[-30:, -30:].reshape(-1, 3)]), axis=0)
near = np.sqrt(((a - bg) ** 2).sum(2)) < 30
lab, _ = ndimage.label(near)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
mask = ndimage.binary_opening(~np.isin(lab, list(edge)), iterations=1)
lab2, n2 = ndimage.label(mask); sizes = ndimage.sum(mask, lab2, range(1, n2 + 1))
mask = ndimage.binary_fill_holes(lab2 == 1 + int(np.argmax(sizes)))
ys, xs = np.nonzero(mask); x0, x1 = xs.min(), xs.max()
BL = float(x1 - x0)
# 身體中線：只看青色的身體（排除鬃毛、角、爪），每一欄取最長那段的中點，再大幅平滑
r, g, b = a[..., 0], a[..., 1], a[..., 2]
teal = mask & (g > r + 30) & (b > r + 20)
cy = np.full(W, np.nan)
for x in range(W):
    col = np.nonzero(teal[:, x])[0]
    if len(col) < 12: continue
    runs = np.split(col, np.nonzero(np.diff(col) > 3)[0] + 1); best = max(runs, key=len)
    if len(best) >= 25: cy[x] = (best[0] + best[-1]) / 2
xv = np.arange(W); ok = ~np.isnan(cy)
cy = np.interp(xv, xv[ok], cy[ok])
cy = ndimage.gaussian_filter1d(cy, 45)

def pick(cands, spacing, taken):
    cell = spacing / 1.5; grid = {}
    for p in taken: grid.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(p)
    out = []
    for p in cands:
        gx, gy = int(p[0] // cell), int(p[1] // cell); okk = True
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for q in grid.get((gx + dx, gy + dy), ()):
                    if (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < spacing * spacing: okk = False; break
                if not okk: break
            if not okk: break
        if okk: out.append(p); grid.setdefault((gx, gy), []).append(p)
    return out
border = mask & ~ndimage.binary_erosion(mask)
bp = np.argwhere(border)[:, ::-1].astype(float); rng.shuffle(bp)
pts = pick(bp, 11 * K, [])
gx = np.abs(np.diff(a, axis=1, append=a[:, -1:]).sum(2)); gy = np.abs(np.diff(a, axis=0, append=a[-1:]).sum(2))
grad = (gx + gy) * ndimage.binary_erosion(mask, iterations=3)
ep = np.argwhere(grad > np.percentile(grad[grad > 0], 92))[:, ::-1].astype(float); rng.shuffle(ep)
pts += pick(ep, 26 * K, pts)
inner = ndimage.binary_erosion(mask, iterations=7)
gxs, gys = np.meshgrid(np.arange(0, W, int(44 * K)), np.arange(0, H, int(44 * K)))
cand = np.stack([gxs.ravel() + rng.uniform(-14, 14, gxs.size), gys.ravel() + rng.uniform(-14, 14, gys.size)], 1)
cand = [p for p in cand if 0 <= p[0] < W and 0 <= p[1] < H and inner[int(p[1]), int(p[0])]]
pts += pick(cand, 30 * K, pts)
P = np.array(pts); tri = Delaunay(P)
yy, xx = np.mgrid[0:H, 0:W]
keep, cols = [], []
for t in tri.simplices:
    A, B, C = P[t]
    area = abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2
    if area < 25: continue
    inside = np.mean([mask[min(H - 1, int((A + (B - A) * u + (C - A) * v)[1])), min(W - 1, int((A + (B - A) * u + (C - A) * v)[0]))] for u, v in [(1/3, 1/3), (0.6, 0.2), (0.2, 0.6), (0.2, 0.2), (0.45, 0.45), (0.1, 0.45), (0.45, 0.1)]])
    if inside < 0.68: continue
    bx0, bx1 = int(max(0, min(A[0], B[0], C[0]))), int(min(W - 1, max(A[0], B[0], C[0])) + 1)
    by0, by1 = int(max(0, min(A[1], B[1], C[1]))), int(min(H - 1, max(A[1], B[1], C[1])) + 1)
    X, Y = xx[by0:by1, bx0:bx1], yy[by0:by1, bx0:bx1]
    d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
    l1 = ((B[1] - C[1]) * (X - C[0]) + (C[0] - B[0]) * (Y - C[1])) / d; l2 = ((C[1] - A[1]) * (X - C[0]) + (A[0] - C[0]) * (Y - C[1])) / d
    m = (l1 >= 0) & (l2 >= 0) & (1 - l1 - l2 >= 0) & mask[by0:by1, bx0:bx1]
    if m.sum() < 6: continue
    keep.append(t); cols.append(a[by0:by1, bx0:bx1][m].mean(0))
cols = np.array(cols)
def hsv(c):
    r_, g_, b_ = c / 255; mx, mn = max(r_, g_, b_), min(r_, g_, b_); v = mx; s = 0 if mx == 0 else (mx - mn) / mx
    if mx == mn: h = 0
    elif mx == r_: h = (60 * ((g_ - b_) / (mx - mn)) + 360) % 360
    elif mx == g_: h = 60 * ((b_ - r_) / (mx - mn)) + 120
    else: h = 60 * ((r_ - g_) / (mx - mn)) + 240
    return h, s, v
roles = []
for c in cols:
    h, s, v = hsv(c)
    if s < 0.2 and v > 0.72: roles.append('cream')
    elif 25 <= h <= 65 and s > 0.28: roles.append('gold')
    elif v < 0.36: roles.append('dark')
    else: roles.append(None)
ti = [i for i, r_ in enumerate(roles) if r_ is None]; lv = np.array([cols[i].mean() for i in ti]); qs = np.percentile(lv, [25, 50, 75])
for i, l in zip(ti, lv): roles[i] = 't1' if l < qs[0] else 't2' if l < qs[1] else 't3' if l < qs[2] else 't4'
ROLE = ['dark', 't1', 't2', 't3', 't4', 'cream', 'gold']
flat = []
for t, r_ in zip(keep, roles):
    for v in t:
        x, y = P[v]; xi = int(min(W - 1, max(0, x)))
        flat += [round((x - x0) / BL, 4), round((y - cy[xi]) / BL, 4)]
    flat.append(ROLE.index(r_))
# 中線本身的彎曲（原圖身體不是完全直的）存起來，程式畫的時候可以拉直或保留
spine = [round((cy[int(x0 + BL * k / 40)] - cy[int(x0 + BL * 0.5)]) / BL, 4) for k in range(41)]
out = {'roles': ROLE, 'tris': flat, 'n': len(keep)}
with open(os.path.join(ROOT, 'loong-swim.js'), 'w', encoding='utf8') as f:
    f.write('// 會游的色塊碎片龍：由 build/art/dragon/make-swim.py 從 geo-swim-original.png 產生，請勿手改。\n')
    f.write('// tris 每 7 個數一片：三個頂點的 (s, d)＋角色索引。s 沿身體 0 尾～1 頭，d 離中線的距離（身長為單位，往下為正）。\n')
    f.write('(function (root) { root.LOONG_SWIM = ' + json.dumps(out, separators=(',', ':')) + '; })(typeof window !== "undefined" ? window : globalThis);\n')
# 預覽：把 (s, d) 貼回一條直線，看看拼起來對不對
pal = ['#12505E', '#1C7C86', '#2E9E9A', '#5CBFB0', '#9ED8C8', '#F3EAD3', '#E2A83A']
img = Image.new('RGB', (1600, 520), (255, 255, 255)); dr = ImageDraw.Draw(img)
for k in range(0, len(flat), 7):
    q = np.array([[60 + flat[k + 2 * j] * 1480, 260 + flat[k + 2 * j + 1] * 1480] for j in range(3)]); c = q.mean(0)
    dr.polygon([tuple(c + (p - c) * max(0, 1 - 2.5 / (np.linalg.norm(p - c) + 1e-6))) for p in q], fill=pal[flat[k + 6]])
img.save(os.path.join(ROOT, 'build', 'loong-swim-flat.png'))
print('三角形', len(keep), '身長(px)', BL)
