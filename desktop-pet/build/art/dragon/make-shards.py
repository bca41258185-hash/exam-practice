"""把 AI 畫的低多邊形青龍（geo-lowpoly-original.png）轉成大片三角色塊，輸出給程式用的 loong-shards.js。

做法：去背 → 只留最大的一塊（龍本身，去掉旁邊的祥雲）→ 在輪廓、顏色交界、內部撒點 → 三角剖分 →
每片取原圖的平均色，歸到七種「角色」（深、青一～四、米白、金），程式再依配色表上色。
用法：python3 make-shards.py [碎片大小倍數，預設 1.6]   （輸出 ../../../loong-shards.js 與預覽圖 ../../loong-shards-*.png）
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import Delaunay

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
rng = np.random.default_rng(3)
K = float(sys.argv[1]) if len(sys.argv) > 1 else 1.6   # 碎片大小：越大片數越少

im = Image.open(os.path.join(HERE, 'geo-lowpoly-original.png')).convert('RGB')
a = np.asarray(im).astype(np.float32)
H, W, _ = a.shape
bg = np.median(np.concatenate([a[:30, :30].reshape(-1, 3), a[:30, -30:].reshape(-1, 3), a[-30:, :30].reshape(-1, 3), a[-30:, -30:].reshape(-1, 3)]), axis=0)
near = np.sqrt(((a - bg) ** 2).sum(2)) < 28
lab, _ = ndimage.label(near)
edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
mask = ~np.isin(lab, list(edge_labels))
mask = ndimage.binary_opening(mask, iterations=2)
lab2, n2 = ndimage.label(mask)
sizes = ndimage.sum(mask, lab2, range(1, n2 + 1))
mask = lab2 == (1 + int(np.argmax(sizes)))          # 最大的一塊：龍
mask = ndimage.binary_fill_holes(mask)
ys, xs = np.nonzero(mask)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print('龍的範圍', x0, x1, y0, y1)

def pick(cands, spacing, taken):
    """從候選點裡挑，彼此至少隔 spacing（用格子加速）"""
    cell = spacing / 1.5
    grid = {}
    for p in taken:
        grid.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(p)
    out = []
    for p in cands:
        gx, gy = int(p[0] // cell), int(p[1] // cell); ok = True
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for q in grid.get((gx + dx, gy + dy), ()):
                    if (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < spacing * spacing: ok = False; break
                if not ok: break
            if not ok: break
        if ok: out.append(p); grid.setdefault((gx, gy), []).append(p)
    return out

# 輪廓點：密一點，剪影才準
border = mask & ~ndimage.binary_erosion(mask, iterations=1)
bp = np.argwhere(border)[:, ::-1].astype(float); rng.shuffle(bp)
pts = pick(bp, 15 * K, [])
# 顏色交界點：讓切口沿著原設計的結構（鬃毛、腹部、角）
lum = a.mean(2); gx = np.abs(np.diff(a, axis=1, append=a[:, -1:]).sum(2)); gy = np.abs(np.diff(a, axis=0, append=a[-1:]).sum(2))
grad = (gx + gy) * ndimage.binary_erosion(mask, iterations=4)
thr = np.percentile(grad[grad > 0], 93)
ep = np.argwhere(grad > thr)[:, ::-1].astype(float); rng.shuffle(ep)
pts += pick(ep, 34 * K, pts)
# 內部點：稀疏，碎片才大
inner = ndimage.binary_erosion(mask, iterations=10)
gxs, gys = np.meshgrid(np.arange(0, W, int(58 * K)), np.arange(0, H, int(58 * K)))
cand = np.stack([gxs.ravel() + rng.uniform(-18, 18, gxs.size), gys.ravel() + rng.uniform(-18, 18, gys.size)], 1)
cand = [p for p in cand if 0 <= p[0] < W and 0 <= p[1] < H and inner[int(p[1]), int(p[0])]]
pts += pick(cand, 40 * K, pts)
P = np.array(pts)
print('點數', len(P))
tri = Delaunay(P)

def inside_frac(t):
    A, B, C = P[t]
    s = 0; k = 0
    for u, v in [(1/3, 1/3), (0.6, 0.2), (0.2, 0.6), (0.2, 0.2), (0.45, 0.45), (0.1, 0.45), (0.45, 0.1)]:
        q = A + (B - A) * u + (C - A) * v; k += 1
        s += mask[min(H - 1, int(q[1])), min(W - 1, int(q[0]))]
    return s / k

keep, cols = [], []
yy, xx = np.mgrid[0:H, 0:W]
for t in tri.simplices:
    A, B, C = P[t]
    area = abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2
    if area < 40 or inside_frac(t) < 0.68: continue
    bx0, bx1 = int(max(0, min(A[0], B[0], C[0]))), int(min(W - 1, max(A[0], B[0], C[0])) + 1)
    by0, by1 = int(max(0, min(A[1], B[1], C[1]))), int(min(H - 1, max(A[1], B[1], C[1])) + 1)
    X, Y = xx[by0:by1, bx0:bx1], yy[by0:by1, bx0:bx1]
    d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
    l1 = ((B[1] - C[1]) * (X - C[0]) + (C[0] - B[0]) * (Y - C[1])) / d
    l2 = ((C[1] - A[1]) * (X - C[0]) + (A[0] - C[0]) * (Y - C[1])) / d
    m = (l1 >= 0) & (l2 >= 0) & (1 - l1 - l2 >= 0) & mask[by0:by1, bx0:bx1]
    if m.sum() < 8: continue
    keep.append(t); cols.append(a[by0:by1, bx0:bx1][m].mean(0))
cols = np.array(cols)
print('三角形', len(keep))

# 依顏色分成七種角色
def hsv(c):
    r, g, b = c / 255; mx, mn = max(r, g, b), min(r, g, b); v = mx; s = 0 if mx == 0 else (mx - mn) / mx
    if mx == mn: h = 0
    elif mx == r: h = (60 * ((g - b) / (mx - mn)) + 360) % 360
    elif mx == g: h = 60 * ((b - r) / (mx - mn)) + 120
    else: h = 60 * ((r - g) / (mx - mn)) + 240
    return h, s, v
roles = []
for c in cols:
    h, s, v = hsv(c)
    if s < 0.2 and v > 0.72: roles.append('cream')
    elif 25 <= h <= 65 and s > 0.28: roles.append('gold')
    elif v < 0.36: roles.append('dark')
    else: roles.append(None)
teal_idx = [i for i, r in enumerate(roles) if r is None]
lv = np.array([cols[i].mean() for i in teal_idx])
qs = np.percentile(lv, [25, 50, 75]) if len(lv) else [0, 0, 0]
for i, l in zip(teal_idx, lv):
    roles[i] = 't1' if l < qs[0] else 't2' if l < qs[1] else 't3' if l < qs[2] else 't4'
ROLE = ['dark', 't1', 't2', 't3', 't4', 'cream', 'gold']
from collections import Counter; print(Counter(roles))

# 輸出：座標以龍的高度為 1，左上角為原點
sc = 1 / (y1 - y0)
flat = []
for t, r in zip(keep, roles):
    for v in t: flat += [round((P[v][0] - x0) * sc, 4), round((P[v][1] - y0) * sc, 4)]
    flat.append(ROLE.index(r))
out = {'aspect': round((x1 - x0) / (y1 - y0), 4), 'roles': ROLE, 'tris': flat}
with open(os.path.join(ROOT, 'loong-shards.js'), 'w', encoding='utf8') as f:
    f.write('// 碎片龍的造型：由 build/art/dragon/make-shards.py 從 geo-lowpoly-original.png 產生，請勿手改。\n')
    f.write('// tris 每 7 個數一片：三個頂點 (x, y)（以龍高為 1）＋角色索引（roles）。\n')
    f.write('(function (root) { root.LOONG_SHARDS = ' + json.dumps(out, separators=(',', ':')) + '; })(typeof window !== "undefined" ? window : globalThis);\n')

PALETTES = {
    '青瓷': ['#12505E', '#1C7C86', '#2E9E9A', '#5CBFB0', '#9ED8C8', '#F3EAD3', '#E2A83A'],
    '墨金': ['#151B2E', '#22304F', '#2F4470', '#44608F', '#6F8DB5', '#E9DDBF', '#D9A441'],
    '翠玉': ['#0F3D2E', '#1C6B4A', '#2F8F5E', '#5DB37F', '#A3D9A5', '#F1E9D2', '#E3B23C'],
}
for name, pal in PALETTES.items():
    S = 1.0; img = Image.new('RGB', (int((x1 - x0) + 60), int((y1 - y0) + 60)), (255, 255, 255)); dr = ImageDraw.Draw(img)
    for t, r in zip(keep, roles):
        q = P[t] - [x0 - 30, y0 - 30]; c = q.mean(0)
        q2 = [tuple(c + (p - c) * max(0, 1 - 3.5 / (np.linalg.norm(p - c) + 1e-6))) for p in q]
        dr.polygon(q2, fill=pal[ROLE.index(r)])
    img.save(os.path.join(ROOT, 'build', f'loong-shards-{name}.png'))
print('完成')
