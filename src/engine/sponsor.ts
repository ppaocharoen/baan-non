// สปอนเซอร์ของเพจ: เพจโตถึงเกณฑ์ → แบรนด์ส่งข้อเสนอ → รับงาน (ได้เงินมัดจำ + ของ) → โพสต์รูปตามโจทย์ให้ครบก่อนกำหนด
// ทำสำเร็จได้เงินส่วนที่เหลือ แบรนด์ประทับใจ (ค่าตอบแทนครั้งหน้าเพิ่ม) · ไม่ทันเสียผู้ติดตามเล็กน้อยและพักข้อเสนอ
// โพสต์สปอนเซอร์ถี่เกินไป คนดูเบื่อ ยอดวิวลด
import sponsorsJson from '../../data/sponsors.json';
import type { GameState } from './core';
import { breedOf } from './content';
import { dueItems } from './health';
import { furnitureOf, placed, toiletCap, toyOf } from './home';
import { isSick } from './pet';
import { nextRandom } from './rng';

/** โจทย์รูป: ตรงกับป้ายรูป (tags) ที่ติดตอนถ่าย */
export type Quest = 'eat' | 'play' | 'bath' | 'high' | 'two' | 'sleep' | 'clean' | 'healthy' | 'any';
export interface SponsorDef {
  key: string; brand: string; color: string; tier: number; species?: string[]; quest: Quest;
  need: number; minTier: number; /** เวลาส่งงาน ชั่วโมงจริง */ hours: number; minPets?: number; pitch: string;
  gift?: { meal?: string; supply?: string; item?: string; toy?: string; n?: number };
}
export const SPONSORS = sponsorsJson as SponsorDef[];
export const sponsorDef = (k: string) => SPONSORS.find(s => s.key === k)!;

// เวลาของสปอนเซอร์นับเป็นเวลาจริง (ms) ไม่ใช่วันในเกม — วันในเกมเดินเร็ว (เปิดเกม 5 นาที = 1 วัน)
// ถ้านับเป็นวันในเกม งานจะหมดเวลาระหว่างที่ปิดเกมไปนอน
export interface Deal {
  key: string;
  pay: number;          // ค่าตอบแทนทั้งหมด
  upfront: number;      // ส่วนที่ได้ตอนรับงาน
  expiresAt: number;    // ข้อเสนอหมดอายุ (ถ้ายังไม่ตอบ)
  /** รหัสรูปแรกที่ใช้ส่งงานได้ (รูปที่ถ่ายก่อนรับงานใช้ไม่ได้) */
  fromUid: number | null;
  deadlineAt: number | null;
  done: number;
}
export interface SponsorState {
  offer: Deal | null;
  active: Deal | null;
  /** เวลาจริงที่ข้อเสนอถัดไปจะมา */
  nextOfferAt: number;
  /** จำนวนงานที่ทำสำเร็จ (ความเชื่อใจของแบรนด์) */
  rep: number;
  failed: number;
  /** เวลาจริงที่โพสต์งานสปอนเซอร์ (ใช้คิดว่าขายของถี่ไปไหม) */
  postTimes: number[];
  /** รายได้จากสปอนเซอร์รวม */
  earned: number;
}
export const newSponsor = (): SponsorState => ({ offer: null, active: null, nextOfferAt: 0, rep: 0, failed: 0, postTimes: [], earned: 0 });

export const SPONSOR = {
  /** ผู้ติดตามขั้นต่ำของแต่ละขั้นแบรนด์ */
  tierFans: [300, 1000, 3000, 8000],
  /** ค่าตอบแทนพื้นฐานต่อขั้น (≈ รายได้จากโพสต์ราว 1 วันจริงของเพจขนาดนั้น) */
  tierPay: [130, 250, 420, 700],
  upfrontShare: 0.3,
  /** ทำสำเร็จแต่ละครั้ง แบรนด์ให้เพิ่ม 8% (สูงสุด 5 ครั้ง) */
  repBonus: 0.08, repMax: 5,
  // หน่วยชั่วโมงจริง
  offerGapH: [16, 30],  // ระหว่างข้อเสนอ (≈ วันละครั้ง)
  offerLifeH: 12,       // ไม่ตอบภายในกี่ชั่วโมง ข้อเสนอหมดอายุ
  failFans: 0.05,       // ทำไม่ทัน เสียผู้ติดตาม 5%
  failPauseH: 24,       // และไม่มีข้อเสนอใหม่
  declinePauseH: 4,
  /** โพสต์สปอนเซอร์ ≥ 2 ครั้งใน 12 ชม.ล่าสุด → โพสต์สปอนเซอร์ถัดไปยอดวิว ×0.75 */
  spamWindowH: 12, spamCount: 2, spamMult: 0.75,
};

export const QUEST_TH: Record<Quest, string> = {
  eat: 'น้องกินข้าว', play: 'น้องเล่นหรือฝึก', bath: 'น้องหลังอาบน้ำ', high: 'น้องบนที่สูง', two: 'น้องสองตัวอยู่ด้วยกัน',
  sleep: 'น้องนอนหลับ', clean: 'บ้านสะอาด', healthy: 'น้องแข็งแรงครบวัคซีน', any: 'รูปอะไรก็ได้',
};

/** ป้ายของรูปตอนถ่าย: ชนิดจังหวะ + สภาพบ้านขณะนั้น */
export function photoTags(g: GameState, kind: string, petIds: number[]): string[] {
  const tags = kind ? [kind] : [];
  const toilets = placed(g).filter(i => toiletCap(furnitureOf(i.key)) > 0 && furnitureOf(i.key).kind === 'toilet');
  if (g.poops.length === 0 && toilets.every(i => i.fill === 0)) tags.push('clean');
  const home = g.pets.filter(p => p.status === 'home');
  if (home.length && home.every(p => !isSick(p) && (() => { const d = dueItems(p, g.day); return !d.vax.length && !d.care.length; })())) tags.push('healthy');
  if (petIds.length >= 2) tags.push('two');
  return tags;
}

const speciesHome = (g: GameState) => new Set(g.pets.filter(p => p.status === 'home').map(p => breedOf(p.breed).species as string));
export const tierFor = (followers: number) => SPONSOR.tierFans.reduce((t, f, i) => (followers >= f ? i : t), -1);

/** เรียกทุกก้าวเวลา: ออกข้อเสนอใหม่ · ข้อเสนอหมดอายุ · งานเลยกำหนด */
const HR = 3600_000;
export function stepSponsor(g: GameState): SponsorEvent | null {
  const s = g.social.sponsor, now = g.lastReal;
  if (s.active && s.active.deadlineAt !== null && now > s.active.deadlineAt) {
    const lost = Math.round(g.social.followers * SPONSOR.failFans);
    g.social.followers -= lost;
    const key = s.active.key;
    s.active = null; s.failed++;
    s.nextOfferAt = now + SPONSOR.failPauseH * HR;
    return { type: 'sponsorFail', key, lost };
  }
  if (s.offer && now > s.offer.expiresAt) { s.offer = null; s.nextOfferAt = now + SPONSOR.declinePauseH * HR; }
  if (!s.offer && !s.active && now >= s.nextOfferAt) {
    const tier = tierFor(g.social.followers);
    if (tier < 0) return null;
    const sp = speciesHome(g), pets = g.pets.filter(p => p.status === 'home').length;
    // ขั้นปัจจุบันเป็นหลัก ปนขั้นต่ำกว่าบ้าง
    const pool = SPONSORS.filter(d => d.tier <= tier && d.tier >= tier - 1
      && (!d.species || d.species.some(x => sp.has(x))) && pets >= (d.minPets ?? 1));
    if (!pool.length) return null;
    const def = pool[Math.floor(nextRandom(g) * pool.length)];
    const pay = Math.round(SPONSOR.tierPay[def.tier] * (0.9 + nextRandom(g) * 0.2) * (1 + SPONSOR.repBonus * Math.min(s.rep, SPONSOR.repMax)) / 5) * 5;
    s.offer = { key: def.key, pay, upfront: Math.round(pay * SPONSOR.upfrontShare), expiresAt: now + SPONSOR.offerLifeH * HR, fromUid: null, deadlineAt: null, done: 0 };
    s.nextOfferAt = now + (SPONSOR.offerGapH[0] + nextRandom(g) * (SPONSOR.offerGapH[1] - SPONSOR.offerGapH[0])) * HR;
    return { type: 'sponsorOffer', key: def.key };
  }
  return null;
}
export type SponsorEvent =
  | { type: 'sponsorOffer'; key: string }
  | { type: 'sponsorFail'; key: string; lost: number };

/** รับงาน: ได้เงินมัดจำ + ของ */
export function acceptOffer(g: GameState): { ok: boolean; reason?: string; gift?: string } {
  const s = g.social.sponsor, d = s.offer;
  if (!d) return { ok: false, reason: 'ไม่มีข้อเสนอ' };
  if (s.active) return { ok: false, reason: 'มีงานค้างอยู่ ทำให้เสร็จก่อน' };
  const def = sponsorDef(d.key);
  d.fromUid = g.nextUid; d.deadlineAt = g.lastReal + def.hours * HR;
  s.active = d; s.offer = null;
  g.money += d.upfront; g.social.earned += d.upfront; s.earned += d.upfront;
  return { ok: true, gift: giveGift(g, def) };
}
export function declineOffer(g: GameState) {
  const s = g.social.sponsor;
  if (!s.offer) return;
  s.offer = null; s.nextOfferAt = g.lastReal + SPONSOR.declinePauseH * HR;
}

/** ข้อความของที่ได้ (และใส่ของเข้าบ้าน) */
function giveGift(g: GameState, def: SponsorDef): string | undefined {
  const gf = def.gift; if (!gf) return undefined;
  if (gf.meal) { g.supplies[`meal_${gf.meal}`] = (g.supplies[`meal_${gf.meal}`] ?? 0) + (gf.n ?? 1); return `อาหารพรีเมียมฟรี ${gf.n} มื้อ`; }
  if (gf.supply) { g.supplies[gf.supply] = (g.supplies[gf.supply] ?? 0) + (gf.n ?? 1); return `${giftName(gf.supply)} ${gf.n} ครั้ง`; }
  if (gf.item) { g.items.push({ uid: g.nextUid++, key: gf.item, x: null, lane: 0, fill: 0, room: 'terrace' }); return `${furnitureOf(gf.item).name} (อยู่ในคลัง)`; }
  if (gf.toy) { const t = toyOf(gf.toy); g.toys.push({ uid: g.nextUid++, key: t.key, left: t.uses }); return `${t.name} (อยู่ในกล่องของเล่น)`; }
  return undefined;
}
const giftName = (k: string) => ({ sand: 'ทรายแมว', pad: 'แผ่นรองฉี่', shampoo: 'แชมพู', treat: 'ขนมฝึก' } as Record<string, string>)[k] ?? k;
export const giftText = (def: SponsorDef) => {
  const gf = def.gift; if (!gf) return '';
  if (gf.meal) return `อาหารพรีเมียมฟรี ${gf.n} มื้อ`;
  if (gf.supply) return `${giftName(gf.supply)} ${gf.n} ครั้ง`;
  if (gf.item) return furnitureOf(gf.item).name;
  if (gf.toy) return toyOf(gf.toy).name;
  return '';
};

/** รูปนี้ตรงโจทย์งานที่รับอยู่ไหม */
export function photoFits(g: GameState, ph: { id: number; tier: number; tags?: string[]; posted: boolean }): boolean {
  const d = g.social.sponsor.active;
  if (!d || ph.posted || d.fromUid === null) return false;
  const def = sponsorDef(d.key);
  if (ph.tier < def.minTier || ph.id < d.fromUid) return false;
  return def.quest === 'any' || (ph.tags ?? []).includes(def.quest);
}

/** โพสต์รูปที่ตรงโจทย์: นับความคืบหน้า คืนตัวคูณยอดวิวและผลงาน */
export function onSponsoredPost(g: GameState): { viewMult: number; spam: boolean; finished: boolean; paid: number; brand: string; done: number; need: number } {
  const s = g.social.sponsor, d = s.active!, def = sponsorDef(d.key);
  const fresh = s.postTimes.filter(x => g.lastReal - x < SPONSOR.spamWindowH * HR);
  const spam = fresh.length >= SPONSOR.spamCount;
  s.postTimes = [...fresh, g.lastReal];
  d.done++;
  let paid = 0, finished = false;
  if (d.done >= def.need) {
    paid = d.pay - d.upfront; finished = true;
    g.money += paid; g.social.earned += paid; s.earned += paid;
    s.active = null; s.rep++;
  }
  return { viewMult: spam ? SPONSOR.spamMult : 1, spam, finished, paid, brand: def.brand, done: d.done, need: def.need };
}
