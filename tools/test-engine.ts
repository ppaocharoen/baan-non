// ทดสอบเครื่องยนต์ — รันใน CI ก่อน sim และ build
import { BALANCE as B } from '../src/engine/balance';
import { BREEDS, breedOf, FOODS } from '../src/engine/content';
import { adopt, advance, bathe, canTrain, catchUpOffline, coax, feed, newGame, play, tickOnline, train, treat, type GameState } from '../src/engine/core';
import { petStage } from '../src/engine/pet';
import { nextRandom } from '../src/engine/rng';
import { calendar, nightness, offlineDays } from '../src/engine/time';

let fails = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fails++;
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
function setup(mode: 'normal' | 'hard' = 'normal', breed = 'bangkaew'): { g: GameState; id: number } {
  const g = newGame(mode, 42, 0);
  g.money = 10000;
  return { g, id: adopt(g, breed, 'ทดสอบ').pet!.id };
}

// ---- RNG / ข้อมูล ----
{
  const a = { rng: 12345 }, b = { rng: 12345 };
  const sa = Array.from({ length: 5 }, () => nextRandom(a)), sb = Array.from({ length: 5 }, () => nextRandom(b));
  check('RNG seed เดียวกันได้ผลเดียวกัน', sa.every((v, i) => v === sb[i]));
  check('มีสายพันธุ์ 8 สาย และอาหาร 3 ระดับ', BREEDS.length === 8 && FOODS.length === 3);
  check('breedOf หาเจอ', breedOf('korat').species === 'cat');
}

// ---- เวลา ----
{
  check('ปิดเกม 23 ชม. ≈ 13.8 วันในเกม', near(offlineDays(23 * 3600), 13.8, 0.01));
  check('ปิดเกมนานมาก ติดเพดาน 60 วัน', offlineDays(30 * 24 * 3600) === B.offlineMaxDays);
  check('เวลาย้อนหลัง (นาฬิกาเครื่องถอย) ไม่ทำให้เวลาถอย', offlineDays(-500) === 0);
  const c = calendar(28 + 0.5);
  check('ปฏิทิน: วันที่ 29 = ฤดูที่ 2 วันที่ 1 เที่ยงวัน', c.season === 1 && c.dayOfSeason === 1 && near(c.hour, 12));
  check('กลางวันสว่าง กลางคืนมืด', nightness(12 / 24) === 0 && nightness(22 / 24) === 1);
}

// ---- การดูแล ----
{
  const { g, id } = setup();
  const p = g.pets[0];
  advance(g, 5);
  check('ความอิ่มลดวันละ 0.04', near(p.full, 0.8 - 0.2, 1e-9));
  const bond0 = p.bond;
  feed(g, id, 'rice');
  check('ให้อาหารแล้วอิ่มเต็ม + ผูกพัน', p.full === 1 && p.bond > bond0);
  const bond1 = p.bond, money1 = g.money;
  feed(g, id, 'rice');
  check('ให้อาหารซ้ำวันเดิม ผูกพันไม่เพิ่ม แต่เสียเงิน', p.bond === bond1 && g.money === money1 - 5);
  for (let i = 0; i < B.playsPerDay; i++) check(`เล่นครั้งที่ ${i + 1} ได้`, play(g, id).ok);
  check('เล่นเกินวันละ 3 ครั้งไม่ได้', !play(g, id).ok);
  advance(g, 1);
  check('ข้ามวันแล้วเล่นได้อีก', play(g, id).ok);
  check('ฝึกครั้งแรกได้', train(g, id, 5).ok && near(p.trained, B.trainGain));
  check('ฝึกซ้ำก่อนครบ 7 วันไม่ได้', !train(g, id, 5).ok);
  advance(g, 7);
  check('ครบ 7 วันฝึกได้', canTrain(g, p));
  p.clean = 0.1; bathe(g, id);
  check('อาบน้ำแล้วสะอาดเต็ม', p.clean === 1);
  g.money = 0;
  check('เงินไม่พอซื้ออาหารพรีเมียม', !feed(g, id, 'premium').ok);
}

// ---- ป่วย / หนี / ตาย ----
{
  const { g, id } = setup('normal');
  const p = g.pets[0];
  p.full = 0; p.clean = 0;
  let sick = false;
  for (let i = 0; i < 40 && !sick; i++) sick = advance(g, 1).some(e => e.type === 'sick');
  check('หิวและสกปรกนาน → ป่วย', sick && p.sickSince !== null);
  check('ป่วยแล้วฝึกไม่ได้', !train(g, id, 5).ok);
  check('รักษาที่คลินิกหาย', treat(g, id).ok && p.sickSince === null);

  advance(g, 40);
  check('โหมดปกติ ละเลยนาน → หนีไปบ้านป้า', p.status === 'away' && g.pets.length === 1);
  check('อยู่บ้านป้า ให้อาหารไม่ได้', !feed(g, id, 'rice').ok);
  const bondBefore = p.bond;
  check('ง้อกลับได้ ผูกพันลดครึ่ง', coax(g, id).ok && p.status === 'home' && near(p.bond, bondBefore * B.coaxBondMult));
}
{
  const { g } = setup('hard');
  g.pets[0].full = 0;
  advance(g, 40);
  check('โหมดเข้ม ละเลยนาน → ตาย', g.pets.length === 0 && g.heaven[0]?.cause === 'neglect');
}
{
  const { g, id } = setup();
  const p = g.pets[0], br = breedOf(p.breed);
  check('อายุขัยสุ่มอยู่ในช่วง', p.lifespan >= br.life[0] && p.lifespan <= br.life[1]);
  const stages: number[] = [];
  // ดูแลไปเรื่อยๆ จนหมดอายุ
  while (g.pets.length) {
    for (const e of advance(g, 1)) if (e.type === 'stage') stages.push(e.stage);
    if (g.pets[0]) { feed(g, id, 'rice'); bathe(g, id); }
  }
  check('โตเป็นผู้ใหญ่และแก่ตามลำดับ', stages.join(',') === '1,2');
  check('หมดอายุขัย → สวนสวรรค์', g.heaven[0]?.cause === 'age' && Math.abs(g.heaven[0].ageDays - p.lifespan) < 0.06);
  check('petStage ตอนเกิด = เด็ก', petStage({ ...p, born: 0 }, 0) === 0);
}

// ---- เซฟเป็น JSON ได้ และเล่นต่อได้ผลเดิม ----
{
  const { g } = setup();
  advance(g, 3);
  const copy = JSON.parse(JSON.stringify(g)) as GameState;
  advance(g, 20); advance(copy, 20);
  check('สถานะเซฟเป็น JSON แล้วเดินต่อได้ผลเท่ากัน', JSON.stringify(g) === JSON.stringify(copy));
  const before = g.day;
  tickOnline(g, 300, 1000);
  check('เปิดเกม 300 วินาที = 1 วันในเกม', near(g.day - before, 1));
  const { days } = catchUpOffline(g, 1000 + 23 * 3600 * 1000);
  check('catchUpOffline ใช้ lastReal', near(days, 13.8, 0.01));
}

if (fails) { console.error(`❌ ไม่ผ่าน ${fails} ข้อ`); process.exit(1); }
console.log('✓ ผ่านทุกข้อ');
