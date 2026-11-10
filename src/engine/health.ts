// สุขภาพ: สมุดวัคซีน · ดูแลประจำ (ถ่ายพยาธิ ฯลฯ) · โรคตามชนิดสัตว์
import healthJson from '../../data/health.json';
import { BALANCE as B } from './balance';
import { breedOf, type Species } from './content';
import type { Pet } from './pet';

export interface Vaccine { key: string; name: string; species: Species; covers: string; minAge: number; series: number; gap: number; booster: number; price: number; }
export interface Care { key: string; name: string; species: Species; every: number; price: number; /** ตอนเด็กถี่กว่า (เช่น ถ่ายพยาธิลูกสัตว์ทุก 2 สัปดาห์) จนถึงอายุ youngUntil */ youngEvery?: number; youngUntil?: number; }
export type Cause = 'vaccine' | 'care' | 'hungry' | 'dirty' | 'postvax';
export interface Disease {
  key: string; name: string; species: Species | 'any'; symptom: string; cause: Cause;
  /** วัคซีน/การดูแลที่ป้องกันโรคนี้ (cause = vaccine/care) */
  by?: string;
  /** โอกาสป่วยต่อวัน เมื่อไม่มีการป้องกัน */
  base: number;
  youngMult?: number;
  /** ป่วยไม่รักษาเกินกี่วัน → หนี/ตาย */
  limit: number;
  med: string; price: number;
}

export const HEALTH = healthJson as {
  note: string; yearDays: number; maternalDays: number; dueEarly: number; grace: number; postVaxDays: number; postVaxBathFever: number; recoverDays: number;
  vaccines: Vaccine[]; care: Care[]; diseases: Disease[];
};

export interface HealthState {
  /** วัคซีน: จำนวนเข็มที่ได้ และเวลาที่ฉีดล่าสุด (ตามนาฬิกาดูแล careClock) */
  vax: Record<string, { doses: number; last: number }>;
  /** ดูแลประจำ: เวลาที่ทำล่าสุด (ตามนาฬิกาดูแล careClock) */
  care: Record<string, number>;
  /** โรคที่เป็นอยู่ (null = ไม่ป่วย) */
  disease: string | null;
  postVaxUntil: number;
  /** เพิ่งหายป่วย: ร่างกายมีภูมิ ไม่ป่วยซ้ำจนถึงเวลานี้ (ตามนาฬิกาดูแล careClock) */
  immuneUntil?: number;
}
export const newHealth = (): HealthState => ({ vax: {}, care: {}, disease: null, postVaxUntil: -1 });

const speciesOf = (p: Pet) => breedOf(p.breed).species;
export const vaccinesFor = (p: Pet) => HEALTH.vaccines.filter(v => v.species === speciesOf(p));
export const careFor = (p: Pet) => HEALTH.care.filter(c => c.species === speciesOf(p));
export const diseaseOf = (k: string): Disease => {
  const d = HEALTH.diseases.find(x => x.key === k);
  if (!d) throw new Error(`ไม่รู้จักโรค ${k}`);
  return d;
};
export const vaccineOf = (k: string) => HEALTH.vaccines.find(x => x.key === k)!;
export const careOf = (k: string) => HEALTH.care.find(x => x.key === k)!;

// ---------------- สถานะ ----------------

export type ItemState =
  | { s: 'notyet'; inDays: number }            // ยังเด็กเกิน
  | { s: 'series'; dose: number; inDays: number } // อยู่ระหว่างชุดแรก รอเข็มถัดไป
  | { s: 'ok'; inDays: number }                 // ครบแล้ว อีก n วันถึงกำหนด
  | { s: 'due'; dose?: number }                 // ถึงกำหนด/ทำได้แล้ว
  | { s: 'overdue'; dose?: number };            // เลยกำหนด ไม่คุ้มกันแล้ว

const EPS = 1e-6; // กันทศนิยมสะสมจากการเดินเวลาทีละก้าว

export function vaccineState(p: Pet, v: Vaccine, day: number): ItemState {
  const age = day - p.born + EPS, r = p.health.vax[v.key];
  if (!r || r.doses === 0) return age < v.minAge ? { s: 'notyet', inDays: v.minAge - age } : { s: age > HEALTH.maternalDays ? 'overdue' : 'due', dose: 1 };
  if (r.doses < v.series) {
    const wait = r.last + v.gap - p.careClock - EPS;
    return wait > 0 ? { s: 'series', dose: r.doses + 1, inDays: wait } : { s: wait < -HEALTH.grace ? 'overdue' : 'due', dose: r.doses + 1 };
  }
  const next = r.last + v.booster - p.careClock - EPS;
  if (next > HEALTH.dueEarly) return { s: 'ok', inDays: next };
  return { s: next < -HEALTH.grace ? 'overdue' : 'due' };
}

/** รอบการดูแลตอนนี้ (ลูกสัตว์ถี่กว่า) */
export const careEvery = (p: Pet, c: Care, day: number) => (c.youngEvery && c.youngUntil && day - p.born < c.youngUntil ? c.youngEvery : c.every);
export function careState(p: Pet, c: Care, day: number): ItemState {
  const last = p.health.care[c.key];
  if (last === undefined) return { s: day - p.born > HEALTH.maternalDays ? 'overdue' : 'due' };
  const next = last + careEvery(p, c, day) - p.careClock - EPS;
  if (next > HEALTH.dueEarly) return { s: 'ok', inDays: next };
  return { s: next < -HEALTH.grace ? 'overdue' : 'due' };
}

const isDue = (st: ItemState) => st.s === 'due' || st.s === 'overdue';
/** รายการที่ทำได้ตอนนี้ที่คลินิก */
export function dueItems(p: Pet, day: number) {
  return {
    vax: vaccinesFor(p).filter(v => isDue(vaccineState(p, v, day))),
    care: careFor(p).filter(c => isDue(careState(p, c, day))),
  };
}

/** วัคซีนคุ้มกันอยู่แค่ไหน 0–1 */
function vaxProtection(p: Pet, key: string, day: number): number {
  if (day - p.born < HEALTH.maternalDays) return 1; // ภูมิจากแม่
  const v = vaccineOf(key), r = p.health.vax[key];
  if (!r || r.doses === 0) return 0;
  if (r.doses < v.series) return r.doses >= 2 ? 1 : 0.8; // ระหว่างชุดแรก: เข็ม 2 ขึ้นไปถือว่าคุ้มกันแล้วในเกม
  return p.careClock - r.last <= v.booster + HEALTH.grace ? 1 : 0;
}
function careOk(p: Pet, key: string, day: number): boolean {
  if (day - p.born < HEALTH.maternalDays) return true;
  const last = p.health.care[key];
  return last !== undefined && p.careClock - last <= careEvery(p, careOf(key), day) + HEALTH.grace;
}

/** โอกาสเป็นแต่ละโรคต่อวัน ตอนนี้ */
export function diseaseRisks(p: Pet, day: number, foodSickMult: number, floorMess = 0): { d: Disease; perDay: number }[] {
  if (p.careClock < (p.health.immuneUntil ?? -1)) return []; // เพิ่งหายป่วย ยังมีภูมิ
  const messRisk = Math.max(0, floorMess - 1) * 0.04; // อึบนพื้นเกิน 1 กอง
  const sp = speciesOf(p), young = day - p.born < breedOf(p.breed).stages[0];
  const out: { d: Disease; perDay: number }[] = [];
  for (const d of HEALTH.diseases) {
    if (d.species !== 'any' && d.species !== sp) continue;
    let r = 0;
    if (d.cause === 'vaccine') r = d.base * (1 - vaxProtection(p, d.by!, day));
    else if (d.cause === 'care') r = careOk(p, d.by!, day) ? 0 : d.base;
    else if (d.cause === 'hungry') r = (p.hungryDays > B.riskAfterDays ? d.base * foodSickMult : 0) + messRisk;
    else if (d.cause === 'dirty') r = (p.dirtyDays > B.riskAfterDays ? d.base : 0) + messRisk;
    if (young && d.youngMult) r *= d.youngMult;
    if (r > 0) out.push({ d, perDay: r });
  }
  return out;
}
