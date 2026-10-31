#!/usr/bin/env python3
"""切公園小徑的路人：art/src/park_people.png、park_extra.png，以及重畫步態的 walk_v2.png。

三張都是 6 欄：前向 A/B/C、後向 A/B/C（聊天列例外）。A、C 是左右腳前踏，B 是雙腳靠攏的過渡格。
前向：walk_v2 朝左下，park_* 朝右下（FACES 記錄，遊戲靠水平翻轉得到另一個方向）。後向都朝右上。
輸出 public/art/<名字>_<se|ne>_<a|b|c>.webp、park_chat<n>_<1|2>.webp 與 park_manifest.json。
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'public/art'
PEOPLE = ['jogger_f', 'jogger_m', 'dogwalker', 'grandpa', 'grandma']
WALKERS = ['hero', 'cap', 'camera', 'student', 'potter', 'leather']
# 列名 → 輸出高度（人物 96，遊戲裡再縮到 44）
EXTRA = dict(cyclist=112, shiba=44, poodle=44)
CHAT = 3


def clean(path):
    a = np.asarray(Image.open(path).convert('RGBA')).copy()
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    key = (r > 150) & (g < 110) & (b > 150)                         # 洋紅與輪輻裡的洋紅混色
    a[key, 3] = 0
    edge = ndimage.binary_dilation(key, iterations=2)               # 混色邊只在洋紅旁邊處理，紫髮才不會被吃掉
    a[edge & (r > 110) & (b > 100) & (g < .72 * np.minimum(r, b)) & (np.abs(r - b) < 110), 3] = 0
    return a


def rows_of(a):
    """用透明空行找出每一列。"""
    has = a[..., 3].any(1)
    label, n = ndimage.label(has)
    spans = [s[0] for s in ndimage.find_objects(label)]
    return [s for s in spans if s.stop - s.start > 40]


def cell(a, span, col, cols=6):
    w = a.shape[1] / cols
    part = a[span.start:span.stop, int(col * w):int((col + 1) * w)].copy()
    label, n = ndimage.label(part[..., 3] > 40, structure=np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(np.ones_like(label), label, range(1, n + 1))
        part[~np.isin(label, np.where(sizes > 80)[0] + 1), 3] = 0     # 去掉碎點，聊天格保留兩個人
    return Image.fromarray(part)


def trim(im, scale):
    im = im.crop(im.getbbox())
    return im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)


def save(im, name, manifest):
    im.save(ART / f'{name}.webp', lossless=True)
    manifest[name] = dict(w=im.width, h=im.height, anchorX=im.width / 2, anchorY=im.height - 2)


def strip(a, spans, names, heights, manifest, prefix=''):
    for span, name in zip(spans, names):
        cells = [cell(a, span, c) for c in range(6)]
        scale = heights[name] / max(c.getbbox()[3] - c.getbbox()[1] for c in cells)   # 同一列同比例
        for c, im in enumerate(cells):
            save(trim(im, scale), f"{prefix}{name}_{'se' if c < 3 else 'ne'}_{'abc'[c % 3]}", manifest)


def main():
    manifest = {}
    a = clean(ROOT / 'art/src/park_people.png')
    strip(a, rows_of(a), PEOPLE, dict.fromkeys(PEOPLE, 96), manifest, 'park_')
    b = clean(ROOT / 'art/src/park_extra.png')
    spans = rows_of(b)
    strip(b, spans[:3], list(EXTRA), EXTRA, manifest, 'park_')
    chat = [cell(b, spans[3], c) for c in range(6)]
    scale = 96 / max(c.getbbox()[3] - c.getbbox()[1] for c in chat)
    for i in range(CHAT):
        for j in range(2):
            save(trim(chat[i * 2 + j], scale), f'park_chat{i}_{j + 1}', manifest)
    w = clean(ROOT / 'art/src/walk_v2.png')
    strip(w, rows_of(w), WALKERS, dict.fromkeys(WALKERS, 96), manifest, 'walk2_')
    (ART / 'park_manifest.json').write_text(json.dumps(manifest, indent=1))
    print(len(manifest), 'frames')


main()
