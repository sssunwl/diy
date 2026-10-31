#!/usr/bin/env python3
"""切 art/src/trees.png：4 欄＝春夏秋冬、2 列＝大小樹，輸出 public/art/tree_<季>_<big|small>.webp。"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SEASONS = ['spring', 'summer', 'autumn', 'winter']

a = np.asarray(Image.open(ROOT / 'art/src/trees.png').convert('RGBA')).copy()
h, w = a.shape[:2]
r, g, b = [a[..., i].astype(int) for i in range(3)]
key = (r > 110) & (b > 100) & (g < .72 * np.minimum(r, b)) & (np.abs(r - b) < 110)    # 含洋紅混色邊
a[key, 3] = 0
cw, ch = w / 4, h / 2
for row, size in enumerate(('big', 'small')):
    for col, season in enumerate(SEASONS):
        y0, y1, x0, x1 = int((row and .59) * h), int((.59 if row == 0 else 1) * h), int(col * cw), int((col + 1) * cw)   # 大樹超過半格
        cell = a[y0:y1, x0:x1].copy()
        label, n = ndimage.label(cell[..., 3] > 40, structure=np.ones((3, 3)))
        sizes = ndimage.sum(np.ones_like(label), label, range(1, n + 1))
        keep = np.where(sizes > 40)[0] + 1 if season == 'spring' else [int(np.argmax(sizes)) + 1]   # 只有櫻花留花瓣
        cell[~np.isin(label, keep), 3] = 0
        im = Image.fromarray(cell)
        im = im.crop(im.getbbox())
        im.save(ROOT / f'public/art/tree_{season}_{size}.webp', lossless=True)
        print(season, size, im.size)
