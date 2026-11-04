// บ้าน: ของที่ซื้อจากร้านแล้ววางในฉาก · ของสิ้นเปลือง · การขับถ่าย
// ตำแหน่งของ (x) อยู่ในพิกัดโลกของฉาก (กว้าง ~250 พิกเซลเกม) — เครื่องยนต์เก็บไว้เพื่อให้เซฟ/โหลดแล้ววางที่เดิม
import shopJson from '../../data/shop.json';
import { breedOf, type Species } from './content';
import type { GameState, Result } from './core';
import { nextRandom } from './rng';
import { nightness } from './time';
import { petStage, type Pet } from './pet';

export type ItemKind = 'bed' | 'toilet' | 'bowl' | 'toy' | 'decor';
export interface Furniture {
  key: string; name: string; kind: ItemKind; species: Species[]; price: number; desc: string;
  /** ความกว้างโดยประมาณ (พิกเซลเกม) */
  w: number;
  /** ที่นอนรับได้กี่ตัว (ค่าเริ่ม 1) */
  slots?: number;
  /** ที่นอนที่เป็นของเล่นด้วย (คอนโดแมว) */
  toy?: boolean;
  /** ห้องน้ำ: จุได้กี่ครั้ง · ของที่ใช้ตอนเททิ้ง */
  cap?: number; supply?: string;
  /** ที่นอนที่มีถาดรองขี้ในตัว (กรงนก): จุได้กี่ครั้ง */
  toilet?: number;
}
export interface Supply { key: string; name: string; price: number; uses: number; desc: string; }
export const SHOP = shopJson as { furniture: Furniture[]; supplies: Supply[] };
export const furnitureOf = (k: string) => SHOP.furniture.find(f => f.key === k)!;
export const supplyOf = (k: string) => SHOP.supplies.find(s => s.key === k)!;

export interface HomeItem { uid: number; key: string; /** null = เก็บอยู่ในคลัง */ x: number | null; lane: 0 | 1; fill: number; }
export interface Poop { id: number; x: number; day: number; petId: number; small: boolean; }

export const FLOOR: [number, number] = [20, 230];
export const POOP_CAP = 4;            // อึบนพื้นสะสมได้สูงสุด (กันกลับมาเจอบ้านพัง)
export const HYGIENE = {
  cleanMultPerPoop: 0.2,              // ความสกปรกเพิ่มเร็วขึ้นต่ออึ 1 กอง
  bondPerPoop: -0.002,                // ผูกพันลดต่อวัน ต่ออึ 1 กอง
  riskPerPoop: 0.04,                  // โอกาสโรคผิวหนัง/ท้องเสียเพิ่ม ต่ออึที่เกิน 1 กอง
  bedBond: 0.004,                     // ผูกพันเพิ่มต่อวัน ตอนนอนบนที่นอน (กลางคืน)
  toyPlayMult: 1.5,
  shampooDays: 7, shampooCleanMult: 0.6,
  treatMult: 1.3,
};

const speciesOf = (p: Pet) => breedOf(p.breed).species;
export const fits = (f: Furniture, p: Pet) => f.species.includes(speciesOf(p));
export const placed = (g: GameState) => g.items.filter(i => i.x !== null);
/** จำนวนอึบนพื้น (นกนับครึ่ง) */
export const floorMess = (g: GameState) => g.poops.reduce((a, p) => a + (p.small ? 0.5 : 1), 0);

/** จับคู่น้องกับที่นอน (ตัวแรกในรายการได้ก่อน) */
export function assignBeds(g: GameState): Map<number, HomeItem> {
  const out = new Map<number, HomeItem>(), used = new Map<number, number>();
  for (const p of g.pets) {
    if (p.status !== 'home') continue;
    const bed = placed(g).find(i => {
      const f = furnitureOf(i.key);
      return f.kind === 'bed' && fits(f, p) && (used.get(i.uid) ?? 0) < (f.slots ?? 1);
    });
    if (bed) { out.set(p.id, bed); used.set(bed.uid, (used.get(bed.uid) ?? 0) + 1); }
  }
  return out;
}

/** ห้องน้ำที่น้องใช้ได้ตอนนี้ (ยังไม่เต็ม) */
export function toiletFor(g: GameState, p: Pet): HomeItem | undefined {
  return placed(g).find(i => {
    const f = furnitureOf(i.key), cap = f.kind === 'toilet' ? f.cap : f.toilet;
    return cap !== undefined && fits(f, p) && i.fill < cap;
  });
}
export const hasToy = (g: GameState, p: Pet) => placed(g).some(i => { const f = furnitureOf(i.key); return (f.kind === 'toy' || f.toy) && fits(f, p); });
export const toiletCap = (f: Furniture) => (f.kind === 'toilet' ? f.cap : f.toilet) ?? 0;

// ---------------- เวลาเดิน ----------------

export type PoopEvent = { type: 'poop'; petId: number; x: number; toilet: number | null };

/** ตั้งเวลาขับถ่ายหลังกิน (ถ้ายังไม่มีค้าง) */
export function digest(g: GameState, p: Pet) {
  if (p.poopIn >= 0) return;
  const bird = speciesOf(p) === 'bird';
  p.poopIn = (bird ? 0.3 : 0.5) + nextRandom(g) * (bird ? 0.3 : 0.6);
}

export function stepHome(g: GameState, p: Pet, dt: number, needsMult: number): PoopEvent | null {
  // นอนบนที่นอนตอนกลางคืน
  if (nightness(g.day) > 0.6 && assignBeds(g).has(p.id)) p.bond = Math.min(1, p.bond + HYGIENE.bedBond * dt * needsMult);
  if (p.poopIn < 0) return null;
  p.poopIn -= dt * needsMult;
  if (p.poopIn > 0) return null;
  p.poopIn = -1;
  const t = toiletFor(g, p), stage = petStage(p, g.day);
  const useChance = (stage === 0 ? 0.5 : 0.8) + (stage === 0 ? 0.5 : 0.2) * p.trained;
  if (t && nextRandom(g) < useChance) { t.fill++; return { type: 'poop', petId: p.id, x: t.x!, toilet: t.uid }; }
  if (floorMess(g) >= POOP_CAP) return null;
  const x = FLOOR[0] + nextRandom(g) * (FLOOR[1] - FLOOR[0]);
  g.poops.push({ id: g.nextUid++, x, day: g.day, petId: p.id, small: speciesOf(p) === 'bird' });
  return { type: 'poop', petId: p.id, x, toilet: null };
}

// ---------------- คำสั่ง ----------------
const fail = (reason: string): Result => ({ ok: false, reason });

export function buyFurniture(g: GameState, key: string): Result & { item?: HomeItem } {
  const f = furnitureOf(key);
  if (!f) return fail('ไม่มีของนี้');
  if (g.money < f.price) return fail('เงินไม่พอ');
  g.money -= f.price;
  const item: HomeItem = { uid: g.nextUid++, key, x: null, lane: 0, fill: 0 };
  g.items.push(item);
  return { ok: true, item };
}
export function buySupply(g: GameState, key: string): Result {
  const s = supplyOf(key);
  if (!s) return fail('ไม่มีของนี้');
  if (g.money < s.price) return fail('เงินไม่พอ');
  g.money -= s.price;
  g.supplies[key] = (g.supplies[key] ?? 0) + s.uses;
  return { ok: true };
}
export function placeItem(g: GameState, uid: number, x: number, lane: 0 | 1 = 0): Result {
  const it = g.items.find(i => i.uid === uid);
  if (!it) return fail('ไม่พบของ');
  it.x = Math.max(FLOOR[0], Math.min(FLOOR[1], x)); it.lane = lane;
  return { ok: true };
}
export function storeItem(g: GameState, uid: number): Result {
  const it = g.items.find(i => i.uid === uid);
  if (!it) return fail('ไม่พบของ');
  it.x = null;
  return { ok: true };
}
/** เททิ้ง/เปลี่ยนแผ่น — ใช้ของสิ้นเปลือง 1 ครั้ง (ถาดกรงนกไม่ต้องใช้) */
export function emptyToilet(g: GameState, uid: number): Result {
  const it = g.items.find(i => i.uid === uid);
  if (!it) return fail('ไม่พบของ');
  if (it.fill <= 0) return fail('ยังสะอาดอยู่');
  const f = furnitureOf(it.key);
  if (f.supply) {
    if ((g.supplies[f.supply] ?? 0) <= 0) return fail(`${supplyOf(f.supply).name}หมด ซื้อเพิ่มที่ร้าน`);
    g.supplies[f.supply]--;
  }
  it.fill = 0;
  return { ok: true };
}
export function cleanPoop(g: GameState, id: number): Result {
  const n = g.poops.length;
  g.poops = g.poops.filter(p => p.id !== id);
  return n === g.poops.length ? fail('ไม่พบ') : { ok: true };
}
export function useSupply(g: GameState, key: string): boolean {
  if ((g.supplies[key] ?? 0) <= 0) return false;
  g.supplies[key]--;
  return true;
}
