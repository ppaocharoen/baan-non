// ตรวจความถูกต้องของ data/*.json — รันอัตโนมัติก่อน build ทุกครั้ง
import fs from 'node:fs';
import path from 'node:path';
import { BREEDS } from '../src/engine/content';

const ROOT = path.resolve(import.meta.dirname, '..');
const errors: string[] = [];

const seen = new Set<string>();
for (const b of BREEDS) {
  const where = `สายพันธุ์ ${b.key}`;
  if (seen.has(b.key)) errors.push(`${where}: key ซ้ำ`);
  seen.add(b.key);
  if (!['dog', 'cat', 'bird'].includes(b.species)) errors.push(`${where}: species ผิด "${b.species}"`);
  if (!b.name) errors.push(`${where}: ไม่มีชื่อ`);
  if (!(b.life[0] > 0 && b.life[0] <= b.life[1])) errors.push(`${where}: life ต้องเป็น [ต่ำ, สูง]`);
  if (!(b.stages[0] > 0 && b.stages[0] < b.stages[1] && b.stages[1] < b.life[0])) errors.push(`${where}: stages ต้องอยู่ก่อนอายุขัยต่ำสุด`);
  if (!(b.scale > 0 && b.scale < 1)) errors.push(`${where}: scale ผิด`);
  if (!fs.existsSync(path.join(ROOT, 'public/art', `${b.art}.png`))) errors.push(`${where}: ไม่มีไฟล์ภาพ public/art/${b.art}.png`);
}

if (errors.length) {
  console.error(`❌ ข้อมูลผิด ${errors.length} จุด`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ ข้อมูลถูกต้อง · ${BREEDS.length} สายพันธุ์`);
