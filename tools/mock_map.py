#!/usr/bin/env python3
"""大地圖四季＋三時段測試圖。只讀 public/art 與 art/src，輸出到 docs/design/iso/mock/，不動正式素材。

現有素材不是 2:1 等角：正面邊 24°、側面邊 32°（2026-10-31 疊線實測），
所以地板、馬路、環境全部用這兩條軸畫，物件以「最低點」貼地。
"""
import datetime
import json
import math
import random
import subprocess
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from PIL.ImageColor import getrgb as ImageColor
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'public/art'
OUT = ROOT / 'docs/design/iso/mock'

AXIS_FRONT, AXIS_SIDE = 24, 32     # 度
UNIT = 20                          # 一格的邊長 px
MAP_X, MAP_Y, ROAD = 100, 78, 9    # 地圖格數、馬路寬
MAIN = (39, 47)                    # 主街 gy 範圍
CROSS = (46, 54)                   # 十字街 gx 範圍
HUB = (50, 43)                     # 中央廣場中心
STALL_W = 104
STALLS = ['accessory', 'textile', 'leather', 'ceramic', 'wood', 'paper',
          'candle', 'art', 'food', 'workshop', 'other']
A1 = UNIT * math.cos(math.radians(AXIS_FRONT))
B1 = UNIT * math.sin(math.radians(AXIS_FRONT))
A2 = UNIT * math.cos(math.radians(AXIS_SIDE))
B2 = UNIT * math.sin(math.radians(AXIS_SIDE))
PAD = 26
SEASONS = ['spring', 'summer', 'autumn', 'winter']
TRAIL_OFF, TRAIL_W = 5.6, 4.8      # 公園小徑：離市集邊的距離、路寬（格）
TRAIL = dict(spring=('#dcc8a2', '#e0ceaa', '#a99a72'), summer=('#d6c096', '#dac59d', '#8f8f62'),
             autumn=('#d3b98c', '#d8bf94', '#9a8658'), winter=('#d8d3c6', '#dedad0', '#a9a99a'))
GRASS = dict(spring=('#8db57a', '#a7c98b', '#74a069'), summer=('#5e9960', '#75ad6d', '#4e8855'),
             autumn=('#a3a064', '#bfae70', '#8f8a55'), winter=('#b4b9a6', '#cfd2c4', '#a3a998'))
SPECK = dict(spring=['#f6d0da', '#fbe6ea', '#fff7c9'], summer=['#f5f1d2', '#f1d873', '#e9f0c8'],
             autumn=['#d9772f', '#c2502b', '#e6ad3f'], winter=['#ffffff', '#f4f6f7', '#e8edf0'])

min_x = -(MAP_Y + ROAD + PAD) * A2 - (ROAD + PAD) * A1
min_y = -(ROAD + PAD) * (B1 + B2)
W = round((MAP_X + ROAD + PAD) * A1 + (ROAD + PAD) * A2 - min_x)
H = round((MAP_X + ROAD + PAD) * B1 + (MAP_Y + ROAD + PAD) * B2 - min_y)


def P(gx, gy):
    return gx * A1 - gy * A2 - min_x, gx * B1 + gy * B2 - min_y


def rect(gx0, gy0, gx1, gy1):
    return [P(gx0, gy0), P(gx1, gy0), P(gx1, gy1), P(gx0, gy1)]


def trail_line():
    """市集外圈的小徑中線：圓角矩形再疊兩層正弦，頭尾接得起來。回傳點、法線（朝外）、累計長度。"""
    x0, y0, x1, y1, r = -TRAIL_OFF, -TRAIL_OFF, MAP_X + TRAIL_OFF, MAP_Y + TRAIL_OFF, 5
    pts = []
    def edge(a, b):
        n = int(math.dist(a, b) * 2)
        pts.extend((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n))
    def arc(cx, cy, start):
        pts.extend((cx + r * math.cos(start + i / 16 * math.pi / 2), cy + r * math.sin(start + i / 16 * math.pi / 2)) for i in range(16))
    edge((x0 + r, y0), (x1 - r, y0)); arc(x1 - r, y0 + r, -math.pi / 2)
    edge((x1, y0 + r), (x1, y1 - r)); arc(x1 - r, y1 - r, 0)
    edge((x1 - r, y1), (x0 + r, y1)); arc(x0 + r, y1 - r, math.pi / 2)
    edge((x0, y1 - r), (x0, y0 + r)); arc(x0 + r, y0 + r, math.pi)
    a = np.array(pts)
    def normals(line):
        t = np.roll(line, -1, 0) - np.roll(line, 1, 0)
        t /= np.linalg.norm(t, axis=1, keepdims=True)
        return np.stack([t[:, 1], -t[:, 0]], 1)
    u = np.arange(len(a)) / len(a) * 2 * math.pi
    a = a + normals(a) * (0.9 * np.sin(u * 5) + 0.6 * np.sin(u * 11 + 1))[:, None]
    n = normals(a)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.roll(a, -1, 0) - a, axis=1))])
    return a, n, s


LINE, NORMAL, LENGTHS = trail_line()
TRAIL_LEN = float(LENGTHS[-1])


def trail_at(s, lane=0.0):
    """小徑上距離 s、偏離中線 lane 格的位置（lane 正值朝外）。"""
    s %= TRAIL_LEN
    i = min(int(np.searchsorted(LENGTHS, s, 'right')) - 1, len(LINE) - 1)
    p = LINE[i] + NORMAL[i] * lane
    return float(p[0]), float(p[1]), i


def season_of(month):
    """日本四季：3–5 春、6–8 夏、9–11 秋、12–2 冬。"""
    return SEASONS[(month % 12) // 3 - 1]


SPRITES = {}                       # id(縮好的圖) → (素材名, 寬)，匯出遊戲資料時用


def load(name, width):
    im = Image.open(ART / f'{name}.webp').convert('RGBA')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    SPRITES[id(im)] = name, width
    return im


def corner(sprite):
    """物件最低點＝貼地的前角。"""
    a = np.asarray(sprite)[..., 3] > 128
    y = np.where(a.any(1))[0].max()
    return float(np.where(a[max(0, y - 2):y + 1].any(0))[0].mean()), float(y)


def people():
    res = []
    for role in ('hero', 'cap', 'camera', 'student', 'potter', 'leather'):
        for name in ('se_a', 'se_b', 'se_c', 'ne_a', 'ne_b', 'ne_c'):
            im = Image.open(ART / f'walk2_{role}_{name}.webp').convert('RGBA')
            res.append(im.resize((round(im.width * 44 / 96), round(im.height * 44 / 96)), Image.LANCZOS))
    return res


# 小徑上的路人。speed＝格/秒；cycle＝走完 a-b-c-b 一輪的距離（格），腳才不會打滑；
# right＝原圖前向是否朝右下（後向一律朝右上）。
KINDS = dict(
    jogger=dict(names=['park_jogger_f', 'park_jogger_m'], speed=3.4, cycle=1.7, right=True),
    stroll=dict(names=['walk2_hero', 'walk2_cap', 'walk2_camera', 'walk2_student', 'walk2_potter', 'walk2_leather'],
                speed=1.5, cycle=1.0, right=False),
    elders=dict(names=['park_grandpa', 'park_grandma'], speed=1.0, cycle=.8, right=True),
    dogwalk=dict(names=['park_dogwalker'], speed=1.4, cycle=1.0, right=True),
    cyclist=dict(names=['park_cyclist'], speed=7.5, cycle=5.0, right=False),
)
DOGS = ['park_shiba', 'park_poodle']
FRAMES = {}


def frame(name, flip, scale=44 / 96):
    key = name, flip
    if key not in FRAMES:
        im = Image.open(ART / f'{name}.webp').convert('RGBA')
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        im = im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im
        # 以頭部中心對位：每格寬度不同，用圖片中心會讓身體左右抖
        head = np.asarray(im)[:max(1, im.height * 45 // 100), :, 3].astype(np.float32)
        FRAMES[key] = im, float((head.sum(0) * np.arange(im.width)).sum() / head.sum())
    return FRAMES[key]


def park_cast(rng, s0, span, groups):
    """在小徑 s0 起 span 長的範圍撒路人：跑步、散步、遛狗、腳踏車、站著聊天。"""
    plan = ['jogger', 'stroll', 'dogwalk', 'chat', 'elders', 'cyclist', 'stroll', 'jogger', 'dogwalk', 'chat']
    cast = []
    for i in range(groups):
        kind = plan[i % len(plan)]
        s = s0 + span * (i + rng.uniform(.1, .9)) / groups
        way = rng.choice((1, -1))
        cast.append(dict(kind=kind, s=s, way=way, lane=way * rng.uniform(.8, 1.4),
                         pick=rng.randrange(6), dog=rng.choice(DOGS), chat=rng.randrange(3), t0=rng.uniform(0, 4)))
    return cast


def direction(s, way):
    """行進方向在畫面上的水平、垂直分量。"""
    a, b = trail_at(s), trail_at(s + way)
    (x0, y0), (x1, y1) = P(a[0], a[1]), P(b[0], b[1])
    return x1 - x0, y1 - y0


def walker(name, right, way, s, lane, cycle, skip_c=False):
    """回傳一個走動中的 (畫面 y, sprite, x, y, glow)。a-b-c-b 循環。"""
    gx, gy, _ = trail_at(s, lane)
    sx, sy = P(gx, gy)
    dx, dy = direction(s, way)
    facing = 'se' if dy > 0 else 'ne'
    flip = (dx > 0) != (right if facing == 'se' else True)
    step = 'abcb'[int((abs(s) / cycle) * 4) % 4]
    if skip_c and facing == 'se' and step == 'c':     # 遛狗的人牽繩手不換邊
        step = 'a'
    im, head = frame(f'{name}_{facing}_{step}', flip, 44 / 96 if 'shiba' not in name and 'poodle' not in name else .46)
    return (sy, im, round(sx - head), round(sy - im.height + 1), .2), sx, sy, dx


def leash(hx, hy, cx, cy, sy):
    x0, y0 = int(min(hx, cx)) - 3, int(min(hy, cy)) - 3
    w, h = int(abs(hx - cx)) + 7, int(abs(hy - cy)) + 12
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    pts = [(hx + (cx - hx) * t / 10 - x0, hy + (cy - hy) * t / 10 - y0 + 5 * (1 - (2 * t / 10 - 1) ** 2)) for t in range(11)]
    ImageDraw.Draw(im).line(pts, fill=(70, 45, 35, 255), width=1)
    return sy, im, x0, y0, .2


def cast_items(cast, t):
    """第 t 秒的路人畫面。"""
    out = []
    for a in cast:
        if a['kind'] == 'chat':
            gx, gy, _ = trail_at(a['s'], TRAIL_W / 2 * (1 if a['way'] > 0 else -1) * .78)
            sx, sy = P(gx, gy)
            im, _ = frame(f"park_chat{a['chat']}_{1 + int((t + a['t0']) / 2.4) % 2}", False)
            out.append((sy, im, round(sx - im.width / 2), round(sy - im.height + 1), .2))
            continue
        k = KINDS[a['kind']]
        s = a['s'] + a['way'] * k['speed'] * t
        lane = a['lane'] * (.25 if a['kind'] == 'cyclist' else 1)
        if a['kind'] == 'elders':
            for name, off in zip(k['names'], (-.55, .55)):
                out.append(walker(name, k['right'], a['way'], s + off * .2, lane + off, k['cycle'])[0])
        elif a['kind'] == 'dogwalk':
            item, sx, sy, dx = walker(k['names'][0], True, a['way'], s, lane, k['cycle'], True)
            ds = s + a['way'] * (1.9 + .25 * math.sin(s * 1.3))
            lean = lane + .5 * math.sin(s * .7)
            dog, cx, cy, _ = walker(a['dog'], False, a['way'], ds, lean, .7)
            out += [item, dog, leash(sx + math.copysign(10, dx), sy - 16, cx, cy - 13, max(sy, cy) + .1)]
        else:
            name = k['names'][a['pick'] % len(k['names'])]
            out.append(walker(name, k['right'], a['way'], s, lane, k['cycle'])[0])
    return out


def blob(item):
    """路人腳下的小陰影。"""
    im = item[1]
    return item[2] + im.width // 2, item[0]


def grass(season):
    """自然的草地：低頻深淺＋短草＋季節落物，隨季節換色。"""
    S = 2
    rs = np.random.RandomState(3)
    lo, hi, tuft = [np.array(ImageColor(c)) for c in GRASS[season]]
    def soft(sigma):
        n = ndimage.gaussian_filter(rs.rand(H * S // 8 + 2, W * S // 8 + 2).astype(np.float32), sigma)
        n = (n - n.min()) / (n.max() - n.min())
        return np.asarray(Image.fromarray(n).resize((W * S, H * S), Image.BICUBIC))
    noise, fine = soft(34), soft(5)
    t = np.clip((noise * .7 + fine * .3 - .3) / .4, 0, 1)[..., None]
    rgb = lo * (1 - t) + hi * t
    if season == 'winter':
        snow = (.86 + .14 * np.clip((noise * .75 + fine * .25 - .30) / .16, 0, 1))[..., None]   # 全面積雪，只留淡淡起伏
        rgb = rgb * (1 - snow) + np.array([240, 243, 245]) * snow
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    for _ in range(26000):
        x, y = rs.randint(0, W * S), rs.randint(0, H * S)
        h = rs.randint(5, 11)
        d.line((x, y, x + rs.randint(-3, 4), y - h), fill=tuple(tuft), width=2)
    for _ in range(5200):
        x, y = rs.randint(0, W * S), rs.randint(0, H * S)
        r = rs.randint(2, 5)
        d.ellipse((x - r, y - r * .6, x + r, y + r * .6), fill=SPECK[season][rs.randint(3)])
    return im


def ground(rng, season):
    S = 2
    im = grass(season)
    d = ImageDraw.Draw(im)
    def poly(pts, fill, outline=None):
        d.polygon([(x * S, y * S) for x, y in pts], fill=fill, outline=outline)
    # 公園小徑：外圈繞一周，主街和十字街各接一小段上來
    path, worn, rim = TRAIL[season]
    n = len(LINE)
    def band(half, fill):
        for i in range(n):
            j = (i + 1) % n
            poly([P(*(LINE[i] + NORMAL[i] * half)), P(*(LINE[j] + NORMAL[j] * half)),
                  P(*(LINE[j] - NORMAL[j] * half)), P(*(LINE[i] - NORMAL[i] * half))], fill)
    for r, c in (((-TRAIL_OFF, MAIN[0], 0, MAIN[1]), rim), ((MAP_X, MAIN[0], MAP_X + TRAIL_OFF, MAIN[1]), rim),
                 ((CROSS[0], MAP_Y, CROSS[1], MAP_Y + TRAIL_OFF), rim)):
        poly(rect(*r), c)
    band(TRAIL_W / 2 + .3, rim)
    for r in ((-TRAIL_OFF, MAIN[0] + .3, 0, MAIN[1] - .3), (MAP_X, MAIN[0] + .3, MAP_X + TRAIL_OFF, MAIN[1] - .3),
              (CROSS[0] + .3, MAP_Y, CROSS[1] - .3, MAP_Y + TRAIL_OFF)):
        poly(rect(*r), path)
    band(TRAIL_W / 2, path)
    band(TRAIL_W / 4, worn)
    rs = np.random.RandomState(9)
    for _ in range(9000):                       # 碎石
        i = rs.randint(n)
        gx, gy = LINE[i] + NORMAL[i] * rs.uniform(-TRAIL_W / 2, TRAIL_W / 2)
        x, y = P(gx, gy)
        r = rs.uniform(1.4, 3.2)
        d.ellipse((x * S - r, y * S - r * .6, x * S + r, y * S + r * .6), fill=rim if rs.rand() < .5 else worn)
    for _ in range(1300):                       # 季節落物只留在路邊
        i = rs.randint(n)
        gx, gy = LINE[i] + NORMAL[i] * (rs.choice([-1, 1]) * rs.uniform(TRAIL_W * .3, TRAIL_W * .55))
        x, y = P(gx, gy)
        r = rs.randint(2, 5)
        d.ellipse((x * S - r, y * S - r * .6, x * S + r, y * S + r * .6), fill=SPECK[season][rs.randint(3)])
    # 路邊石
    poly(rect(-1.6, -1.6, MAP_X + 1.6, MAP_Y + 1.6), '#cbbda6')
    # 人行地面：大塊石板，線跟著兩條軸走
    for gx in range(0, MAP_X, 6):
        for gy in range(0, MAP_Y, 6):
            c = rng.choice(['#e8dcc3', '#e4d7bc', '#ecdfc8', '#e1d3b6'])
            poly(rect(gx, gy, gx + 6, gy + 6), c, '#d4c5a8')
    # 主街與十字街
    for r in ((0, MAIN[0], MAP_X, MAIN[1]), (CROSS[0], 8, CROSS[1], MAP_Y)):
        for gx in range(int(r[0]), int(r[2]), 3):
            for gy in range(int(r[1]), int(r[3]), 3):
                c = rng.choice(['#d3bd9a', '#ccb592', '#d8c3a1'])
                poly(rect(gx, gy, gx + 3, gy + 3), c, '#bfa883')
    # 中央廣場
    hx, hy = HUB
    poly(rect(hx - 7, hy - 7, hx + 7, hy + 7), '#b9745a')
    poly(rect(hx - 6, hy - 6, hx + 6, hy + 6), '#e3cfa8')
    poly(rect(hx - 3.5, hy - 3.5, hx + 3.5, hy + 3.5), '#c98c6c')
    return im.resize((W, H), Image.LANCZOS)


def build(season):
    rng = random.Random(11)
    canvas = ground(random.Random(5), season).convert('RGBA')
    items, sources, shadows = [], [], []
    world = dict(slots=[], blocks=[], strings=[])

    def put(sprite, gx, gy, foot=None, centered=False, glow=0.0):
        sx, sy = P(gx, gy)
        cx, cy = (sprite.width / 2, sprite.height - 2) if centered else corner(sprite)
        items.append((sy, sprite, round(sx - cx), round(sy - cy), glow))
        if foot:
            shadows.append(rect(gx - foot[0], gy - foot[1], gx + .6, gy + .6))
            world['blocks'].append((gx - foot[0], gy - foot[1], gx + .6, gy + .6))

    stalls = {n: load(f'stall_{n}', STALL_W) for n in STALLS + ['empty']}
    bldg = [load(f'bldg_{n}', 232) for n in ('fabric', 'buttons', 'leather', 'plain')]
    prop = {n: load(f'prop_{n}', w) for n, w in dict(streetlamp=32, plant_round=30, flowerpots=46,
            crates=34, bench=52, cat=24, cardboard=24, blackboard=24, railing=46).items()}
    tree = {k: load(f'tree_{season}_{k}', w) for k, w in dict(big=132, small=84).items()}
    postbox = load('prop_postbox', 46)
    walkers = people()

    for i, gx in enumerate(range(10, MAP_X, 9)):
        put(bldg[(i * 3 + i // 4) % 4], gx, 7, (8, 4), glow=.85)
        sx, sy = P(gx, 7)
        sources.append((sx - 60, sy + 14, 86, .42))

    count = 0
    rows = [16, 23, 30, 37, 55, 62, 69, 76]
    cols = [c for c in range(7, MAP_X - 2, 5) if c <= 45 or c >= 59]
    for gy in rows:
        for gx in cols:
            if rng.random() < 0.06 or (abs(gx - HUB[0]) < 11 and abs(gy - HUB[1]) < 9):
                continue
            empty = rng.random() < 0.09
            kind = 'empty' if empty else rng.choice(STALLS)
            world['slots'].append(dict(gx=gx, gy=gy, kind=kind))
            put(stalls[kind], gx, gy, (4, 2), glow=.12 if empty else 1.0)
            count += 1
            if not empty:
                sx, sy = P(gx, gy)
                sources.append((sx - 30, sy + 8, 54, .46))

    lamps = []
    for gx in range(6, MAP_X, 13):
        for gy in (MAIN[0] + .4, MAIN[1] - .4):
            if abs(gx - HUB[0]) < 10:
                continue
            put(prop['streetlamp'], gx, gy, centered=True, glow=.3)
            sx, sy = P(gx, gy)
            lamps.append((sx, sy, gy))
            sources.append((sx, sy - 6, 72, .34))
    for gx in (HUB[0] - 6, HUB[0] + 6):
        for gy in (HUB[1] - 6, HUB[1] + 6):
            put(prop['streetlamp'], gx, gy, centered=True)
            sx, sy = P(gx, gy)
            sources.append((sx, sy - 6, 72, .34))

    # 中央地標：大郵筒＋四張長椅＋花盆
    hx, hy = HUB
    put(postbox, hx, hy, centered=True)
    for gx, gy in ((-3, -3), (3, -3), (-3, 3), (3, 3)):
        put(prop['flowerpots'], hx + gx, hy + gy)
    for gx, gy in ((-5, -1.5), (-5, 2.5), (4.5, -1.5), (4.5, 2.5)):
        put(prop['bench'], hx + gx, hy + gy)

    # 路口小物
    for gx, gy, n in ((47, 18, 'bench'), (53, 25, 'plant_round'), (47, 31, 'crates'), (53, 59, 'bench'),
                      (47, 63, 'plant_round'), (53, 70, 'cardboard'), (24, 41, 'blackboard'), (76, 45, 'cat'),
                      (16, 45, 'cat'), (90, 41, 'crates')):
        put(prop[n], gx, gy)

    # 環境：樹不用多，路邊疏落幾棵，外圍成叢
    # 小徑靠鏡頭的兩邊，樹要離遠一點才不會擋住路上的人；另兩邊在路後面，可以貼近
    for gx in range(8, MAP_X, 23):
        put(tree['big'], gx, MAP_Y + ROAD + 12, centered=True)
    for gy in range(14, MAP_Y, 23):
        put(tree['small'], MAP_X + ROAD + 8, gy, centered=True)
        put(tree['big'], -ROAD - 2, gy, centered=True)
    for gx in range(16, MAP_X, 27):
        put(tree['small'], gx, -ROAD - 1, centered=True)
    # 小徑邊的長椅與路燈，內側草地不種樹，攤位不被擋
    for k in range(int(TRAIL_LEN // 21)):
        s = 8 + k * 21
        gx, gy, _ = trail_at(s, -TRAIL_W / 2 - .9)
        put(prop['streetlamp'], gx, gy, centered=True, glow=.3)
        sx, sy = P(gx, gy)
        sources.append((sx, sy - 6, 72, .3))
        if k % 2:
            gx, gy, _ = trail_at(s + 8, -TRAIL_W / 2 - 1.1)
            put(prop['bench'], gx, gy)
    for _ in range(9):
        side = rng.choice('LRF')
        if side == 'L':
            cx, cy = -ROAD - PAD * .55, rng.uniform(0, MAP_Y)
        elif side == 'R':
            cx, cy = MAP_X + ROAD + PAD * .72, rng.uniform(0, MAP_Y)
        else:
            cx, cy = rng.uniform(0, MAP_X), MAP_Y + ROAD + PAD * .72
        for _ in range(rng.randint(2, 3)):
            put(tree[rng.choice(['big', 'small'])], cx + rng.uniform(-5, 5), cy + rng.uniform(-3, 3), centered=True)

    # 行人只走在通道上
    walks = [(rng.uniform(2, MAP_X - 2), g + rng.uniform(1.2, 3.8)) for g in rows for _ in range(5)]
    walks += [(rng.uniform(2, MAP_X - 2), rng.uniform(MAIN[0] + 1, MAIN[1] - 1)) for _ in range(26)]
    walks += [(rng.uniform(CROSS[0] + 1, CROSS[1] - 1), rng.uniform(10, MAP_Y - 2)) for _ in range(12)]
    for gx, gy in walks:
        put(rng.choice(walkers), gx, gy, centered=True)

    fixed = list(items)
    items += cast_items(park_cast(random.Random(21), 0, TRAIL_LEN, 18), 0)

    shade = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(shade)
    for pts in shadows:
        d.polygon([(x + 7, y + 3) for x, y in pts], fill=120)
    shade = shade.filter(ImageFilter.GaussianBlur(5))
    canvas = Image.composite(Image.new('RGBA', (W, H), (70, 50, 40, 255)), canvas, shade.point(lambda v: v // 2))

    base = canvas.copy()
    # 物件自己的亮度：棚內全亮、棚頂較暗，前面的物件會蓋住後面
    objval, objmask = Image.new('L', (W, H), 0), Image.new('L', (W, H), 0)
    for _, s, x, y, glow in sorted(items, key=lambda v: v[0]):
        canvas.alpha_composite(s, (x, y))
        alpha = s.getchannel('A')
        ramp = np.clip(.45 + np.linspace(0, 1, s.height) * 1.9, 0, 1) * glow
        val = Image.fromarray((np.tile(ramp[:, None], (1, s.width)) * 255).astype(np.uint8))
        objval.paste(val, (x, y), alpha)
        objmask.paste(255, (x, y), alpha)

    # 主街燈串：沿 24° 軸掛在街燈之間
    d = ImageDraw.Draw(canvas)
    for gy in (MAIN[0] + .4, MAIN[1] - .4):
        row = sorted(l for l in lamps if l[2] == gy)
        for a, b in zip(row, row[1:]):
            if b[0] - a[0] > 400:
                continue
            pts = []
            for i in range(25):
                t = i / 24
                pts.append((a[0] + (b[0] - a[0]) * t, a[1] - 66 + (b[1] - a[1]) * t + 20 * (1 - (2 * t - 1) ** 2)))
            d.line(pts, fill='#3b2a20', width=1)
            world['strings'].append([(round(x, 1), round(y, 1)) for x, y in pts])
            for x, y in pts[2:-1:3]:
                d.ellipse((x - 2.2, y, x + 2.2, y + 4.4), fill='#ffd978', outline='#5a4026')
                sources.append((x, y + 14, 22, .12))
    return canvas.convert('RGB'), sources, count, objval, objmask, base, fixed, world


def lightmap(sources):
    k = 3
    h, w = H // k + 1, W // k + 1
    m = np.zeros((h, w), np.float32)
    for x, y, r, s in sources:
        r /= k
        x0, x1 = int(max(0, x / k - r * 2)), int(min(w, x / k + r * 2))
        y0, y1 = int(max(0, y / k - r * 1.4)), int(min(h, y / k + r * 1.4))
        if x1 <= x0 or y1 <= y0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        m[y0:y1, x0:x1] += s * np.exp(-(((xx - x / k) / r) ** 2 + ((yy - y / k) / (r * .62)) ** 2) * 1.6)
    im = Image.fromarray(np.clip(m, 0, 1) * 255).convert('L').resize((W, H), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255


def compose(glow, objval, objmask):
    val = np.asarray(objval).astype(np.float32) / 255
    mask = np.asarray(objmask).astype(np.float32) / 255
    return mask * np.maximum(val, glow * .75) + (1 - mask) * glow


def grade(base, light, ambient, warm, sat):
    a = np.asarray(base).astype(np.float32) / 255
    lum = (a * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
    out = lum + (a - lum) * sat
    out = out * (np.array(ambient) + light[..., None] * np.array(warm))
    bulb = (a[..., 0] > .93) & (a[..., 1] > .72) & (a[..., 2] < .50)
    bulb = np.asarray(Image.fromarray((bulb * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32)[..., None] / 255
    out = out * (1 - bulb) + a * bulb
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def anim(season='autumn', seconds=14, fps=30):
    """小徑的動態預覽：取前左轉角，路人密度比實際高，方便一次看齊所有動作。"""
    _, _, _, _, _, base, fixed, _ = build(season)
    gx, gy = 16, MAP_Y + TRAIL_OFF
    cx, cy = P(gx, gy)
    box = (int(cx) - 620, int(cy) - 400, int(cx) + 620, int(cy) + 360)
    near = int(np.argmin(np.linalg.norm(LINE - (gx, gy), axis=1)))
    cast = park_cast(random.Random(4), float(LENGTHS[near]) - 55, 100, 10)
    still = [i for i in fixed if i[2] < box[2] and i[2] + i[1].width > box[0] and i[3] < box[3] and i[3] + i[1].height > box[1]]
    dark = Image.new('RGBA', (22, 8), (0, 0, 0, 0))
    ImageDraw.Draw(dark).ellipse((0, 0, 21, 7), fill=(60, 45, 35, 70))
    (OUT / 'park_frames').mkdir(exist_ok=True)
    for n in range(seconds * fps):
        im = base.crop(box)
        moving = cast_items(cast, n / fps)
        for it in moving:
            if it[1].height > 15:
                x, y = blob(it)
                if 0 <= x - box[0] - 11 < im.width - 22 and 0 <= y - box[1] - 5 < im.height - 8:
                    im.alpha_composite(dark, (x - box[0] - 11, int(y) - box[1] - 5))
        for _, s, x, y, _g in sorted(still + moving, key=lambda v: v[0]):
            x -= box[0]
            y -= box[1]
            if x + s.width > 0 and y + s.height > 0 and x < im.width and y < im.height:
                cropped = s.crop((max(0, -x), max(0, -y), s.width, s.height))
                im.alpha_composite(cropped, (max(0, x), max(0, y)))
        im.convert('RGB').save(OUT / f'park_frames/{n:04d}.png')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', str(OUT / 'park_frames/%04d.png'),
                    '-pix_fmt', 'yuv420p', '-crf', '20', str(OUT / 'park_preview.mp4')], check=True)
    for f in (OUT / 'park_frames').glob('*.png'):
        f.unlink()
    (OUT / 'park_frames').rmdir()
    print('anim', box)


def export(region='hk', ground_scale=.7):
    """匯出遊戲用資料到 public/map/<地區>/：四季地面、燈光圖、物件素材、layout.json。"""
    out = ROOT / 'public/map' / region
    (out / 'sprites').mkdir(parents=True, exist_ok=True)
    xs, ys = zip(*(P(*p) for p in LINE))
    box = int(min(xs)) - 420, int(min(ys)) - 300, int(max(xs)) + 420, int(max(ys)) + 340
    done = {}
    for season in SEASONS:
        _, sources, _, _, _, base, fixed, world = build(season)
        g = base.convert('RGB').crop(box)
        g.resize((round(g.width * ground_scale), round(g.height * ground_scale)), Image.LANCZOS).save(out / f'ground_{season}.webp', quality=80, method=6)
        for sp, name_w in [(s_, SPRITES[id(s_)]) for _, s_, *_r in fixed if id(s_) in SPRITES]:
            name, width = name_w
            if name not in done:
                im = Image.open(ART / f'{name}.webp').convert('RGBA')
                k = min(1, width * 2 / im.width)
                im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS).save(out / 'sprites' / f'{name}.webp', quality=88, method=6)
                done[name] = True
    glow = lightmap(sources)
    gl = Image.fromarray((glow * 255).astype(np.uint8)).crop(box)
    gl = gl.resize((gl.width // 4, gl.height // 4), Image.BILINEAR)
    Image.merge('RGBA', (Image.new('L', gl.size, 255), Image.new('L', gl.size, 255), Image.new('L', gl.size, 255), gl)).save(out / 'glow.webp', quality=70)
    # 物件：攤位另列 slots，走動的行人不匯出，樹用 @big／@small 依季節換
    slots_at = {}
    for sl in world['slots']:
        sx, sy = P(sl['gx'], sl['gy'])
        slots_at[(round(sx, 1), round(sy, 1))] = sl
    items, slots = [], []
    for sy, sp, x, y, glow_v in fixed:
        if id(sp) not in SPRITES:
            continue
        name, _ = SPRITES[id(sp)]
        entry = dict(n=name, x=x - box[0], y=y - box[1], w=sp.width, h=sp.height, d=round(sy - box[1], 1))
        if name.startswith('tree_'):
            entry['n'] = '@' + name.rsplit('_', 1)[1]
        if name.startswith('stall_'):
            sl = slots_at[min(slots_at, key=lambda k: abs(k[0] - (x + corner(sp)[0])) + abs(k[1] - sy))]
            fx, fy = P(sl['gx'] - 2, sl['gy'] + 1.7)
            entry.update(gx=sl['gx'], gy=sl['gy'], kind=sl['kind'], fx=round(fx - box[0], 1), fy=round(fy - box[1], 1))
            slots.append(entry)
        else:
            items.append(entry)
    # 可走範圍：半格一點，1＝可走
    step, lo = .5, -16
    n_x, n_y = int((MAP_X + 32) / step), int((MAP_Y + 32) / step)
    gx, gy = np.meshgrid(lo + np.arange(n_x) * step, lo + np.arange(n_y) * step)
    ok = (gx >= 0) & (gx <= MAP_X) & (gy >= 0) & (gy <= MAP_Y)
    ok |= (gy > MAIN[0]) & (gy < MAIN[1]) & (gx > -TRAIL_OFF) & (gx < MAP_X + TRAIL_OFF)
    ok |= (gx > CROSS[0]) & (gx < CROSS[1]) & (gy > 0) & (gy < MAP_Y + TRAIL_OFF)
    near = np.full(gx.shape, 1e9)
    for px, py in LINE[::2]:
        near = np.minimum(near, (gx - px) ** 2 + (gy - py) ** 2)
    ok |= near < (TRAIL_W / 2 - .3) ** 2
    for x0, y0, x1, y1 in world['blocks'] + [(HUB[0] - 1.5, HUB[1] - 1.5, HUB[0] + 1.5, HUB[1] + 1.5)]:
        ok &= ~((gx > x0 + .4) & (gx < x1) & (gy > y0 + .3) & (gy < y1))
    aisles = [[2, g + 2.8, MAP_X - 2, g + 2.8] for g in (16, 23, 30, 37, 55, 62, 69, 76)]
    aisles += [[2, sum(MAIN) / 2, MAP_X - 2, sum(MAIN) / 2], [sum(CROSS) / 2, 10, sum(CROSS) / 2, MAP_Y - 2]]
    layout = dict(size=[box[2] - box[0], box[3] - box[1]], ground=ground_scale, unit=UNIT,
                  transform=dict(a1=A1, b1=B1, a2=A2, b2=B2, ox=-min_x - box[0], oy=-min_y - box[1]),
                  fill={k: GRASS[k][0] for k in SEASONS}, trail=[[round(a, 2), round(b, 2), round(c, 3), round(e, 3)] for (a, b), (c, e) in zip(LINE, NORMAL)],
                  trailWidth=TRAIL_W, hub=HUB, start=[HUB[0], HUB[1] + 9], aisles=aisles,
                  mask=dict(lo=lo, step=step, rows=[''.join('1' if v else '0' for v in r) for r in ok]),
                  strings=[[(round(x - box[0], 1), round(y - box[1], 1)) for x, y in line] for line in world['strings']],
                  slots=sorted(slots, key=lambda v: v['d']), items=sorted(items, key=lambda v: v['d']))
    (out / 'layout.json').write_text(json.dumps(layout, separators=(',', ':')))
    print('export', layout['size'], len(slots), 'slots', len(items), 'items', len(done), 'sprites')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    now = season_of(datetime.date.today().month)
    days, count = {}, 0
    tile = Image.new('RGB', (1800 + 10, 1120 + 10), 'white')
    for i, season in enumerate(SEASONS):
        day, sources, count, objval, objmask, _, _, _ = build(season)
        light = compose(lightmap(sources), objval, objmask)
        dusk = grade(day, light, (.60, .46, .47), (.52, .46, .30), .76)
        night = grade(day, light, (.19, .23, .42), (.88, .76, .50), .90)
        for name, im in (('day', day), ('dusk', dusk), ('night', night)):
            im.resize((2000, round(H * 2000 / W)), Image.LANCZOS).save(OUT / f'{season}_{name}.jpg', quality=86)
        days[season] = day
        x, y = map(int, P(14, MAP_Y + 4))
        tile.paste(day.crop((x - 450, y - 280, x + 450, y + 280)), ((i % 2) * 910, (i // 2) * 570))
        if season == now:
            cx, cy = map(int, P(*HUB))
            box = (cx - 470, cy - 300, cx + 470, cy + 300)
            trio = Image.new('RGB', (940, 1840), 'white')
            for j, im in enumerate((day, dusk, night)):
                trio.paste(im.crop(box), (0, j * 620))
            trio.save(OUT / 'compare_three.jpg', quality=90)
            px, py = P(34, 34)
            night.crop((int(px) - 188, int(py) - 334, int(px) + 188, int(py) + 334)).save(OUT / 'phone_night.jpg', quality=90)
    tile.save(OUT / 'seasons_close.jpg', quality=90)
    grid = Image.new('RGB', (2410, round(H * 1200 / W) * 2 + 10), 'white')
    for i, season in enumerate(SEASONS):
        grid.paste(days[season].resize((1200, round(H * 1200 / W)), Image.LANCZOS), ((i % 2) * 1210, (i // 2) * (round(H * 1200 / W) + 10)))
    grid.save(OUT / 'seasons_day.jpg', quality=88)
    print('stalls', count, 'size', (W, H), 'now', now)


if 'anim' in sys.argv:
    anim()
elif 'export' in sys.argv:
    export()
else:
    main()
