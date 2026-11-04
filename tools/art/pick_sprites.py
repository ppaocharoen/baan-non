# คัดสไปรต์จากภาพ Gemini ที่วางตำแหน่งไม่ตรงช่อง แล้วจัดเรียงใหม่เป็นตารางก่อน snap
# 1) ดูชิ้นส่วน:   python3 pick_sprites.py list in.jpg overview.png
#    → พิมพ์รายการชิ้น (เลข กรอบ ขนาด) และบันทึกภาพย่อพร้อมเลขกำกับ
# 2) จัดเรียง:     python3 pick_sprites.py arrange in.jpg cols out.png i0 i1 i2 ...
#    → วางชิ้นตามลำดับ (ซ้าย→ขวา บน→ล่าง) ในช่องเท่ากัน เท้าแตะขอบล่าง พื้นเขียว
#    แล้วส่งต่อ: python3 snap_sheet.py out.png cols rows pitch pitch final.png bbox
# 3) หา pitch:     python3 pick_sprites.py pitch in.jpg
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def load(src):
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    bg = (g > 170) & (g - np.maximum(r, b) > 100)
    return im, bg


def components(src, min_frac=0.15):
    im, bg = load(src)
    lab, n = ndimage.label(~bg)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    keep = [i for i in range(n) if sizes[i] >= min_frac * sizes.max()]
    # เรียงบน→ล่าง แล้วซ้าย→ขวา (แถวที่จุดกึ่งกลางห่างกันไม่เกินครึ่งความสูงเฉลี่ย ถือเป็นแถวเดียว)
    boxes = [(objs[i][0].start, objs[i][0].stop, objs[i][1].start, objs[i][1].stop, int(sizes[i])) for i in keep]
    avg_h = np.mean([b[1] - b[0] for b in boxes])
    boxes.sort(key=lambda b: (b[0] + b[1]) / 2)
    rows, cur = [], [boxes[0]]
    for b in boxes[1:]:
        if (b[0] + b[1]) / 2 - (cur[-1][0] + cur[-1][1]) / 2 < avg_h / 2: cur.append(b)
        else: rows.append(cur); cur = [b]
    rows.append(cur)
    return [b for row in rows for b in sorted(row, key=lambda b: b[2])]


def pitch(src):
    im, bg = load(src)
    d = np.abs(np.diff(im, axis=1)).sum(-1) * (~bg[:, 1:])
    prof = (d > 60).sum(0).astype(float); prof -= prof.mean()
    pos = np.arange(len(prof))
    return max((abs((prof * np.exp(2j * np.pi * pos / p)).sum()), p) for p in np.arange(5, 16, 0.02))[1]


cmd = sys.argv[1]
if cmd == 'list':
    src, out = sys.argv[2], sys.argv[3]
    boxes = components(src)
    img = Image.open(src).convert('RGB'); d = ImageDraw.Draw(img)
    for i, (y0, y1, x0, x1, s) in enumerate(boxes):
        print(f'{i}: y {y0}-{y1} x {x0}-{x1} ({x1 - x0}×{y1 - y0})')
        d.rectangle((x0, y0, x1, y1), outline=(255, 0, 0), width=6)
        d.rectangle((x0, y0, x0 + 90, y0 + 90), fill=(255, 0, 0))
        d.text((x0 + 20, y0 + 5), str(i), fill=(255, 255, 255), font_size=72)
    img.thumbnail((1000, 1000)); img.save(out)
elif cmd == 'arrange':
    src, cols, out, idx = sys.argv[2], int(sys.argv[3]), sys.argv[4], [int(x) for x in sys.argv[5:]]
    boxes = components(src); img = Image.open(src).convert('RGB'); pad = 30
    cells = []
    for i in idx:
        y0, y1, x0, x1, _ = boxes[i]
        c = Image.new('RGB', (x1 - x0 + 2 * pad, y1 - y0 + 2 * pad), (0, 255, 0))
        # ตัดเฉพาะพิกเซลของชิ้นนี้ (ไม่เอาเศษชิ้นข้างเคียงที่อยู่ในกรอบ)
        crop = img.crop((x0, y0, x1, y1))
        c.paste(crop, (pad, pad))
        cells.append(c)
    W = max(c.width for c in cells); H = max(c.height for c in cells); rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGB', (W * cols, H * rows), (0, 255, 0))
    for k, c in enumerate(cells):
        sheet.paste(c, ((k % cols) * W + (W - c.width) // 2, (k // cols) * H + H - c.height))
    sheet.save(out); print('arranged', sheet.size)
elif cmd == 'pitch':
    print(f'{pitch(sys.argv[2]):.2f}')
