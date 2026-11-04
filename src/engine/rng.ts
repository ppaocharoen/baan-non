// สุ่มแบบกำหนด seed ได้ (mulberry32) — เซฟสถานะ rng ไว้ใน state จึงเล่นซ้ำได้ผลเดิม
export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function randInt(state: { rng: number }, lo: number, hi: number): number {
  return lo + Math.floor(nextRandom(state) * (hi - lo + 1));
}
