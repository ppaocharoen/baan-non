// เก็บเซฟและการตั้งค่าใน localStorage (รหัสเซฟ/export มาในขั้น 6)
import { SAVE_VERSION, type GameState } from '../engine/core';
import { newHealth } from '../engine/health';
import { newSocial } from '../engine/social';

const SAVE_KEY = 'baan-non-save';
const SETTINGS_KEY = 'baan-non-settings';

export interface Settings { theme: string; sound: boolean; /** ตัวคูณเวลาตอนเปิดเกม (รหัสทดสอบ) */ speed: number; /** ของที่ปลดล็อกด้วยรหัส */ unlocks: string[]; }

function get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function set(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* โหมดส่วนตัว/พื้นที่เต็ม — เล่นต่อได้แต่ไม่เซฟ */ } }

export function loadGame(): GameState | null {
  const raw = get(SAVE_KEY);
  if (!raw) return null;
  try {
    const g = migrate(JSON.parse(raw));
    return g && g.v === SAVE_VERSION ? g : null;
  } catch { return null; }
}
/** แปลงเซฟเก่าให้เป็นเวอร์ชันปัจจุบัน ทีละขั้น */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(g: any): GameState | null {
  if (!g || typeof g.v !== 'number') return null;
  if (g.v === 1) { // v1 → v2: เพิ่มสมุดสุขภาพ · ป่วยแบบไม่ระบุโรค → โรคผิวหนัง
    for (const p of g.pets ?? []) {
      p.health = newHealth();
      if (p.sickSince !== null && p.sickSince !== undefined) p.health.disease = 'skin';
      delete p.sickSince;
      p.sickDays ??= 0;
    }
    g.v = 2;
  }
  if (g.v === 2) { // v2 → v3: ของในบ้าน ของสิ้นเปลือง การขับถ่าย
    g.items ??= []; g.supplies ??= {}; g.poops ??= []; g.nextUid ??= 1;
    for (const p of g.pets ?? []) { p.poopIn ??= -1; p.shampooUntil ??= -1; }
    g.v = 3;
  }
  if (g.v === 3) { // v3 → v4: เพจบ้านน้อน (ให้เงินชดเชยรายได้ชั่วคราวที่หายไป)
    g.social ??= newSocial();
    g.money = (g.money ?? 0) + 150;
    g.v = 4;
  }
  return g as GameState;
}

export const saveGame = (g: GameState) => set(SAVE_KEY, JSON.stringify(g));
export function clearGame() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } }

export function loadSettings(): Settings {
  const def: Settings = { theme: 'peach', sound: true, speed: 1, unlocks: [] };
  try { return { ...def, ...JSON.parse(get(SETTINGS_KEY) ?? '{}') }; } catch { return def; }
}
export const saveSettings = (s: Settings) => set(SETTINGS_KEY, JSON.stringify(s));

// ---------- รูปในอัลบั้ม (เก็บแยกจากเซฟ เพราะขนาดใหญ่) ----------
const PHOTO_KEY = 'baan-non-photos';
function photos(): Record<string, string> { try { return JSON.parse(get(PHOTO_KEY) ?? '{}'); } catch { return {}; } }
export const photoUrl = (id: number) => photos()[id] ?? '';
export function savePhoto(id: number, url: string, keep: number[]) {
  const all = photos(), out: Record<string, string> = {};
  for (const k of keep) if (all[k]) out[k] = all[k];
  out[id] = url;
  set(PHOTO_KEY, JSON.stringify(out));
}
