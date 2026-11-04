// รหัสลับ: ใส่ในเมนู → ใส่รหัส · เก็บเป็น hash (repo เป็นสาธารณะ ไม่ให้เห็นรหัสตรงๆ)
// รหัสทดสอบ: เงิน เร่งเวลา ข้ามวัน รักษา · รหัสปลดล็อก: ของพิเศษ
export type CodeEffect = 'money' | 'fast' | 'slow' | 'skip' | 'heal' | 'gold';

const CODES: Record<string, CodeEffect> = {
  '825688f49ba91350527acf885ec986ef8c290b228494e10b56fab42859f6e584': 'money',
  '854d5306a4aa6d7c0c68b8e1fda228424a1e8d695df02a66911c4d7216777706': 'fast',
  '624f979176af3afc927798a3db3ef62e2564e165d8f9f427b1908d8e4eaa3458': 'slow',
  'ac742d0f3f1cc814e16beed1276b7ec89e8667ff2056d3b0dca99948e54ae644': 'skip',
  '49a7172b743928d065387fdf7b4a53db2d22587f5168ec355654e4b07a59fa69': 'heal',
  'f416a1e95e3b1877877b61c4ad0dd27ad26a7914ab3774dc3e09130ff1abd4fd': 'gold',
};

const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, '').toUpperCase();

export async function checkCode(input: string): Promise<CodeEffect | null> {
  const data = new TextEncoder().encode('baan-non:' + norm(input));
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return CODES[hex] ?? null;
}
