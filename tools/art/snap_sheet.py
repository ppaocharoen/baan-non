# ตัดสไปรต์จากภาพ Gemini (พิกเซลปลอม) → พิกเซลจริงบนตาราง
# 1) ลบพื้นเขียว + เศษเล็กๆ  2) หาเฟสของตารางในแต่ละช่องด้วย pitch ที่กำหนด (ทศนิยมได้ แกน x/y ต่างกันได้)
# 3) เก็บสีกลางเม็ด (ไม่เอาสีเขียวที่ติดขอบ)  4) วางเฟรมขนาดเท่ากัน เท้าแตะขอบล่าง หัวอยู่กลาง
# ใช้: python3 snap_sheet.py in.jpg cols rows pitch_x pitch_y out.png [bbox]
#   bbox = จัดกึ่งกลางตามกรอบทั้งตัว (ใช้กับสัตว์) · ไม่ใส่ = จัดตามกึ่งกลางหัว (คน)
import sys, numpy as np
from PIL import Image
from scipy import ndimage

src, cols, rows = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
px, py, out = float(sys.argv[4]), float(sys.argv[5]), sys.argv[6]
BBOX = len(sys.argv) > 7 and sys.argv[7] == 'bbox'
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
bg = (g > 170) & (g - np.maximum(r, b) > 100)
greenish = (g > r + 25) & (g > b + 25)
H, W = bg.shape; cw, ch = W // cols, H // rows

def phase(prof, p):
    pos = np.arange(len(prof)) + 0.5
    z = (prof * np.exp(2j * np.pi * pos / p)).sum()
    return (np.angle(z) / (2 * np.pi)) * p

frames = []
for j in range(rows):
    for i in range(cols):
        sl = (slice(j * ch, (j + 1) * ch), slice(i * cw, (i + 1) * cw))
        cell, fg = im[sl], ~bg[sl]
        lab, n = ndimage.label(fg)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            fg = np.isin(lab, [k + 1 for k, v in enumerate(sizes) if v >= 0.03 * sizes.max()])
        ys, xs = np.where(fg)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        c, f, gr = cell[y0:y1, x0:x1], fg[y0:y1, x0:x1], greenish[sl][y0:y1, x0:x1]
        # เฟสของตาราง: ขอบสีควรตกบนเส้นตาราง
        dx = np.abs(np.diff(c, axis=1)).sum(-1) * (f[:, 1:] & f[:, :-1]); dy = np.abs(np.diff(c, axis=0)).sum(-1) * (f[1:] & f[:-1])
        ox, oy = phase(dx.sum(0), px) % px, phase(dy.sum(1), py) % py
        gx = np.arange(ox - px, c.shape[1] + px, px); gy = np.arange(oy - py, c.shape[0] + py, py)
        nx, ny = len(gx) - 1, len(gy) - 1
        fr = np.zeros((ny, nx, 4), np.uint8)
        for jj in range(ny):
            a0, a1 = int(round(gy[jj])), int(round(gy[jj + 1])); q = max(1, (a1 - a0) // 4)
            a0, a1 = max(0, a0 + q), min(c.shape[0], a1 - q)
            if a1 <= a0: continue
            for ii in range(nx):
                b0, b1 = int(round(gx[ii])), int(round(gx[ii + 1])); q2 = max(1, (b1 - b0) // 4)
                b0, b1 = max(0, b0 + q2), min(c.shape[1], b1 - q2)
                if b1 <= b0: continue
                m = f[a0:a1, b0:b1]
                if m.mean() < 0.5: continue
                ok = m & ~gr[a0:a1, b0:b1]
                sel = c[a0:a1, b0:b1][ok if ok.sum() >= 2 else m]
                fr[jj, ii, :3] = np.median(sel, 0).astype(np.uint8); fr[jj, ii, 3] = 255
        # เม็ดสีเขียวที่ติดขอบตัวละคร (จากพื้นเขียว) → เปลี่ยนเป็นสีเส้นขอบ (ใบตองสีเขียวด้านในไม่โดน)
        al = fr[..., 3] > 0
        edge = al & ~ndimage.binary_erosion(al)
        rr, gg, bb = (fr[..., k].astype(int) for k in range(3))
        gm = edge & (gg > rr + 20) & (gg > bb + 20)
        fr[gm, :3] = (30, 19, 12)
        # ตัดแถว/คอลัมน์ว่างรอบนอก
        a = fr[..., 3] > 0; yy, xx = np.where(a)
        fr = fr[yy.min():yy.max() + 1, xx.min():xx.max() + 1]
        top = max(1, fr.shape[0] // 5); hx = np.where((fr[:top, :, 3] > 0).any(0))[0]
        frames.append((j, i, fr, fr.shape[1] / 2 if BBOX else (hx.min() + hx.max()) / 2))
FW = int(max(max(f.shape[1] - ax, ax) for _, _, f, ax in frames) * 2) + 2
FH = max(f.shape[0] for _, _, f, _ in frames)
sheet = Image.new('RGBA', (FW * cols, FH * rows), (0, 0, 0, 0))
for j, i, f, ax in frames:
    img = Image.fromarray(f, 'RGBA')
    sheet.paste(img, (i * FW + round(FW / 2 - ax), j * FH + FH - f.shape[0]), img)
sheet.save(out)
print('frame', FW, 'x', FH, 'sheet', sheet.size)
