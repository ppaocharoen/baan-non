// เพจบ้านน้อน: อัลบั้มรูปจากจังหวะชัตเตอร์ → โพสต์ → ยอดวิว ผู้ติดตาม รายได้
// ตัวรูป (ภาพจริง) เก็บแยกนอกเซฟ — เครื่องยนต์เก็บแค่ข้อมูลรูปไว้คิดคะแนน
import type { GameState, Result } from './core';
import { placed, furnitureOf } from './home';
import { isSick, mood } from './pet';
import { nextRandom } from './rng';

export interface Photo {
  id: number;
  day: number;
  /** 0 ทั่วไป · 1 ดี · 2 เด่น · 3 ไวรัล */
  tier: number;
  label: string;
  petIds: number[];
  /** คะแนนตอนถ่าย (ระดับ × อารมณ์น้อง × ของแต่งบ้าน) */
  score: number;
  sick: boolean;
  posted: boolean;
}
export interface PostResult { views: number; fans: number; coins: number; comments: string[]; }
export interface SocialState {
  followers: number;
  album: Photo[];
  postDay: number; postsToday: number;
  earned: number;
  recentLabels: string[];
}
export const newSocial = (): SocialState => ({ followers: 0, album: [], postDay: -1, postsToday: 0, earned: 0, recentLabels: [] });

export const SOCIAL = {
  albumMax: 12,
  postsPerDay: 2,
  tierBase: [1, 1.6, 2.6, 5],
  /** ยอดวิว = (baseViews + viewsPerRootFan × √ผู้ติดตาม) × คะแนน — โตช้าลงเมื่อเพจใหญ่ */
  baseViews: 250,
  viewsPerRootFan: 8,
  coinsPerView: 0.08,
  fanRate: 0.06,
  /** ผู้ติดตามใหม่ลดลงแบบกำลังสองเมื่อเพจใหญ่ขึ้น (ไม่โตทวีคูณ) */
  fanSoftCap: 3000,
  /** รายได้โฆษณาจากโพสต์เก่า ต่อผู้ติดตาม ต่อวันในเกม */
  passivePerFan: 0.002,
  /** รูปเก่าเกินกี่วันคนไม่ค่อยสนใจ */
  freshDays: 14,
};

export const TIER_TH = ['ทั่วไป', 'ดี', 'เด่น', 'ไวรัล'];

/** เก็บรูปเข้าอัลบั้ม — คืนรูปใหม่ (อัลบั้มเต็มจะทิ้งรูปเก่าที่สุดที่ยังไม่โพสต์ก่อน) */
export function addPhoto(g: GameState, o: { tier: number; label: string; petIds: number[] }): Photo {
  const pets = g.pets.filter(p => o.petIds.includes(p.id));
  const m = pets.length ? pets.reduce((a, p) => a + mood(p), 0) / pets.length : 0.5;
  const decor = Math.min(0.3, placed(g).filter(i => furnitureOf(i.key).kind === 'decor').length * 0.06);
  const photo: Photo = {
    id: g.nextUid++, day: g.day, tier: o.tier, label: o.label, petIds: o.petIds,
    score: SOCIAL.tierBase[o.tier] * (0.5 + m) * (1 + decor), sick: pets.some(isSick), posted: false,
  };
  const s = g.social;
  s.album.push(photo);
  while (s.album.length > SOCIAL.albumMax) {
    const i = s.album.findIndex(x => x.posted);
    s.album.splice(i >= 0 ? i : 0, 1);
  }
  return photo;
}

export function postsLeft(g: GameState): number {
  const d = Math.floor(g.day), s = g.social;
  return s.postDay === d ? SOCIAL.postsPerDay - s.postsToday : SOCIAL.postsPerDay;
}

/** ช่วงเวลาโพสต์: หัวค่ำคนดูเยอะ ดึกคนน้อย */
export function hourFactor(day: number): number {
  const h = (day - Math.floor(day)) * 24;
  if (h >= 18 && h < 22) return 1.3;
  if (h >= 7 && h < 18) return 1;
  if (h >= 22 || h < 1) return 0.85;
  return 0.6;
}
export const freshness = (p: Photo, day: number) => Math.max(0.3, 1 - (day - p.day) / SOCIAL.freshDays);

const GOOD = ['น้องน่ารักมากกก 😍', 'ขอพิกัดอาหารค่ะ', 'ใจละลายเลย', 'ตัวจริงน่ารักกว่าในรูปแน่ๆ', 'กดติดตามแล้วนะ', 'อยากไปเล่นด้วยจัง', 'บ้านริมคลองน่าอยู่มาก', 'มุมนี้ดีมากค่ะ'];
const OK_ = ['น่ารักดีค่ะ', 'ชอบๆ', 'น้องชื่ออะไรคะ', 'โพสต์บ่อยๆ นะ'];
const SICK = ['น้องดูไม่สบายนะ พาไปหาหมอด่วน', 'ห่วงน้องจัง', 'ดูแลน้องดีๆ นะคะ'];
const REPEAT = ['รูปแบบนี้อีกแล้วเหรอ', 'อยากเห็นมุมใหม่ๆ บ้าง'];

export function post(g: GameState, photoId: number): Result & { r?: PostResult } {
  const s = g.social, ph = s.album.find(p => p.id === photoId);
  if (!ph) return { ok: false, reason: 'ไม่พบรูป' };
  if (ph.posted) return { ok: false, reason: 'โพสต์รูปนี้ไปแล้ว' };
  if (postsLeft(g) <= 0) return { ok: false, reason: `วันนี้โพสต์ครบ ${SOCIAL.postsPerDay} โพสต์แล้ว` };
  const d = Math.floor(g.day);
  if (s.postDay !== d) { s.postDay = d; s.postsToday = 0; }
  const repeat = s.recentLabels.includes(ph.label);
  const luck = 0.8 + nextRandom(g) * 0.4;
  const mult = ph.score * freshness(ph, g.day) * hourFactor(g.day) * (repeat ? 0.7 : 1) * (ph.sick ? 0.4 : 1) * luck;
  const views = Math.round((SOCIAL.baseViews + SOCIAL.viewsPerRootFan * Math.sqrt(s.followers)) * mult);
  const k = SOCIAL.fanSoftCap / (SOCIAL.fanSoftCap + s.followers);
  let fans = Math.round(views * SOCIAL.fanRate * k * k);
  if (ph.sick) fans = -Math.round(s.followers * 0.02);
  const coins = Math.round(views * SOCIAL.coinsPerView);
  s.followers = Math.max(0, s.followers + fans);
  g.money += coins; s.earned += coins;
  s.postsToday++; ph.posted = true;
  s.recentLabels = [...s.recentLabels, ph.label].slice(-3);
  const pick = (a: string[]) => a[Math.floor(nextRandom(g) * a.length)];
  const comments = ph.sick ? [pick(SICK), pick(SICK)] : repeat ? [pick(REPEAT), pick(OK_)] : mult > 1.5 ? [pick(GOOD), pick(GOOD)] : [pick(GOOD), pick(OK_)];
  return { ok: true, r: { views, fans, coins, comments: [...new Set(comments)] } };
}

/** รายได้โฆษณาจากโพสต์เก่า (เรียกทุกก้าวเวลา) */
export function passiveIncome(g: GameState, dt: number) {
  const v = g.social.followers * SOCIAL.passivePerFan * dt;
  g.money += v; g.social.earned += v;
}
