# ทำเส้นขอบของชีตของใช้ให้บางลงใกล้เคียงตัวน้อง
# ขยายชีต ×N แบบพิกเซลชัด แล้วกัดเส้นสีเข้มให้เหลือเส้นกลางกว้าง 1 พิกเซลใหม่
# พิกเซลเส้นที่ถูกกัด → ใช้สีของพิกเซลไม่เข้มที่ใกล้ที่สุด (ขอบนอกจะกลายเป็นโปร่งใส)
# ใช้: python3 thin_lines.py in.png out.png N
import sys, numpy as np
from PIL import Image
from scipy import ndimage

src, out, N = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGBA')
im = im.resize((im.width * N, im.height * N), Image.NEAREST)
a = np.asarray(im).copy()
rgb = a[..., :3].astype(int); alpha = a[..., 3] > 0
lum = 0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]
dark = alpha & (lum < 75)
keep = ndimage.binary_erosion(dark, structure=np.ones((N, N)), border_value=0)
# เส้นหนา 1 พิกเซลเดิม (= N พิกเซลใหม่) จะเหลือเส้นกลาง; พื้นที่สีเข้มใหญ่ยังอยู่
drop = dark & ~keep
src_mask = ~dark | keep  # พิกเซลที่ใช้เป็นแหล่งสีได้
_, (iy, ix) = ndimage.distance_transform_edt(~src_mask, return_indices=True)
b = a.copy()
b[drop] = a[iy[drop], ix[drop]]
Image.fromarray(b).save(out)
