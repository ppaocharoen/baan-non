// สัตว์เลี้ยงแต่ละตัว: ค่าต่างๆ · วัย · การเปลี่ยนแปลงตามเวลา
import { BALANCE as B } from './balance';
import { breedOf } from './content';

export type PetStatus = 'home' | 'away';

export interface Pet {
  id: number;
  breed: string;
  name: string;
  /** วันในเกมที่เกิด */
  born: number;
  /** อายุขัย (วัน) สุ่มไว้ตอนได้มา */
  lifespan: number;
  status: PetStatus;
  full: number;     // อิ่ม 0–1
  clean: number;    // สะอาด 0–1
  bond: number;     // ผูกพัน 0–1
  trained: number;  // ฝึก 0–1
  /** วันที่เริ่มป่วย (null = ไม่ป่วย) */
  sickSince: number | null;
  /** ตัวนับต่อเนื่อง (วัน) */
  hungryDays: number;
  dirtyDays: number;
  starveDays: number;
  /** ตัวคูณโอกาสป่วยจากอาหารมื้อล่าสุด */
  lastFoodSick: number;
  /** วันในเกม (ปัดลง) ที่ได้ผูกพันจากการให้อาหาร/อาบน้ำ/เล่นล่าสุด */
  fedBondDay: number;
  bathBondDay: number;
  playDay: number;
  playsToday: number;
  /** วันที่ฝึกล่าสุด (-1e9 = ยังไม่เคย · ไม่ใช้ -Infinity เพราะเซฟเป็น JSON ไม่ได้) */
  lastTrain: number;
}

export interface Grave { id: number; breed: string; name: string; ageDays: number; diedDay: number; cause: 'age' | 'neglect'; }

export const petAge = (p: Pet, day: number) => day - p.born;

/** 0 เด็ก · 1 โต · 2 แก่ */
export function petStage(p: Pet, day: number): 0 | 1 | 2 {
  const a = petAge(p, day), s = breedOf(p.breed).stages;
  return a < s[0] ? 0 : a < s[1] ? 1 : 2;
}

export const isHungry = (p: Pet) => p.full < B.hungryBelow;
export const isDirty = (p: Pet) => p.clean < B.dirtyBelow;
export const isSick = (p: Pet) => p.sickSince !== null;
/** อาการซึม: เตือนก่อนถึงจุดหนี/ตาย */
export const isWeak = (p: Pet) => p.starveDays > 0 || (p.sickSince !== null);

/** อารมณ์ 0–1 สำหรับเลือกท่าในฉากและคะแนนโพสต์ */
export function mood(p: Pet): number {
  if (p.status !== 'home') return 0;
  const base = 0.4 * p.full + 0.3 * p.clean + 0.3 * p.bond;
  return isSick(p) ? base * 0.4 : base;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** ค่าที่เปลี่ยนตามเวลา dt วัน (ไม่สุ่ม) — การสุ่มป่วยอยู่ใน core */
export function decayPet(p: Pet, dt: number) {
  if (p.status !== 'home') return;
  p.full = clamp01(p.full - B.fullDecay * dt);
  p.clean = clamp01(p.clean - B.cleanDecay * dt);

  p.hungryDays = isHungry(p) ? p.hungryDays + dt : 0;
  p.dirtyDays = isDirty(p) ? p.dirtyDays + dt : 0;
  p.starveDays = p.full <= 0 ? p.starveDays + dt : 0;

  let db = B.bondTogether;
  if (isHungry(p)) db += B.bondHungry;
  if (isDirty(p)) db += B.bondDirty;
  if (isSick(p)) db += B.bondSick;
  p.bond = clamp01(p.bond + db * dt);
}

/** อยู่ในช่วงเสี่ยงป่วยไหม */
export const atRisk = (p: Pet) =>
  p.status === 'home' && !isSick(p) && (p.hungryDays > B.riskAfterDays || p.dirtyDays > B.riskAfterDays);
