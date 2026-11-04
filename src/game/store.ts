// เก็บเซฟและการตั้งค่าใน localStorage (รหัสเซฟ/export มาในขั้น 6)
import { SAVE_VERSION, type GameState } from '../engine/core';

const SAVE_KEY = 'baan-non-save';
const SETTINGS_KEY = 'baan-non-settings';

export interface Settings { theme: string; }

function get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function set(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* โหมดส่วนตัว/พื้นที่เต็ม — เล่นต่อได้แต่ไม่เซฟ */ } }

export function loadGame(): GameState | null {
  const raw = get(SAVE_KEY);
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as GameState;
    if (g.v !== SAVE_VERSION) return null; // ขั้น 6: แปลงเซฟเก่า
    return g;
  } catch { return null; }
}
export const saveGame = (g: GameState) => set(SAVE_KEY, JSON.stringify(g));
export function clearGame() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } }

export function loadSettings(): Settings {
  try { return { theme: 'peach', ...JSON.parse(get(SETTINGS_KEY) ?? '{}') }; } catch { return { theme: 'peach' }; }
}
export const saveSettings = (s: Settings) => set(SETTINGS_KEY, JSON.stringify(s));
