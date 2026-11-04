// ย้ายเครื่อง / สำรองเซฟ: รหัสเซฟ (ข้อความสั้น คัดลอกไปวางอีกเครื่อง) และไฟล์ (รวมรูปในอัลบั้ม)
import type { GameState } from '../engine/core';

const PREFIX = 'BN1:';

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const canZip = typeof CompressionStream !== 'undefined';

/** สร้างรหัสเซฟ (ไม่รวมรูป) */
export async function makeSaveCode(g: GameState): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(g));
  if (canZip) return PREFIX + 'z' + toB64(await pipe(raw, new CompressionStream('deflate-raw')));
  return PREFIX + 'p' + toB64(raw);
}

/** อ่านรหัสเซฟ → ข้อมูลเกม (ยังไม่แปลงเวอร์ชัน) */
export async function readSaveCode(code: string): Promise<unknown> {
  const c = code.replace(/\s+/g, '');
  if (!c.startsWith(PREFIX)) throw new Error('ไม่ใช่รหัสเซฟบ้านน้อน');
  const kind = c[PREFIX.length], body = fromB64(c.slice(PREFIX.length + 1));
  const bytes = kind === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** ไฟล์สำรอง: เกม + ตั้งค่า + รูป */
export function makeBackupFile(g: GameState, settings: unknown, photos: Record<string, string>): Blob {
  return new Blob([JSON.stringify({ app: 'baan-non', saved: new Date().toISOString(), game: g, settings, photos })], { type: 'application/json' });
}
export async function readBackupFile(f: File): Promise<{ game: unknown; settings?: unknown; photos?: Record<string, string> }> {
  const j = JSON.parse(await f.text());
  if (j?.app !== 'baan-non' || !j.game) throw new Error('ไม่ใช่ไฟล์สำรองของบ้านน้อน');
  return j;
}
