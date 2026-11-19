"""桌面靈寵預告片配樂：全部用 numpy 合成（五聲音階的撥弦、笛、鼓、鑼、雷），輸出 out/music.wav。
時間點對齊 trailer.js 的分鏡。"""
import os
import wave
import numpy as np

SR = 44100
DUR = 155.0
N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def hz(n):  # MIDI 音高 → 頻率
    return 440.0 * 2 ** ((n - 69) / 12)


OFF = 0.0    # 這一段整體往後挪幾秒（各段的音符時間沿用第一版的秒數，靠它搬到新位置）
LIM = 1e9    # 超過這個時間（挪動後）起音的音符不放，用來把一段截短


def put(sig, t, vol=1.0, pan=0.0):
    t = t + OFF
    if t >= LIM:
        return
    i = int(t * SR)
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * vol
    L[i:i + len(sig)] += sig * (1 - max(0, pan))
    R[i:i + len(sig)] += sig * (1 + min(0, pan))


def pluck(n, dur=2.2, bright=1.0, bend=0.0):
    """古箏似的撥弦：泛音越高衰減越快，起音帶一點滑音。"""
    t = np.arange(int(dur * SR)) / SR
    f = hz(n) * (1 + bend * np.exp(-t * 14))
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros_like(t)
    for k in range(1, 9):
        out += np.sin(k * ph * (1 + 0.0004 * k * k)) * (bright ** (k - 1)) / k * np.exp(-t * (1.6 + 0.9 * k))
    att = np.minimum(1, t / 0.004)
    return out * att * 0.68


def flute(n, dur, vib=5.2):
    t = np.arange(int(dur * SR)) / SR
    f = hz(n) * (1 + 0.006 * np.sin(2 * np.pi * vib * t) * np.minimum(1, t / 0.4))
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.minimum(1, t / 0.09) * np.minimum(1, (dur - t) / 0.18)
    breath = np.convolve(rng.standard_normal(len(t)), np.ones(24) / 24, 'same') * 0.05
    return (np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph) + breath) * env * 0.3


def pad(notes, dur, vol=0.12):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for n in notes:
        for d in (-0.07, 0.07):
            out += np.sin(2 * np.pi * hz(n + d) * t + rng.random() * 6)
    env = np.minimum(1, t / 1.5) * np.minimum(1, (dur - t) / 2.0)
    return out / len(notes) * env * vol * 0.55


def drum(f0=62, dur=0.7, punch=1.0):
    t = np.arange(int(dur * SR)) / SR
    f = f0 * (1 + 1.6 * np.exp(-t * 28))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    skin = np.convolve(rng.standard_normal(len(t)), np.ones(30) / 30, 'same') * np.exp(-t * 40) * 1.6
    return (body + skin * punch) * 0.9


def rim(dur=0.12):
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * 1150 * t) + 0.6 * np.sin(2 * np.pi * 1730 * t)) * np.exp(-t * 60) * 0.35


def gong(dur=7.0, base=98):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for r_, a, d in [(1, 1, 0.5), (1.48, 0.7, 0.7), (2.02, 0.6, 0.9), (2.71, 0.5, 1.2), (3.44, 0.35, 1.6), (4.3, 0.3, 2.2), (5.6, 0.2, 3)]:
        out += a * np.sin(2 * np.pi * base * r_ * t * (1 + 0.004 * np.exp(-t * 2))) * np.exp(-t * d)
    return out * np.minimum(1, t / 0.01) * 0.3


def noise_sweep(dur, lo=6, hi=90, rise=True):
    """呼嘯：平滑程度逐漸改變的雜訊。"""
    n = int(dur * SR)
    x = rng.standard_normal(n)
    a = np.convolve(x, np.ones(lo) / lo, 'same')
    b = np.convolve(x, np.ones(hi) / hi, 'same') * 3
    p = np.linspace(0, 1, n)
    if not rise:
        p = 1 - p
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    return (a * p + b * (1 - p)) * env * 0.5


def thunder(dur=3.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    low = np.convolve(x, np.ones(400) / 400, 'same') * 14
    crack = np.convolve(x, np.ones(8) / 8, 'same') * np.exp(-t * 9) * 1.5
    rumble = low * (np.exp(-t * 1.3) * (1 + 0.5 * np.sin(2 * np.pi * 7 * t)))
    return (crack + rumble) * 0.55


def ding(n=88):
    t = np.arange(int(1.2 * SR)) / SR
    return (np.sin(2 * np.pi * hz(n) * t) + 0.4 * np.sin(2 * np.pi * hz(n) * 2.76 * t)) * np.exp(-t * 5) * 0.3


def melody(notes, t0, beat, vol=0.5, fn=pluck, pan=0.0, **kw):
    """notes = [(音高或 None, 拍數), ...]"""
    t = t0
    for n, b in notes:
        if n is not None:
            if fn is flute:
                put(flute(n, b * beat * 0.96), t, vol, pan)
            else:
                put(fn(n, **kw), t, vol, pan)
        t += b * beat
    return t


def groove(t0, t1, bpm, heavy=False, vol=1.0):
    beat = 60 / bpm
    t, i = t0, 0
    while t < t1 - 0.01:
        if i % 4 == 0:
            put(drum(58 if heavy else 66, 0.5, 1.0), t, 0.75 * vol)
        if i % 4 == 2:
            put(drum(84, 0.3, 1.3), t, 0.4 * vol)
        if heavy and i % 4 == 3:
            put(drum(74, 0.25, 1.2), t + beat / 2, 0.35 * vol)
        put(rim(), t + beat / 2, 0.5 * vol, 0.3 if i % 2 else -0.3)
        t += beat
        i += 1



# 五聲音階（D 宮）：D E F# A B = 62 64 66 69 71；D 羽調（小調感）：D F G A C = 62 65 67 69 72

def sec_intro():
    # ── 序章 0–21：低音長音、風聲、稀疏的撥弦 ──
    put(pad([38, 45], 22, 0.22), 0)
    put(pad([50, 57, 62], 13, 0.07), 8)
    put(noise_sweep(9, 30, 200) * 0.35, 0.2)
    put(noise_sweep(8, 30, 200, False) * 0.3, 9)
    melody([(62, 4), (65, 2), (67, 2), (69, 5), (67, 1.5), (65, 1.5), (62, 4), (60, 2), (62, 6)], 1.0, 0.44, 0.55, bright=0.7, bend=0.012, pan=-0.2)
    melody([(74, 3), (72, 1.5), (69, 1.5), (67, 3), (69, 3), (72, 2), (74, 5)], 14.2, 0.36, 0.42, bright=0.65, bend=0.01, pan=0.2)
    put(flute(69, 2.6), 15.6, 0.5)
    put(flute(74, 2.4), 18.3, 0.45)
    put(ding(93), 18.2, 0.7)   # 靈貓睜眼
    put(noise_sweep(1.6, 4, 80), 19.5, 0.9)   # 片名前的蓄勢

def sec_title():
    # ── 片名 21–26：大鼓加鑼 ──
    put(drum(52, 1.4, 1.4), 21.0, 1.5)
    put(gong(7), 21.0, 1.0)
    put(pad([50, 57, 62, 66], 6, 0.2), 21)
    for i, n in enumerate([62, 66, 69, 74, 78]):
        put(pluck(n, bright=0.85), 22.0 + i * 0.22, 0.5, (i - 2) * 0.2)

def sec_desk():
    # ── 桌面 26–38：輕快，105 BPM ──
    B1 = 60 / 105
    groove(26, 38, 105, vol=0.8)
    A = [(74, 1), (71, 0.5), (69, 0.5), (66, 1), (69, 1), (71, 1), (74, 0.5), (76, 0.5), (78, 2),
         (76, 1), (74, 0.5), (71, 0.5), (69, 1), (66, 1), (64, 1), (66, 0.5), (69, 0.5), (62, 2)]
    melody(A[:9] + A[9:], 26.0, B1, 0.5, bright=0.85, pan=-0.15)
    melody([(50, 2), (57, 2), (54, 2), (57, 2), (47, 2), (54, 2), (50, 2), (57, 2), (50, 2), (57, 2)], 26.0, B1, 0.45, bright=0.6, pan=0.25)
    melody([(78, 0.5), (76, 0.5), (74, 1), (71, 0.5), (74, 0.5), (69, 2)], 26.0 + 16 * B1, B1, 0.5, bright=0.85)
    put(ding(88), 29.7, 0.8)                      # 摸頭
    put(noise_sweep(0.5, 3, 40), 32.9, 0.9)       # 甩出去
    put(drum(110, 0.25, 2.0), 33.5, 0.7)          # 撞牆
    put(drum(70, 0.4, 1.5), 34.3, 0.7)            # 落地
    for i in range(6):
        put(ding(84 + (i * 5) % 9), 34.7 + i * 0.22, 0.25, 0.4 - i * 0.15)   # 暈
    put(noise_sweep(1.6, 3, 60), 36.3, 0.8)       # 御劍

def sec_cast():
    # ── 五位同門 38–50：每位一記鼓加一句主題 ──
    THEMES = [[62, 66, 69, 74], [69, 72, 74, 77], [74, 78, 81, 86], [50, 57, 62, 66], [66, 69, 74, 78]]
    for i in range(5):
        t0 = 38 + i * 2.4
        put(drum(55, 0.8, 1.5), t0, 1.1)
        put(noise_sweep(0.35, 3, 30), t0 - 0.3, 0.6)
        for j, n in enumerate(THEMES[i]):
            put(pluck(n, bright=0.85), t0 + 0.3 + j * 0.17, 0.5, 0.3 if i % 2 else -0.3)
        put(flute(THEMES[i][3], 1.2), t0 + 1.0, 0.4)
        put(pad([THEMES[i][0] - 12, THEMES[i][1] - 12], 2.4, 0.16), t0)
    groove(38, 50, 100, vol=0.45)

def sec_kungfu():
    # ── 功夫 50–62：加快到 150 BPM，重鼓 ──
    B2 = 60 / 150
    groove(50, 62, 150, heavy=True, vol=1.0)
    run = [62, 66, 69, 71, 74, 71, 69, 66, 64, 66, 69, 74, 76, 74, 71, 69]
    for k in range(60):
        put(pluck(run[k % 16] + (12 if (k // 16) % 2 else 0), dur=0.9, bright=0.9), 50 + k * B2 / 2, 0.36, 0.35 * np.sin(k))
    for i in range(6):
        put(drum(48, 0.9, 1.6), 50 + i * 2, 1.2)
        put(gong(2.5, 196), 50 + i * 2, 0.35)
        put(noise_sweep(0.3, 3, 30), 50 + i * 2 - 0.25, 0.6)
    for k in range(7):
        put(ding(80 + k), 52 + k * (2 / 6.8) + 0.18, 0.3)        # 符咒命中
    for k in range(5):
        put(noise_sweep(0.25, 2, 12), 54.1 + k * 0.38, 0.6)      # 劍氣

def sec_care():
    # ── 陪你工作 62–72：安靜下來，笛子 ──
    put(pad([50, 57, 62, 66], 10.5, 0.2), 61.8)
    melody([(74, 2), (71, 1), (69, 1), (66, 2), (69, 2), (71, 1.5), (74, 0.5), (76, 2), (74, 4)], 62.2, 0.6, 0.6, fn=flute)
    melody([(50, 2), (57, 2), (62, 2), (57, 2), (47, 2), (54, 2), (57, 2), (50, 2)], 62.2, 0.6, 0.45, bright=0.6, pan=0.2)
    for j, t in enumerate([62.65, 63.15, 63.65]):
        put(drum(120, 0.15, 2.5), t, 0.5)                         # 蓋印
    for t in (62, 64.5, 67, 69.5):
        put(ding(86), t + 0.05, 0.35)

def sec_realm():
    # ── 九重境界 72–79.2：一階一階往上 ──
    for i in range(9):
        t0 = 72 + i * 0.8
        n = [50, 52, 54, 57, 59, 62, 64, 66, 69][i]
        put(pluck(n, bright=0.8), t0, 0.55, -0.4 + i * 0.1)
        put(pluck(n + 12, bright=0.8), t0 + 0.2, 0.4)
        put(pluck(n + 19, bright=0.8), t0 + 0.4, 0.35)
        put(drum(60 + i * 2, 0.5, 1.0), t0, 0.5 + i * 0.07)
    put(pad([38, 45, 50], 8, 0.2), 72)

def sec_trib():
    # ── 天劫 79.2–84 ──
    put(pad([37, 38, 44], 4, 0.3), 79.0)
    t = 79.2
    k = 0
    while t < 82.3:                                                # 鼓點越來越密
        put(drum(50, 0.35, 1.2), t, 0.35 + k * 0.03)
        t += max(0.07, 0.34 - k * 0.012)
        k += 1
    for t in (80.2, 80.45, 80.95, 81.45, 81.95):
        put(thunder(), t, 0.85, rng.uniform(-0.4, 0.4))
    put(gong(8, 73), 82.4, 1.3)
    put(drum(46, 1.5, 1.5), 82.4, 1.4)
    put(pad([50, 57, 62, 66, 69], 3, 0.25), 82.4)

def sec_demon():
    # ── 心魔 84–93.5：不安的低音與心跳 ──
    put(pad([37, 38, 43], 7.5, 0.34), 84)
    for i in range(7):
        put(drum(42, 0.5, 0.2), 84.6 + i * 0.95, 0.7)
        put(drum(42, 0.4, 0.2), 84.85 + i * 0.95, 0.45)
    melody([(74, 3), (73, 3), (68, 3), (67, 4)], 85.2, 0.42, 0.3, bright=0.5, bend=-0.02, pan=0.3)
    for t in (89.3, 89.9, 90.5):
        put(drum(90, 0.3, 2.2), t, 0.9)
        put(ding(91), t, 0.5)
    put(noise_sweep(1.2, 4, 90, False), 90.5, 0.8)
    put(pad([50, 57, 62], 4, 0.2), 90.4)
    put(flute(69, 2.4), 90.8, 0.5)

def sec_home():
    # ── 回家 93.5–108：主題再現，放慢、溫暖 ──
    put(pad([38, 50, 57, 62, 66], 15, 0.26), 93.2)
    melody([(62, 2), (66, 1), (69, 1), (74, 3), (71, 1), (69, 2), (66, 1), (69, 1), (74, 2), (76, 1), (78, 3)], 93.9, 0.52, 0.6, bright=0.8, pan=-0.15)
    melody([(69, 4), (66, 4), (71, 4), (74, 6)], 94.4, 0.52, 0.5, fn=flute, pan=0.2)
    for i, t in enumerate(np.arange(96.5, 99.8, 0.42)):
        put(pluck([74, 78, 81, 86, 90][i % 5], bright=0.9), t, 0.3, 0.5 - i * 0.12)   # 殿一筆一筆亮起來
    put(gong(8, 98), 99.7, 0.9)
    put(drum(52, 1.2, 1.2), 99.7, 1.0)
    melody([(78, 1), (76, 1), (74, 2), (71, 1), (69, 1), (74, 4)], 102.0, 0.55, 0.6, bright=0.8)
    melody([(50, 2), (57, 2), (54, 2), (57, 2), (50, 4)], 102.0, 0.55, 0.45, bright=0.6, pan=0.2)
    put(flute(74, 3.2), 103.2, 0.45)
    put(ding(93), 105.6, 0.4)


def play(sec, off=0.0, lim=1e9):
    """把一段搬到新的位置演奏：off 是往後挪的秒數，lim 是這一段最晚到幾秒。"""
    global OFF, LIM
    OFF, LIM = off, lim
    sec()
    OFF, LIM = 0.0, 1e9


def sec_evolve():   # 外觀進化 50–62：每個角色六個階段，一階一個往上的音
    scale = [62, 66, 69, 74, 78, 81]
    for i in range(5):
        t0 = 50 + i * 2.4
        put(drum(55, 0.8, 1.5), t0, 1.0)
        put(noise_sweep(0.35, 3, 30), t0 - 0.3, 0.5)
        put(pad([50 + (i % 3) * 2, 57, 62], 2.4, 0.18), t0)
        for j, n in enumerate(scale):
            put(pluck(n + (i % 2) * 2, bright=0.85), t0 + j * 0.37, 0.5, -0.4 + j * 0.16)
            put(ding(n + 24), t0 + j * 0.37, 0.16)
        put(gong(2.5, 196), t0 + 5 * 0.37, 0.3)
    groove(50, 62, 100, vol=0.45)


def sec_skills_hits():   # 本命技能 62–82：每四秒換一位，各有一個招牌聲
    for i in range(5):
        t0 = 62 + i * 4
        put(drum(46, 1.2, 1.6), t0, 1.3)
        put(gong(4, 110 + i * 12), t0, 0.5)
    for k in range(9):
        put(noise_sweep(0.22, 2, 14), 62.3 + k * 0.38, 0.45, 0.6 - k * 0.15)   # 貓影疾走
    put(noise_sweep(0.9, 4, 90, False), 66.2, 0.8)                                # 幻化的煙
    put(noise_sweep(0.9, 4, 90, False), 69.0, 0.8)
    put(flute(81, 3.0), 70.6, 0.5)                                                # 月華
    for k in range(8):
        put(ding(86 + (k * 5) % 12), 70.8 + k * 0.36, 0.22, 0.5 - k * 0.14)
    put(noise_sweep(3.2, 6, 160), 74.3, 0.7)                                      # 太極推開
    put(thunder(2.6), 78.4, 0.5)                                                  # 龍吟
    put(noise_sweep(2.6, 4, 60), 78.6, 0.8)


def sec_wheel():   # 快捷輪盤 82–89：輕巧的撥弦，八格彈出來各一聲
    put(pad([50, 57, 62, 66], 7.2, 0.2), 82)
    melody([(62, 2), (69, 2), (66, 2), (69, 2), (71, 2), (74, 4)], 82.2, 0.48, 0.45, bright=0.7, pan=0.2)
    for j in range(8):
        put(pluck(62 + [0, 2, 4, 7, 9, 12, 14, 16][j], dur=1.2, bright=0.9), 83.72 + j * 0.05, 0.4, -0.5 + j * 0.14)
    put(ding(93), 86.5, 0.6)
    put(rim(), 83.0, 0.6)
    for k in range(3):
        put(ding(88 + k * 3), 86.7 + k * 0.3, 0.3)


def sec_saver():   # 螢幕保護 111–131：夜裡安靜的長音，五個場景各有一聲
    put(pad([38, 45, 50, 57], 20.5, 0.3), 110.8)
    put(pad([62, 66, 69], 20, 0.1), 111)
    melody([(74, 4), (71, 2), (69, 2), (66, 4), (69, 4), (74, 4), (76, 2), (78, 2), (74, 6), (71, 2), (69, 6)], 111.4, 0.5, 0.45, fn=flute, pan=-0.15)
    melody([(50, 4), (57, 4), (54, 4), (57, 4), (47, 4), (54, 4), (50, 4), (57, 4), (50, 4), (57, 4)], 111.4, 0.5, 0.36, bright=0.6, pan=0.25)
    for i in range(5):
        put(noise_sweep(0.5, 6, 120), 111 + i * 4 - 0.2, 0.35)
    put(ding(81), 113.45, 0.8); put(gong(3, 392), 113.45, 0.25)                   # 鈴鐺
    put(noise_sweep(0.6, 3, 60, False), 117.45, 0.7)                               # 狐火換陣
    for k in range(7):
        put(ding(84 + (k * 4) % 11), 121.45 + k * 0.12, 0.22, 0.4 - k * 0.12)    # 桂花灑落
    put(drum(120, 0.2, 2.2), 125.45, 0.5); put(noise_sweep(0.5, 8, 140, False), 125.45, 0.5)   # 吃包子
    put(thunder(3.0), 129.45, 0.75)                                                # 打雷


# ── 新的時間軸（155 秒）──
play(sec_intro)                      # 0–21 序章
play(sec_title)                      # 21–26 片名
play(sec_desk)                       # 26–38 桌面
play(sec_cast)                       # 38–50 五位同門
play(sec_evolve)                     # 50–62 外觀進化（新）
play(sec_kungfu, 12, 72)             # 62–82 本命技能：沿用功夫段的快板，演兩輪
play(sec_kungfu, 22, 82)
play(sec_skills_hits)
play(sec_wheel)                      # 82–89 快捷輪盤（新）
play(sec_care, 27, 99)               # 89–99 陪你工作
play(sec_realm, 27)                  # 99–111 九重境界與天劫
play(sec_trib, 27)
play(sec_saver)                      # 111–131 螢幕保護（新）
play(sec_demon, 47)                  # 131–140.5 心魔
play(sec_home, 47)                   # 140.5–155 回家與片尾

# ── 混音：簡單的回音、淡出、限幅 ──
for ch in (L, R):
    for d, g in ((0.23, 0.22), (0.41, 0.14), (0.67, 0.08)):
        k = int(d * SR)
        ch[k:] += ch[:-k] * g
fade = np.ones(N)
fo = int(1.8 * SR)
fade[-fo:] = np.linspace(1, 0, fo)
mix = np.stack([L * fade, R * fade], 1)
mix = np.tanh(mix / (np.percentile(np.abs(mix), 99.9) * 0.9)) * 0.92
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
with wave.open(os.path.join(os.path.dirname(__file__), 'out', 'music.wav'), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('ok', DUR)
