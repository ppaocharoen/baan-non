// สถานะเกมและคำสั่งทั้งหมด — ไม่แตะ DOM · หน้าจอและ sim เรียกไฟล์นี้เหมือนกัน
// ทุกคำสั่งคืนผลเป็น { ok, reason? } และเหตุการณ์ที่เกิดระหว่างเวลาเดินจะถูกส่งออกเป็นรายการ GameEvent
import { BALANCE as B, type Mode } from './balance';
import { breedOf, foodOf } from './content';
import { nextRandom } from './rng';
import { offlineDays, onlineDays } from './time';
import { careOf, diseaseOf, diseaseRisks, HEALTH, newHealth, vaccineOf, vaccineState, careState } from './health';
import { digest, floorMess, hasToy, HYGIENE, stepHome, useSupply, type HomeItem, type Poop, type PoopEvent } from './home';
import { newSocial, passiveIncome, type SocialState } from './social';
import { decayPet, isPostVax, isSick, petAge, petStage, type Grave, type Pet } from './pet';

export const SAVE_VERSION = 4;

export interface GameState {
  v: number;
  mode: Mode;
  /** สถานะสุ่มหลัก (mulberry32) */
  rng: number;
  /** วันในเกมทั้งหมดที่ผ่านไป (ทศนิยม = เวลาในวัน) */
  day: number;
  money: number;
  pets: Pet[];
  heaven: Grave[];
  nextId: number;
  /** ของในบ้าน (วางในฉากหรือเก็บในคลัง) */
  items: HomeItem[];
  /** ของสิ้นเปลือง: จำนวนครั้งที่ใช้ได้ */
  supplies: Record<string, number>;
  /** อึบนพื้น */
  poops: Poop[];
  nextUid: number;
  /** เพจบ้านน้อน */
  social: SocialState;
  /** เวลาจริง (ms) ที่เดินเวลาล่าสุด — ใช้คิดเวลาตอนปิดเกม */
  lastReal: number;
}

export type GameEvent =
  | { type: 'sick'; petId: number; disease: string }
  | { type: 'runaway'; petId: number }
  | { type: 'died'; petId: number; cause: 'age' | 'neglect' }
  | { type: 'stage'; petId: number; stage: 0 | 1 | 2 }
  | { type: 'newDay'; day: number }
  | PoopEvent;

export interface Result { ok: boolean; reason?: string; }
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

export function newGame(mode: Mode, seed: number, nowMs: number): GameState {
  return { v: SAVE_VERSION, mode, rng: seed >>> 0, day: B.startDay, money: B.startMoney, pets: [], heaven: [], nextId: 1, items: [], supplies: {}, poops: [], nextUid: 1, social: newSocial(), lastReal: nowMs };
}

export const petById = (g: GameState, id: number) => g.pets.find(p => p.id === id);

// ---------------- เวลาเดิน ----------------

/** เดินเวลา days วัน ทีละก้าวเล็กๆ แล้วคืนเหตุการณ์ที่เกิด · offline = ช่วงปิดเกม (ความหิว/สกปรกเพิ่มช้าลง) */
export function advance(g: GameState, days: number, offline = false): GameEvent[] {
  const needsMult = offline ? B.offlineNeedsMult : 1;
  const events: GameEvent[] = [];
  let left = days;
  while (left > 1e-9) {
    const dt = Math.min(B.stepDays, left);
    left -= dt;
    const before = g.day;
    g.day += dt;
    if (Math.floor(g.day) > Math.floor(before)) events.push({ type: 'newDay', day: Math.floor(g.day) });
    passiveIncome(g, dt); // รายได้โฆษณาจากโพสต์เก่าบนเพจ
    for (const p of [...g.pets]) stepPet(g, p, dt, needsMult, events);
  }
  return events;
}

function stepPet(g: GameState, p: Pet, dt: number, needsMult: number, events: GameEvent[]) {
  const stageBefore = petStage(p, g.day - dt);
  // หมดอายุขัย — ทั้งสองโหมด (อยู่บ้านป้าก็แก่ไปด้วย)
  if (petAge(p, g.day) >= p.lifespan) { bury(g, p, 'age'); events.push({ type: 'died', petId: p.id, cause: 'age' }); return; }
  const stageNow = petStage(p, g.day);
  if (stageNow !== stageBefore) events.push({ type: 'stage', petId: p.id, stage: stageNow });
  if (p.status !== 'home') return;

  const mess = floorMess(g);
  const cleanMult = (1 + HYGIENE.cleanMultPerPoop * mess) * (g.day < p.shampooUntil ? HYGIENE.shampooCleanMult : 1);
  decayPet(p, dt, needsMult, cleanMult, HYGIENE.bondPerPoop * mess);
  const pe = stepHome(g, p, dt, needsMult);
  if (pe) events.push(pe);

  // สุ่มป่วย: รวมโอกาสทุกโรค แล้วเลือกโรคตามน้ำหนัก (ตอนปิดเกมช้าลงเท่าความหิว)
  if (!isSick(p)) {
    const risks = diseaseRisks(p, g.day, p.lastFoodSick, mess);
    const total = risks.reduce((a, r) => a + r.perDay, 0);
    if (total > 0 && nextRandom(g) < total * dt * needsMult) {
      let pick = nextRandom(g) * total, chosen = risks[0].d;
      for (const r of risks) { pick -= r.perDay; if (pick <= 0) { chosen = r.d; break; } }
      p.health.disease = chosen.key;
      events.push({ type: 'sick', petId: p.id, disease: chosen.key });
    }
  }

  // ถูกละเลยนานมาก
  const sickLimit = p.health.disease ? diseaseOf(p.health.disease).limit : Infinity;
  const neglected = p.starveDays > B.starveLimit || p.sickDays > sickLimit;
  if (neglected) {
    if (B.modes[g.mode].neglect === 'die') { bury(g, p, 'neglect'); events.push({ type: 'died', petId: p.id, cause: 'neglect' }); }
    else { p.status = 'away'; events.push({ type: 'runaway', petId: p.id }); }
  }
}

function bury(g: GameState, p: Pet, cause: Grave['cause']) {
  g.pets = g.pets.filter(x => x !== p);
  g.heaven.push({ id: p.id, breed: p.breed, name: p.name, ageDays: petAge(p, g.day), diedDay: g.day, cause });
}

/** เปิดเกมอยู่ dt วินาที */
export const tickOnline = (g: GameState, seconds: number, nowMs: number) => { g.lastReal = nowMs; return advance(g, onlineDays(seconds)); };

/** กลับมาเปิดเกม: คิดเวลาที่ปิดไป (ช้าลงและมีเพดาน) */
export function catchUpOffline(g: GameState, nowMs: number): { days: number; events: GameEvent[] } {
  const days = offlineDays((nowMs - g.lastReal) / 1000);
  g.lastReal = nowMs;
  return { days, events: advance(g, days, true) };
}

// ---------------- คำสั่ง ----------------

export function adopt(g: GameState, breedKey: string, name: string, price = 0): Result & { pet?: Pet } {
  const br = breedOf(breedKey);
  if (g.pets.length >= B.maxPets) return fail('บ้านเต็มแล้ว');
  if (g.money < price) return fail('เงินไม่พอ');
  g.money -= price;
  const lifespan = br.life[0] + Math.floor(nextRandom(g) * (br.life[1] - br.life[0] + 1));
  const pet: Pet = {
    id: g.nextId++, breed: br.key, name, born: g.day, lifespan, status: 'home',
    full: 0.8, clean: 0.8, bond: 0.1, trained: 0, health: newHealth(), sickDays: 0,
    hungryDays: 0, dirtyDays: 0, starveDays: 0, lastFoodSick: 1,
    fedBondDay: -1, bathBondDay: -1, playDay: -1, playsToday: 0, lastTrain: -1e9, poopIn: -1, shampooUntil: -1,
  };
  g.pets.push(pet);
  return { ...OK, pet };
}

const atHome = (g: GameState, id: number): Pet | Result => {
  const p = petById(g, id);
  if (!p) return fail('ไม่พบสัตว์ตัวนี้');
  if (p.status !== 'home') return fail('น้องไม่อยู่บ้าน');
  return p;
};
const isPet = (x: Pet | Result): x is Pet => 'breed' in x;
const today = (g: GameState) => Math.floor(g.day);
const addBond = (p: Pet, v: number) => { p.bond = Math.min(1, Math.max(0, p.bond + v)); };

export function feed(g: GameState, id: number, foodKey: string): Result {
  const p = atHome(g, id); if (!isPet(p)) return p;
  const f = foodOf(foodKey);
  if (g.money < f.price) return fail('เงินไม่พอ');
  g.money -= f.price;
  p.full = 1;
  p.starveDays = 0;
  p.lastFoodSick = f.sickMult;
  digest(g, p);
  if (p.fedBondDay !== today(g)) { p.fedBondDay = today(g); addBond(p, B.bondFeed * f.bondMult); }
  return OK;
}

export function bathe(g: GameState, id: number): Result & { fever?: boolean; shampoo?: boolean } {
  const p = atHome(g, id); if (!isPet(p)) return p;
  p.clean = 1;
  const shampoo = useSupply(g, 'shampoo');
  if (shampoo) p.shampooUntil = g.day + HYGIENE.shampooDays;
  if (p.bathBondDay !== today(g)) { p.bathBondDay = today(g); addBond(p, B.bondBathe); }
  // เพิ่งฉีดวัคซีนแล้วอาบน้ำ เสี่ยงเป็นไข้
  if (isPostVax(p, g.day) && !isSick(p) && nextRandom(g) < HEALTH.postVaxBathFever) {
    p.health.disease = 'fever';
    return { ...OK, fever: true, shampoo };
  }
  return { ...OK, shampoo };
}

export function play(g: GameState, id: number): Result {
  const p = atHome(g, id); if (!isPet(p)) return p;
  if (p.playDay !== today(g)) { p.playDay = today(g); p.playsToday = 0; }
  if (p.playsToday >= B.playsPerDay) return fail('วันนี้น้องเล่นจนเหนื่อยแล้ว');
  p.playsToday++;
  addBond(p, B.bondPlay * (hasToy(g, p) ? HYGIENE.toyPlayMult : 1));
  return OK;
}

export const canTrain = (g: GameState, p: Pet) => p.status === 'home' && !isSick(p) && g.day - p.lastTrain >= B.trainCooldown;
export const daysUntilTrain = (g: GameState, p: Pet) => Math.max(0, B.trainCooldown - (g.day - p.lastTrain));

/** ส่งผลมินิเกมฝึก: แตะโดน hits ครั้งจาก trainTaps */
export function train(g: GameState, id: number, hits: number): Result & { treat?: boolean } {
  const p = atHome(g, id); if (!isPet(p)) return p;
  if (isSick(p)) return fail('น้องป่วยอยู่ ฝึกไม่ได้');
  if (!canTrain(g, p)) return fail('ยังไม่ถึงรอบฝึก');
  const h = Math.max(0, Math.min(B.trainTaps, Math.round(hits)));
  p.lastTrain = g.day;
  const treat = h > 0 && useSupply(g, 'treat');
  p.trained = Math.min(1, p.trained + B.trainGain * (h / B.trainTaps) * (treat ? HYGIENE.treatMult : 1));
  return { ...OK, treat };
}

/** รักษาที่คลินิก: สัตวแพทย์วินิจฉัยแล้วจ่ายยาตรงโรค */
export function treat(g: GameState, id: number): Result {
  const p = atHome(g, id); if (!isPet(p)) return p;
  if (!p.health.disease) return fail('น้องไม่ได้ป่วย');
  const d = diseaseOf(p.health.disease);
  if (g.money < d.price) return fail('เงินไม่พอ');
  g.money -= d.price;
  p.health.disease = null;
  p.sickDays = 0;
  return OK;
}

/** ฉีดวัคซีน (เข็มถัดไปในชุด หรือเข็มกระตุ้น) */
export function vaccinate(g: GameState, id: number, key: string): Result {
  const p = atHome(g, id); if (!isPet(p)) return p;
  const v = vaccineOf(key);
  if (!v || v.species !== breedOf(p.breed).species) return fail('วัคซีนนี้ไม่ใช่ของน้อง');
  if (isSick(p)) return fail('น้องป่วยอยู่ รักษาให้หายก่อนค่อยฉีด');
  const st = vaccineState(p, v, g.day);
  if (st.s === 'notyet') return fail(`ยังเด็กเกินไป อีก ${Math.ceil(st.inDays)} วัน`);
  if (st.s === 'series' || st.s === 'ok') return fail(`ยังไม่ถึงกำหนด อีก ${Math.ceil(st.inDays)} วัน`);
  if (g.money < v.price) return fail('เงินไม่พอ');
  g.money -= v.price;
  const r = p.health.vax[key] ?? { doses: 0, last: 0 };
  p.health.vax[key] = { doses: Math.min(v.series, r.doses + 1), last: g.day };
  p.health.postVaxUntil = g.day + HEALTH.postVaxDays;
  return OK;
}

/** ดูแลประจำ: ถ่ายพยาธิ ป้องกันเห็บหมัด วิตามิน */
export function routineCare(g: GameState, id: number, key: string): Result {
  const p = atHome(g, id); if (!isPet(p)) return p;
  const c = careOf(key);
  if (!c || c.species !== breedOf(p.breed).species) return fail('รายการนี้ไม่ใช่ของน้อง');
  const st = careState(p, c, g.day);
  if (st.s === 'ok') return fail(`ยังไม่ถึงกำหนด อีก ${Math.ceil(st.inDays)} วัน`);
  if (g.money < c.price) return fail('เงินไม่พอ');
  g.money -= c.price;
  p.health.care[key] = g.day;
  return OK;
}

/** ง้อน้องกลับจากบ้านป้า */
export function coax(g: GameState, id: number): Result {
  const p = petById(g, id);
  if (!p) return fail('ไม่พบสัตว์ตัวนี้');
  if (p.status !== 'away') return fail('น้องอยู่บ้านอยู่แล้ว');
  if (g.money < B.coaxCost) return fail('เงินไม่พอ');
  g.money -= B.coaxCost;
  Object.assign(p, {
    status: 'home', bond: p.bond * B.coaxBondMult, full: B.coaxFull, clean: B.coaxClean,
    sickDays: 0, hungryDays: 0, dirtyDays: 0, starveDays: 0,
  });
  p.health.disease = null;
  return OK;
}
