// ทดสอบเครื่องยนต์ — รันใน CI ก่อน sim และ build
import { nextRandom } from '../src/engine/rng';
import { BREEDS, breedOf } from '../src/engine/content';

let fails = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fails++;
}

// RNG แบบมี seed ต้องได้ผลเดิมทุกครั้ง
const a = { rng: 12345 }, b = { rng: 12345 };
const seqA = Array.from({ length: 5 }, () => nextRandom(a));
const seqB = Array.from({ length: 5 }, () => nextRandom(b));
check('RNG seed เดียวกันได้ผลเดียวกัน', seqA.every((v, i) => v === seqB[i]));
check('RNG อยู่ในช่วง [0,1)', seqA.every(v => v >= 0 && v < 1));

check('มีสายพันธุ์ตั้งต้น 8 สาย', BREEDS.length === 8);
check('breedOf หาเจอ', breedOf('korat').species === 'cat');

if (fails) { console.error(`❌ ไม่ผ่าน ${fails} ข้อ`); process.exit(1); }
console.log('✓ ผ่านทุกข้อ');
