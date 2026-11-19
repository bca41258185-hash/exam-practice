"""照剪輯表剪配樂：python3 cutmusic.py 原始.wav 輸出.wav '[[t0,t1],...]'，接點做 0.25 秒交叉淡化，最後 1.5 秒淡出。"""
import json, sys, wave
import numpy as np
src, dst, segs = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
with wave.open(src) as w:
    sr, ch = w.getframerate(), w.getnchannels()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, ch).astype(np.float32)
X = int(0.25 * sr)
out = np.zeros((0, ch), np.float32)
for t0, t1 in segs:
    lead = X if len(out) >= X else 0   # 後面的段落多取 X 個取樣跟上一段重疊，總長才不會變短、聲畫不會漂移
    piece = a[max(0, int(t0 * sr) - lead):int(t1 * sr)].copy()
    if lead and len(piece) >= X:   # 交叉淡化：上一段尾巴淡出、這一段開頭淡入
        ramp = np.linspace(0, 1, X)[:, None]
        out[-X:] = out[-X:] * (1 - ramp) + piece[:X] * ramp
        piece = piece[X:]
    out = np.concatenate([out, piece])
# 保險：長度不足就補靜音對齊畫面
total = int(sum(t1 - t0 for t0, t1 in segs) * sr)
if len(out) < total: out = np.concatenate([out, np.zeros((total - len(out), ch), np.float32)])
F = int(1.5 * sr); out[-F:] *= np.linspace(1, 0, F)[:, None]
with wave.open(dst, 'wb') as w:
    w.setnchannels(ch); w.setsampwidth(2); w.setframerate(sr); w.writeframes(np.clip(out, -32768, 32767).astype(np.int16).tobytes())
print('配樂', round(len(out) / sr, 2), '秒')
