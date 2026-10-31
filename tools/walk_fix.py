#!/usr/bin/env python3
"""從 art/src/walk.png 切出走路人物，修正重複步態與格邊雜點。

原圖第 1、2 步幾乎一樣，腿不會交替，所以第 2 步改成「上半身沿用第 1 步、
下半身左右鏡射」。只留最大連通區塊，切掉跨格殘留。
輸出 public/art/walk_<角色>_<se|ne>_<idle|1|2>.webp 與 walk_manifest.json。
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ROLES = ['hero', 'cap', 'camera', 'student', 'potter', 'leather']
HIP = 0.70     # 身高 70% 以下算腿
OUT_H = 96     # 輸出高度


def figures(sheet):
    """原圖人物跨出格線，改用連通區塊找出 36 個人，再依位置排回 6×6。"""
    a = sheet.copy()
    key = (a[..., 0] > 150) & (a[..., 1] < 110) & (a[..., 2] > 150)
    a[key, 3] = 0
    label, n = ndimage.label(a[..., 3] > 40, structure=np.ones((3, 3)))
    boxes = ndimage.find_objects(label)
    sizes = ndimage.sum(np.ones_like(label), label, range(1, n + 1))
    big = sorted(np.argsort(sizes)[::-1][:36], key=lambda i: boxes[i][0].stop)
    grid = []
    for r in range(6):
        row = sorted(big[r * 6:(r + 1) * 6], key=lambda i: boxes[i][1].start)
        cells = []
        for i in row:
            s = boxes[i]
            part = a[s].copy()
            part[label[s] != i + 1, 3] = 0
            cells.append(Image.fromarray(part))
        grid.append(cells)
    return grid


def alternate(step):
    """鏡射腿部，腰線以上不動。"""
    a = np.asarray(step).copy()
    h, w = a.shape[:2]
    hip = int(h * HIP)
    legs = a[hip:]
    cols = np.where(legs[..., 3].any(0))[0]
    mid = (cols.min() + cols.max()) / 2
    flipped = np.zeros_like(legs)
    for x in range(w):
        src = int(round(2 * mid - x))
        if 0 <= src < w:
            flipped[:, x] = legs[:, src]
    a[hip:] = flipped
    return Image.fromarray(a)


def main():
    sheet = np.asarray(Image.open(ROOT / 'art/src/walk.png').convert('RGBA'))
    grid = figures(sheet)
    manifest, frames = {}, {}
    for r, role in enumerate(ROLES):
        scale = OUT_H / grid[r][0].height     # 同一角色用同一比例，走路才不會忽大忽小
        for direction, base in (('se', 0), ('ne', 3)):
            idle, one = grid[r][base], grid[r][base + 1]
            for frame, im in (('idle', idle), ('1', one), ('2', alternate(one))):
                im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
                name = f'walk_{role}_{direction}_{frame}'
                im.save(ROOT / 'public/art' / f'{name}.webp', lossless=True)
                manifest[name] = dict(w=im.width, h=im.height, anchorX=im.width / 2, anchorY=im.height - 2)
                frames[name] = im
    (ROOT / 'public/art/walk_manifest.json').write_text(json.dumps(manifest, indent=1))

    # 檢查頁：每列一個角色；動畫 GIF 看腿有沒有交替
    sheet_im = Image.new('RGB', (6 * 90 + 20, 6 * 106 + 20), '#cfd8d0')
    for r, role in enumerate(ROLES):
        for c, key in enumerate(('se_idle', 'se_1', 'se_2', 'ne_idle', 'ne_1', 'ne_2')):
            im = frames[f'walk_{role}_{key}']
            sheet_im.paste(im, (10 + c * 90 + (80 - im.width) // 2, 10 + r * 106 + 100 - im.height), im)
    (ROOT / 'docs/design/iso/mock').mkdir(parents=True, exist_ok=True)
    sheet_im.save(ROOT / 'docs/design/iso/mock/walk_check.png')
    gif = []
    for f in ('1', 'idle', '2', 'idle'):
        canvas = Image.new('RGB', (6 * 90 + 20, 2 * 106 + 20), '#cfd8d0')
        for c, role in enumerate(ROLES):
            for r, d in enumerate(('se', 'ne')):
                im = frames[f'walk_{role}_{d}_{f}']
                canvas.paste(im, (10 + c * 90 + (80 - im.width) // 2, 10 + r * 106 + 100 - im.height), im)
        gif.append(canvas)
    gif[0].save(ROOT / 'docs/design/iso/mock/walk_check.gif', save_all=True, append_images=gif[1:], duration=170, loop=0)
    print('frames', len(manifest))


main()
