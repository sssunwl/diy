#!/usr/bin/env python3
"""Fixed-grid chroma-key slicer. Requires only Pillow. Run: python3 tools/slice.py.

Manual visual rejection lives in art/qa/rejections.json; remove an entry ONLY
after regenerating and reviewing that sheet. Rejected cells are never exported.
Anchors are pixel coordinates relative to the trimmed WebP, not fractions.
"""
from pathlib import Path
import argparse
import html
import json
import sys
from PIL import Image, ImageFilter

# Row-major naming tables (columns, rows, asset names).
ROLES = ('hero', 'cap', 'camera', 'student', 'potter', 'leather')
SHEETS = {
    'stalls_a': (3, 2, ['stall_accessory', 'stall_textile', 'stall_leather',
                       'stall_ceramic', 'stall_wood', 'stall_paper']),
    'stalls_b': (3, 2, ['stall_candle', 'stall_art', 'stall_food',
                       'stall_workshop', 'stall_other', 'stall_empty']),
    'ground_props': (4, 4, ['tile_walk_a', 'tile_walk_b', 'tile_road', 'tile_curb',
                          'prop_postbox', 'prop_streetlamp', 'prop_plant_tall',
                          'prop_plant_round', 'prop_flowerpots', 'prop_crates',
                          'prop_cardboard', 'prop_blackboard', 'prop_railing',
                          'prop_bench', 'prop_cat', 'prop_lights']),
    'buildings': (2, 2, ['bldg_fabric', 'bldg_buttons', 'bldg_leather', 'bldg_plain']),
    'walk': (6, 6, [f'walk_{role}_{direction}_{frame}' for role in ROLES
                    for direction in ('se', 'ne') for frame in ('idle', '1', '2')]),
    'portraits': (3, 4, [f'{kind}_{role}' for kind in ('full', 'bust') for role in ROLES]),
}
ROOT = Path(__file__).resolve().parents[1]


def key_magenta(image):
    """Soft chroma tolerance plus one-pixel RGB despill, including interior holes.

    Difference from green identifies magenta without deleting salmon reds or
    muted lavender. Strong magenta is fully transparent; mixed edge pixels get
    partial alpha. The one-pixel edge borrows RGB from a clean opaque neighbor.
    """
    image = image.convert('RGBA')
    pixels = []
    for r, g, b, a in image.getdata():
        chroma = min(r, b) - g
        if chroma > 45:
            a = round(a * max(0, min(1, (180 - chroma) / 135)))
        pixels.append((r, g, b, a) if a else (0, 0, 0, 0))
    result = Image.new('RGBA', image.size)
    result.putdata(pixels)
    alpha = result.getchannel('A')
    inner = alpha.filter(ImageFilter.MinFilter(3))
    w, h = result.size
    out = result.load()
    ap, ip = alpha.load(), inner.load()
    clean = result.copy().load()
    for y in range(h):
        for x in range(w):
            if ap[x, y] and (ip[x, y] < 250 or min(out[x, y][0], out[x, y][2]) - out[x, y][1] > 35):
                # Search nearest first; avoid spreading keyed background RGB.
                for radius in (1, 2, 3):
                    neighbors = []
                    for yy in range(max(0, y-radius), min(h, y+radius+1)):
                        for xx in range(max(0, x-radius), min(w, x+radius+1)):
                            r, g, b, a = clean[xx, yy]
                            if a >= 250 and min(r, b)-g < 35:
                                neighbors.append((r, g, b))
                    if neighbors:
                        out[x, y] = (*[round(sum(c[i] for c in neighbors)/len(neighbors)) for i in range(3)], ap[x, y])
                        break
                else:
                    if min(out[x, y][0], out[x, y][2]) - out[x, y][1] > 35:
                        out[x, y] = (0, 0, 0, 0)
    # Averaging differently colored neighbors can reintroduce violet; remove
    # that last chroma excess on the keyed edge, including very low alpha.
    result.putdata([(r, g, min(b, g+20), a) if a and min(r, b)-g > 35
                    else (r, g, b, a) for r, g, b, a in result.getdata()])
    return result


def solid_bbox(image):
    return image.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()


def anchor(image, tile=False):
    box = solid_bbox(image)
    if tile:
        return ((box[0]+box[2]-1)/2, (box[1]+box[3]-1)/2)
    y = box[3]-1
    alpha = image.getchannel('A')
    xs = [x for x in range(image.width) if alpha.getpixel((x, y)) >= 128]
    return ((min(xs)+max(xs))/2, y)


def contact_page(manifest, issues):
    cards = []
    for name, m in manifest.items():
        scale = min(1, 260/m['w'], 280/m['h'])
        w, h = m['w']*scale, m['h']*scale
        cards.append(f'<figure><div class="stage"><div style="position:relative;width:{w}px;height:{h}px">'
                     f'<img src="{name}.webp" width="{w}" height="{h}" alt="{name}">'
                     f'<i style="left:{m["anchorX"]*scale}px;top:{m["anchorY"]*scale}px"></i>'
                     f'</div></div><figcaption>{name}<br>{m["w"]}×{m["h"]} · '
                     f'anchor ({m["anchorX"]}, {m["anchorY"]})</figcaption></figure>')
    return '''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>趁墟素材檢查</title>
<style>body{background:#f1e7d6;color:#45372e;font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}figure{margin:0;border:1px solid #b5a18a;padding:12px} .stage{height:290px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#ccc 0 25%,#eee 0 50%) 0/20px 20px}img{display:block}i{position:absolute;width:7px;height:7px;transform:translate(-50%,-50%);background:red;border:1px solid white;border-radius:50%;box-shadow:0 0 0 1px #600}figcaption{padding-top:8px;overflow-wrap:anywhere}li{margin:6px}</style>
<h1>趁墟素材檢查</h1><p>紅點為裁邊後的像素錨點。棋盤格用於檢查透明邊緣。未通過的格子不會輸出。</p>''' + f'<p>已輸出 {len(manifest)} / 80 件。</p><details open><summary>尚未通過</summary><ul>' + ''.join(f'<li>{html.escape(k)}：{html.escape(v)}</li>' for k, v in issues.items()) + '</ul></details><main>' + ''.join(cards) + '</main></html>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT/'art/src')
    parser.add_argument('--output', type=Path, default=ROOT/'public/art')
    parser.add_argument('--rejections', type=Path, default=ROOT/'art/qa/rejections.json')
    args = parser.parse_args()
    rejected = json.loads(args.rejections.read_text()) if args.rejections.exists() else {}
    args.output.mkdir(parents=True, exist_ok=True)
    manifest, issues, metrics = {}, {}, {}
    for sheet, (cols, rows, names) in SHEETS.items():
        path = args.source/f'{sheet}.png'
        if not path.exists():
            issues[sheet] = '素材表缺失'
            continue
        source = Image.open(path)
        if source.size != (2048, 2048):
            issues[sheet] = f'尺寸錯誤：{source.size}，要求 2048×2048'
            continue
        if sheet in rejected:
            issues[sheet] = rejected[sheet]
            continue
        walk_cells = {}
        if sheet == 'walk':
            for row in range(rows):
                heights = []
                for col in range(cols):
                    cell = source.crop((round(col*2048/cols), round(row*2048/rows),
                                        round((col+1)*2048/cols), round((row+1)*2048/rows)))
                    keyed = key_magenta(cell)
                    box = solid_bbox(keyed)
                    walk_cells[row*cols+col] = keyed
                    if not box or abs((box[3]-1)/cell.height-0.85) > 0.015:
                        issues[sheet] = '人物腳底未對齊格高 85%（容差 1.5%）；整張拒絕切圖'
                    else:
                        heights.append(box[3]-box[1])
                if heights and max(heights)/min(heights) > 1.05:
                    issues[sheet] = '同角色六格高度相差超過 5%；整張拒絕切圖'
            if sheet in issues:
                continue
        # Round each boundary independently: 2048 is not divisible by 3 or 6.
        for index, name in enumerate(names):
            if name in rejected:
                issues[name] = rejected[name]
                continue
            row, col = divmod(index, cols)
            cell = source.crop((round(col*2048/cols), round(row*2048/rows),
                                round((col+1)*2048/cols), round((row+1)*2048/rows)))
            keyed = walk_cells[index] if sheet == 'walk' else key_magenta(cell)
            box = solid_bbox(keyed)
            if not box:
                issues[name] = '空格，請重生素材表'
                continue
            x0, y0, x1, y1 = box
            margins = (x0/cell.width, y0/cell.height, (cell.width-x1)/cell.width, (cell.height-y1)/cell.height)
            metrics[name] = {'cellBBox': box, 'margins': [round(v, 4) for v in margins]}
            if min(margins) < (0.035 if name.startswith('tile_') else 0.08):
                issues[name] = '格內留白不足或疑似跨格，拒絕硬切；請重生素材表'
                continue
            if name.startswith('tile_'):
                ratio = (x1-x0)/(y1-y0)
                if abs(ratio-2) > 0.025 or abs((x1-x0)/cell.width-0.90) > 0.02:
                    issues[name] = f'菱形比例或寬度不合格：比例 {ratio:.3f}，寬度 {(x1-x0)/cell.width:.3f}'
                    continue
            trimmed = keyed.crop(keyed.getbbox())
            ax, ay = anchor(trimmed, name.startswith('tile_'))
            trimmed.save(args.output/f'{name}.webp', 'WEBP', lossless=True, exact=True)
            manifest[name] = {'w': trimmed.width, 'h': trimmed.height, 'anchorX': ax, 'anchorY': ay}
    # Only remove our known generated names, never unrelated files.
    for _, _, names in SHEETS.values():
        for name in names:
            path = args.output/f'{name}.webp'
            if name not in manifest and path.exists():
                path.unlink()
    (args.output/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    (args.output/'contact.html').write_text(contact_page(manifest, issues))
    (args.output/'qa.json').write_text(json.dumps({'exported': len(manifest), 'expected': 80, 'issues': issues, 'metrics': metrics}, ensure_ascii=False, indent=2)+'\n')
    print(f'Exported {len(manifest)}/80 assets; {len(issues)} rejected entries. See {args.output}/contact.html')
    return 2 if issues else 0


if __name__ == '__main__':
    sys.exit(main())
