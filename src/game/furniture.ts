// ภาพของในบ้าน: ใช้ชีต furniture.png (ตำแหน่งแต่ละชิ้นใน data/furniture-atlas.json)
// ถ้าภาพยังไม่โหลด วาดแบบพิกเซลด้วยโค้ดแทน · พิกัดเป็นพิกเซลเกม · (x, y) = กึ่งกลางล่างของชิ้น
import atlasJson from '../../data/furniture-atlas.json';
import { furnitureOf } from '../engine/home';

const ATLAS = atlasJson as unknown as Record<string, [number, number, number, number]>;
const sheet = new Image();
sheet.src = './art/furniture.png';
const sheetReady = () => sheet.complete && sheet.naturalWidth > 0;
export const whenSheetReady = (fn: () => void) => { if (sheetReady()) fn(); else sheet.addEventListener('load', fn, { once: true }); };

/** ความกว้างในฉาก (พิกเซลเกม) */
const worldW = (key: string, S: number) => (key === 'poop' ? 8 : key === 'dropping' ? 5 : (furnitureOf(key)?.w ?? 12) * S);
/** ความสูงในฉาก (พิกเซลเกม) — ใช้ทำกล่องแตะและวางน้องบนที่นอน */
export function itemHeight(key: string, S = ITEM_SCALE_DEFAULT): number {
  const a = ATLAS[key];
  if (a && sheetReady()) return (a[3] * worldW(key, S)) / a[2];
  return (ITEM_H[key] ?? 10) * S;
}
const ITEM_SCALE_DEFAULT = 1.6;
function sprite(c: CanvasRenderingContext2D, key: string, x: number, y: number, rx: (v: number) => number, S: number): boolean {
  const a = ATLAS[key];
  if (!a || !sheetReady()) return false;
  const w = worldW(key, S), h = (a[3] * w) / a[2];
  c.drawImage(sheet, a[0], a[1], a[2], a[3], rx(x - w / 2), rx(y - h), rx(w), rx(h));
  return true;
}

/** วาดชิ้นจากชีตตามความกว้างที่กำหนด (ใช้กับอึในถาด) */
function spriteW(c: CanvasRenderingContext2D, key: string, x: number, y: number, rx: (v: number) => number, w: number): boolean {
  const a = ATLAS[key];
  if (!a || !sheetReady()) return false;
  const h = (a[3] * w) / a[2];
  c.drawImage(sheet, a[0], a[1], a[2], a[3], rx(x - w / 2), rx(y - h), rx(w), rx(h));
  return true;
}

type R = (x: number, y: number, w: number, h: number, c: string) => void;

const P = {
  ink: '#3a2418', wood: '#9a6a3c', woodD: '#6e4a28', cream: '#f3e3c3', red: '#c0645a', redD: '#8e4038', pink: '#f2b6c0',
  blue: '#7fb8d8', blueD: '#4c86a8', sand: '#e8d29a', white: '#f4f1ea', gold: '#d9a441', goldD: '#9c7426', green: '#6e9b45', greenD: '#4a6e2c',
  poop: '#7a4a24', poopD: '#4e2e14',
};

/** ความสูงโดยประมาณของแต่ละชิ้น (ใช้ทำกล่องแตะ) */
export const ITEM_H: Record<string, number> = { bed: 8, coolmat: 3, condo: 32, cage: 26, litter: 7, peepad: 3, bowl: 6, ball: 6, wand: 14, perch: 14, plant: 16, lamp: 18, rug: 3 };

/** ขนาดของในฉากเทียบกับแบบที่วาด (ให้เข้ากับตัวน้อง) */
export const ITEM_SCALE = 1.6;

export function drawItem(c: CanvasRenderingContext2D, key: string, x: number, y: number, rx: (v: number) => number, t = 0, fill = 0, cap = 0, night = 0, S = ITEM_SCALE) {
  const r: R = (dx, dy, w, h, col) => { c.fillStyle = col; c.fillRect(rx(x + dx * S), rx(y + dy * S), rx(w * S), rx(h * S)); };
  if (sprite(c, key, x, y, rx, S)) {
    if (key === 'lamp' && night > 0.3) { c.fillStyle = `rgba(255,210,120,${0.18 * night})`; c.fillRect(rx(x - 12 * S), rx(y - 24 * S), rx(24 * S), rx(24 * S)); }
  } else switch (key) {
    case 'bed':
      r(-11, -6, 22, 6, P.ink); r(-10, -7, 20, 6, P.red); r(-8, -6, 16, 3, P.cream); r(-10, -2, 20, 1, P.redD);
      break;
    case 'coolmat':
      r(-11, -3, 22, 3, P.ink); r(-10, -3, 20, 2, P.blue); for (let i = -9; i < 10; i += 4) r(i, -3, 2, 2, P.white);
      break;
    case 'condo':
      r(-9, -2, 18, 2, P.woodD); r(-6, -30, 3, 28, P.sand); r(4, -30, 3, 28, P.sand);
      r(-10, -14, 20, 3, P.ink); r(-9, -15, 18, 2, P.cream); r(-8, -32, 16, 3, P.ink); r(-7, -33, 14, 2, P.cream);
      r(-4, -12, 8, 9, P.woodD); r(-3, -11, 6, 7, P.ink);
      break;
    case 'cage': {
      r(-9, -3, 18, 3, P.goldD); r(-8, -2, 16, 1, fill > 0 ? P.sand : P.gold);
      for (let i = -8; i <= 8; i += 3) r(i, -22, 1, 19, P.gold);
      r(-8, -23, 17, 1, P.goldD); r(-6, -25, 13, 2, P.goldD); r(-1, -27, 2, 2, P.goldD);
      r(-5, -12, 10, 1, P.woodD);
      break;
    }
    case 'litter':
      r(-9, -6, 18, 6, P.ink); r(-8, -6, 16, 5, P.blueD); r(-7, -6, 14, 2, P.sand);
      break;
    case 'peepad':
      r(-10, -2, 20, 2, P.blueD); r(-9, -2, 18, 1, P.white);
      break;
    case 'bowl':
      r(-6, -5, 12, 5, P.ink); r(-5, -5, 10, 4, P.red); r(-4, -6, 8, 1, P.wood);
      break;
    case 'ball': {
      const b = Math.abs(Math.sin(t * 2)) < 0.15 ? 1 : 0;
      r(-3, -6 - b, 6, 6, P.ink); r(-2, -6 - b, 4, 5, P.gold); r(-2, -4 - b, 4, 1, P.red);
      break;
    }
    case 'wand': {
      const sw = Math.round(Math.sin(t * 3) * 2);
      r(-1, -10, 1, 10, P.woodD); r(sw, -14, 1, 4, P.ink); r(sw - 1, -11, 3, 2, P.pink);
      break;
    }
    case 'perch':
      r(-6, -1, 12, 1, P.woodD); r(-1, -13, 2, 12, P.wood); r(-6, -13, 12, 2, P.wood); r(-6, -12, 12, 1, P.woodD);
      break;
    case 'plant':
      r(-4, -6, 8, 6, P.ink); r(-3, -6, 6, 5, P.red); r(-5, -14, 4, 8, P.green); r(1, -16, 4, 10, P.greenD); r(-2, -13, 3, 7, P.gold);
      break;
    case 'lamp':
      r(-1, -6, 2, 6, P.woodD); r(-4, -16, 8, 10, P.ink); r(-3, -15, 6, 8, night > 0.3 ? '#ffd27a' : P.cream); r(-2, -18, 4, 2, P.ink);
      if (night > 0.3) { c.fillStyle = `rgba(255,210,120,${0.18 * night})`; c.fillRect(rx(x - 12 * S), rx(y - 24 * S), rx(24 * S), rx(24 * S)); }
      break;
    case 'rug':
      r(-15, -2, 30, 2, P.redD); r(-14, -2, 28, 1, P.red); for (let i = -12; i < 14; i += 5) r(i, -2, 2, 1, P.gold);
      break;
  }
  // ห้องน้ำ/ถาด: บอกว่าเต็มแค่ไหน
  if (cap > 0 && fill > 0) {
    // อึในถาด/ขี้นกในกรง ใช้ภาพจริง วางกระจายบนผิวทราย (แถวหลังสูงกว่าเล็กน้อย)
    const tw = worldW(key, S), th = itemHeight(key, S), bird = key === 'cage', n = Math.min(fill, 6);
    const spots = [[-0.18, 0], [0.16, 1], [0.02, 0], [-0.3, 1], [0.3, 0], [-0.05, 1]];
    for (let i = 0; i < n; i++) {
      const [fx, back] = spots[i];
      const px = x + fx * tw * (bird ? 0.8 : 1), py = bird ? y - th * 0.07 : y - th * (0.32 + back * 0.14);
      if (!spriteW(c, bird ? 'dropping' : 'poop', px, py, rx, tw * (bird ? 0.17 : 0.2))) r(-7 + i * 3, bird ? -2 : -6, 2, 2, P.poop);
    }
    if (fill >= cap) { r(-1, -18, 2, 5, '#A32D2D'); r(-1, -12, 2, 2, '#A32D2D'); }
  }
}

export function drawPoop(c: CanvasRenderingContext2D, x: number, y: number, rx: (v: number) => number, small: boolean, t: number, age: number, S = 1.5) {
  const r: R = (dx, dy, w, h, col) => { c.fillStyle = col; c.fillRect(rx(x + dx * S), rx(y + dy * S), rx(w * S), rx(h * S)); };
  if (sprite(c, small ? 'dropping' : 'poop', x, y, rx, 1)) { /* ภาพจริง */ }
  else if (small) { r(-1, -2, 3, 2, P.white); r(0, -2, 1, 1, '#9a9a8c'); }
  else { r(-3, -2, 6, 2, P.poopD); r(-2, -3, 5, 2, P.poop); r(-1, -5, 3, 2, P.poop); r(0, -6, 1, 1, P.poopD); }
  // แมลงวันวนเมื่ออึค้างนาน
  if (age > 0.5) for (let i = 0; i < 2; i++) {
    const a = t * (3 + i) + i * 3;
    c.fillStyle = '#222';
    c.fillRect(rx(x + Math.cos(a) * 5 * S), rx(y + (-9 + Math.sin(a * 1.7) * 3) * S), rx(1), rx(1));
  }
}

/** รูปย่อในร้าน/คลัง */
export function itemThumb(cv: HTMLCanvasElement, key: string) {
  const H = Math.max(14, (ITEM_H[key] ?? 10) + 4), W = 36, k = 3;
  cv.width = W * k; cv.height = H * k;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.setTransform(k, 0, 0, k, 0, 0);
  const draw = () => {
    const h = itemHeight(key, 1), w = worldW(key, 1), fit = Math.min(1, (H - 2) / h, (W - 2) / w);
    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H - 1); c.scale(fit, fit);
    drawItem(c, key, 0, 0, v => v, 0, 0, 0, 0, 1);
    c.restore();
  };
  draw(); whenSheetReady(draw);
}
