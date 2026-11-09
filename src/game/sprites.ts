// ปรับสเกลรายเฟรมให้น้องขนาดเท่ากันทุกท่า
// ภาพแต่ละชีต/แต่ละช่องเจนมาไม่เท่ากัน (Gemini) — วัดขนาดตัวในแต่ละช่องจากภาพจริงตอนโหลด แล้วย่อ/ขยายให้เท่าท่านั่ง/เดินของวัยเดียวกันในชีตหลัก
// ขนาดตัว = ค่าเฉลี่ยเรขาคณิตของ √(พื้นที่พิกเซลทึบ) กับ √(พื้นที่กรอบ) — ท่าขดตัวไม่ถูกขยายเกิน
// ภาพใหม่ที่เจนมาเพิ่มได้รับการปรับอัตโนมัติ ไม่ต้องจูนตัวเลขเอง

interface Cell { m: number; /** ช่องว่างใต้ตัว (พิกเซลภาพ) */ bottom: number; }
const cache = new WeakMap<HTMLImageElement, Cell[][]>();

function measure(im: HTMLImageElement, cols: number): Cell[][] {
  const hit = cache.get(im);
  if (hit) return hit;
  const W = im.naturalWidth, H = im.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(im, 0, 0);
  let data: Uint8ClampedArray;
  try { data = c.getImageData(0, 0, W, H).data; } catch { return []; }
  const fw = W / cols, fh = H / 3, out: Cell[][] = [];
  for (let r = 0; r < 3; r++) {
    const row: Cell[] = [];
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor(col * fw), x1 = Math.floor((col + 1) * fw), y0 = Math.floor(r * fh), y1 = Math.floor((r + 1) * fh);
      let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (data[(y * W + x) * 4 + 3] > 40) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      const bb = n ? Math.sqrt((maxX - minX + 1) * (maxY - minY + 1)) : 0;
      row.push({ m: n ? Math.sqrt(Math.sqrt(n) * bb) : 0, bottom: n ? y1 - 1 - maxY : 0 });
    }
    out.push(row);
  }
  cache.set(im, out);
  return out;
}

/** ท่าที่ตัวเล็กกว่ายืนตามธรรมชาติ (ขดหลับ หมอบ ก้มกิน) */
function prior(sheet: 'main' | 'x' | 's', col: number, row: number): number {
  if (sheet === 's') return col === 0 ? 0.84 : 0.9;
  if (sheet === 'x' && col === 0) return 0.96;
  if (sheet === 'main' && col === 3 && row === 2) return 0.86; // วัยชราคอลัมน์ 4 = ท่านอน
  return 1;
}

/**
 * ตัวคูณสเกลของเฟรม และระยะเลื่อนลงให้เท้าแตะพื้น (พิกเซลภาพ)
 * main = ชีตหลัก (ใช้เป็นขนาดอ้างอิงของแต่ละวัย) · keep = ไม่ปรับ (เช่น นกกางปีก ที่ควรดูใหญ่ขึ้นจริง)
 */
export function frameFit(main: HTMLImageElement, im: HTMLImageElement, sheet: 'main' | 'x' | 's', cols: number, col: number, row: number, keep = false): { k: number; bottom: number } {
  const ref = measure(main, 4)[row], cell = measure(im, cols)[row]?.[col];
  if (!ref || !cell || !cell.m) return { k: 1, bottom: 0 };
  if (keep) return { k: 1, bottom: cell.bottom };
  const base = [ref[0].m, ref[1].m, ref[2].m].sort((a, b) => a - b)[1]; // ค่ากลางของท่านั่ง/เดิน
  const k = Math.min(1.6, Math.max(0.6, (base * prior(sheet, col, row)) / cell.m));
  return { k, bottom: cell.bottom };
}
