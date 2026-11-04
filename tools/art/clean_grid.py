# ลบเส้นตารางสีเข้มที่ Gemini วาดคั่นช่อง (และขอบภาพ) ให้เป็นพื้นเขียว ก่อนส่งเข้า snap_sheet.py
# ใช้: python3 clean_grid.py in.jpg cols rows out.png [band]
import sys
from PIL import Image, ImageDraw
src, cols, rows, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
band = int(sys.argv[5]) if len(sys.argv) > 5 else 10
im = Image.open(src).convert('RGB'); W, H = im.size; d = ImageDraw.Draw(im); G = (0, 255, 0)
for i in range(cols + 1): x = round(i * W / cols); d.rectangle((x - band, 0, x + band, H), fill=G)
for j in range(rows + 1): y = round(j * H / rows); d.rectangle((0, y - band, W, y + band), fill=G)
im.save(out)
