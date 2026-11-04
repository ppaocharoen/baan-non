# ตัดสไปรต์จากภาพ Gemini พื้นเขียว → เฟรมขนาด native แบบพิกเซลคม
# ใช้: python3 sheet.py in.jpg cols rows target_h out.png [ref_row | px=7.7]
#   ref_row = แถวท่ายืนที่ใช้เทียบความสูง · px= กำหนดจำนวนพิกเซลภาพต่อ 1 พิกเซลเกมเอง (ใช้กับท่านั่ง/ถือของ)
import sys, numpy as np
from PIL import Image
src, cols, rows, target_h, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
arg = sys.argv[6] if len(sys.argv) > 6 else str(rows - 1)
ref_row = -1 if arg.startswith('px=') else int(arg)
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
# พื้นเขียวสด (#00FF00) — เข้มงวดพอไม่ให้ใบตอง/ใบไม้สีเขียวหายไปด้วย
bg = (g > 170) & (g - np.maximum(r, b) > 100)
# ตัดเศษเล็กๆ ที่ไม่ติดตัวละคร (เช่น กองหญ้าหลุดมา) ทีละช่อง
from scipy import ndimage
H0, W0 = bg.shape
for j in range(rows):
    for i in range(cols):
        sl = (slice(j * (H0 // rows), (j + 1) * (H0 // rows)), slice(i * (W0 // cols), (i + 1) * (W0 // cols)))
        lab, n = ndimage.label(~bg[sl])
        if n > 1:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            keep = np.isin(lab, [k + 1 for k, v in enumerate(sizes) if v >= 0.03 * sizes.max()])
            sub = bg[sl]; sub[~keep] = True; bg[sl] = sub
cw, ch = W // cols, H // rows
cells = []
for j in range(rows):
    for i in range(cols):
        m = ~bg[j*ch:(j+1)*ch, i*cw:(i+1)*cw]
        # ตัดจุดรบกวนเล็กๆ: ใช้แถว/คอลัมน์ที่มีพิกเซลวัตถุพอสมควร
        ys = np.where(m.sum(1) > 3)[0]; xs = np.where(m.sum(0) > 3)[0]
        cells.append((j, i, ys.min(), ys.max(), xs.min(), xs.max()))
# สเกลเดียวกันทุกเฟรม: ให้ความสูงเฉลี่ยของแถวอ้างอิง (ท่ายืน) = target_h
def head_width(cell):
    # ความกว้างหัว (พิกเซลภาพ): ไล่ลงจากจุกผม หาแถวที่กว้างสุดของสีผิว/ผมที่ต่อเนื่องกับแนวจุก
    R, G, B = cell[..., 0], cell[..., 1], cell[..., 2]
    fg = ~((G > 170) & (G - np.maximum(R, B) > 100))
    hm = (((R < 90) & (G < 80) & (B < 90)) | ((R > 90) & (R > G + 15) & (G > B) & (R < 230))) & fg
    ys = np.where(hm.sum(1) > 3)[0]; y0 = ys[0]; xk = int(np.where(hm[y0 + 3])[0].mean())
    best = 0
    for dy in range(60, 240, 6):
        if y0 + dy >= hm.shape[0]: break
        row = hm[y0 + dy]
        if not row[xk]: continue
        a = b = xk
        while a > 0 and row[a - 1]: a -= 1
        while b < len(row) - 1 and row[b + 1]: b += 1
        if b - a + 1 < 300: best = max(best, b - a + 1)
    return best
# px=auto → เทียบความกว้างหัวกับชุด A1 (หัวกว้าง 172 พิกเซลภาพ = 7.23 พิกเซลภาพต่อ 1 พิกเซลเกม) ใช้ค่ากลางของแต่ละแถว
if arg == 'px=auto':
    ws = {}
    for j in range(rows):
        for i in range(cols):
            ws.setdefault(j, []).append(head_width(im[j*ch:(j+1)*ch, i*cw:(i+1)*cw]))
    print('head widths', ws)
    arg = 'px=' + ','.join(str(round(7.23 * min(ws[j]) / 172, 2)) for j in range(rows))
# px= ใส่ค่าเดียว หรือรายแถวคั่นด้วยจุลภาค (เช่น px=9.5,8.3,8.3) — Gemini วาดสัดส่วนเพี้ยนต่างกันแต่ละท่า
if arg.startswith('px='): pxs = [float(v) for v in arg[3:].split(',')]; row_s = [1 / pxs[min(j, len(pxs) - 1)] for j in range(rows)]
else: row_s = [target_h / np.mean([c[3] - c[2] + 1 for c in cells if c[0] == ref_row])] * rows
s = row_s[0]
print('scale', [round(1/v, 2) for v in row_s], 'px per pixel')
frames = []
for (j, i, y0, y1, x0, x1) in cells:
    s = row_s[j]
    x_off, y_off = i*cw, j*ch
    crop = im[y_off + y0:y_off + y1 + 1, x_off + x0:x_off + x1 + 1]
    mask = ~bg[y_off + y0:y_off + y1 + 1, x_off + x0:x_off + x1 + 1]
    h2, w2 = max(1, round(crop.shape[0] * s)), max(1, round(crop.shape[1] * s))
    # ย่อแบบเฉลี่ยเฉพาะพิกเซลวัตถุ (สีไม่ปนเขียว)
    rgba = np.zeros((*crop.shape[:2], 4), np.float64)
    rgba[..., :3] = crop * mask[..., None]; rgba[..., 3] = mask
    def down(a): return np.asarray(Image.fromarray(a.astype(np.float32)).resize((w2, h2), Image.BOX))
    a = down(rgba[..., 3])
    col = np.stack([down(rgba[..., k]) for k in range(3)], -1) / np.maximum(a[..., None], 1e-6)
    alpha = (a > 0.5).astype(np.uint8) * 255
    # ลบสีเขียวที่ติดขอบ (green spill)
    gmax = np.maximum(col[..., 0], col[..., 2]); col[..., 1] = np.minimum(col[..., 1], gmax + 8)
    fr = np.dstack([np.clip(col, 0, 255).astype(np.uint8), alpha])
    # จุดยึดแนวนอน = กึ่งกลางหัว (แถวบนสุด 20%)
    top = max(1, h2 // 5); hx = np.where(alpha[:top].any(0))[0]
    frames.append((j, i, fr, (hx.min() + hx.max()) / 2))
# วางทุกเฟรมในช่องขนาดเท่ากัน เท้าแตะขอบล่าง หัวอยู่กลาง
FW = int(max(max(f.shape[1] - ax, ax) for _, _, f, ax in frames) * 2) + 2
FH = max(f.shape[0] for _, _, f, _ in frames)
sheet = Image.new('RGBA', (FW * cols, FH * rows), (0, 0, 0, 0))
for j, i, f, ax in frames:
    img = Image.fromarray(f, 'RGBA')
    sheet.paste(img, (i * FW + round(FW / 2 - ax), j * FH + FH - f.shape[0]), img)
sheet.save(out)
print('frame', FW, 'x', FH, 'sheet', sheet.size)
