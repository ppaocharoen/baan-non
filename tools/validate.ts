// ตรวจความถูกต้องของ data/*.json — รันอัตโนมัติก่อน build ทุกครั้ง
import fs from 'node:fs';
import path from 'node:path';
import { BREEDS, FOODS } from '../src/engine/content';

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
  if (!fs.existsSync(path.join(ROOT, 'public/art', `${b.art}_x.png`))) errors.push(`${where}: ไม่มีชีตท่าเพิ่ม public/art/${b.art}_x.png`);
  if (!(b.xScale > 0.5 && b.xScale < 2)) errors.push(`${where}: xScale ผิด`);
}

const foodKeys = new Set<string>();
for (const f of FOODS) {
  const where = `อาหาร ${f.key}`;
  if (foodKeys.has(f.key)) errors.push(`${where}: key ซ้ำ`);
  foodKeys.add(f.key);
  if (!(f.price >= 0)) errors.push(`${where}: ราคาผิด`);
  if (!(f.bondMult > 0) || !(f.sickMult >= 0)) errors.push(`${where}: ตัวคูณผิด`);
  if (!(Number.isInteger(f.icon) && f.icon >= 0 && f.icon < 12)) errors.push(`${where}: icon ต้องเป็นช่อง 0–11 ใน items.png`);
}

if (errors.length) {
  console.error(`❌ ข้อมูลผิด ${errors.length} จุด`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ ข้อมูลถูกต้อง · ${BREEDS.length} สายพันธุ์ · ${FOODS.length} อาหาร`);
