// ทดสอบเครื่องยนต์ — รันใน CI ก่อน sim และ build
import { BALANCE as B } from '../src/engine/balance';
import { BREEDS, breedOf, FOODS } from '../src/engine/content';
import { adopt, advance, bathe, canTrain, catchUpOffline, coax, feed, newGame, play, routineCare, tickOnline, train, treat, vaccinate, type GameState } from '../src/engine/core';
import { buyFurniture, buySupply, cleanPoop, emptyToilet, placeItem, toiletFor } from '../src/engine/home';
import { addPhoto, post, postsLeft, SOCIAL } from '../src/engine/social';
import { diseaseOf, dueItems, HEALTH, vaccineState, vaccineOf, vaccinesFor } from '../src/engine/health';
import { petStage } from '../src/engine/pet';
import { nextRandom } from '../src/engine/rng';
import { calendar, nightness, offlineDays } from '../src/engine/time';

let fails = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fails++;
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
/** เก็บอึบนพื้นทั้งหมด (ทดสอบเรื่องอื่นโดยไม่ให้บ้านสกปรกแทรก) */
const tidy = (g: GameState) => { g.poops = []; };
function setup(mode: 'normal' | 'hard' = 'normal', breed = 'bangkaew', protect = false): { g: GameState; id: number } {
  const g = newGame(mode, 42, 0);
  g.money = 10000;
  const p = adopt(g, breed, 'ทดสอบ').pet!;
  if (protect) { // วัคซีน/ดูแลประจำครบ และกระตุ้นไว้ไกลๆ เพื่อทดสอบเรื่องอื่นโดยไม่มีโรคแทรก
    for (const v of HEALTH.vaccines) p.health.vax[v.key] = { doses: v.series, last: 1e6 };
    for (const c of HEALTH.care) p.health.care[c.key] = 1e6;
  }
  return { g, id: p.id };
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
  const { g, id } = setup('normal', 'bangkaew', true);
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
  check('หิวและสกปรกนาน → ป่วย', sick && p.health.disease !== null);
  check('ป่วยแล้วฝึกไม่ได้', !train(g, id, 5).ok);
  check('รักษาที่คลินิกหาย', treat(g, id).ok && p.health.disease === null);

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

// ---- สุขภาพ: วัคซีน ดูแลประจำ โรค ----
{
  const { g, id } = setup('normal', 'bangkaew');
  const p = g.pets[0], combo = vaccineOf('dog_combo');
  check('หมามีวัคซีน 2 ชนิด นกไม่มี', vaccinesFor(p).length === 2 && vaccinesFor(setup('normal', 'myna').g.pets[0]).length === 0);
  check('เด็กเกินไปฉีดไม่ได้', !vaccinate(g, id, 'dog_combo').ok);
  advance(g, combo.minAge);
  check('ถึงอายุ ฉีดเข็ม 1 ได้', vaccinate(g, id, 'dog_combo').ok && p.health.vax.dog_combo.doses === 1);
  check('ฉีดซ้ำก่อนครบระยะไม่ได้', !vaccinate(g, id, 'dog_combo').ok);
  check('หลังฉีดซึม (postVax)', g.day < p.health.postVaxUntil);
  for (let i = 1; i < combo.series; i++) { advance(g, combo.gap); p.health.disease = null; feed(g, id, 'rice'); tidy(g); vaccinate(g, id, 'dog_combo'); }
  check(`ครบชุด ${combo.series} เข็ม`, p.health.vax.dog_combo.doses === combo.series && vaccineState(p, combo, g.day).s === 'ok');
  for (let i = 0; i < combo.booster - HEALTH.dueEarly; i++) { advance(g, 1); feed(g, id, 'rice'); tidy(g); p.health.disease = null; }
  check('ใกล้ครบรอบ → ถึงกำหนดกระตุ้น', vaccineState(p, combo, g.day).s === 'due' && dueItems(p, g.day).vax.some(v => v.key === 'dog_combo'));
  check('ถ่ายพยาธิได้ แล้วไม่ถึงกำหนดอีก', routineCare(g, id, 'dog_deworm').ok && !routineCare(g, id, 'dog_deworm').ok);
}
{
  // ไม่ฉีดวัคซีน ไม่ถ่ายพยาธิ แต่ให้อาหาร/อาบน้ำ → ป่วยจากโรคที่ป้องกันได้
  const { g, id } = setup('normal', 'korat');
  const p = g.pets[0];
  let got: string | null = null;
  for (let d = 0; d < 120 && !got; d++) { advance(g, 1); feed(g, id, 'rice'); tidy(g); if (p.clean < 0.5) bathe(g, id); got = p.health.disease; }
  check('ไม่ป้องกัน → ป่วยโรคที่ป้องกันได้', got !== null && ['vaccine', 'care'].includes(diseaseOf(got).cause));
  const before = g.money, price = diseaseOf(got!).price;
  check('รักษาเสียค่ายาตามโรค', treat(g, id).ok && before - g.money === price);
}
{
  // ฉีดครบ ดูแลครบ → ไม่ป่วยเลย 200 วัน
  const { g, id } = setup('normal', 'langan');
  const p = g.pets[0];
  let sick = 0;
  for (let d = 0; d < 200; d++) {
    sick += advance(g, 1).filter(e => e.type === 'sick').length;
    feed(g, id, 'kibble'); tidy(g); if (p.clean < 0.5 && g.day >= p.health.postVaxUntil) bathe(g, id);
    const due = dueItems(p, g.day);
    due.vax.forEach(v => vaccinate(g, id, v.key)); due.care.forEach(c => routineCare(g, id, c.key));
  }
  check('ดูแลครบ ไม่ป่วยเลย 200 วัน', sick === 0);
}
{
  // อาบน้ำหลังฉีดวัคซีน → บางครั้งเป็นไข้
  let fevers = 0;
  for (let s = 1; s <= 60; s++) {
    const g = newGame('normal', s, 0); g.money = 1e6;
    const id = adopt(g, 'khaomanee', 'x').pet!.id;
    advance(g, 4.5); g.pets[0].health.disease = null; vaccinate(g, id, 'cat_combo'); g.pets[0].clean = 0.5;
    if (bathe(g, id).fever) fevers++;
  }
  check('อาบน้ำหลังฉีดวัคซีน เสี่ยงไข้ ~30%', fevers > 8 && fevers < 30);
}

// ---- บ้าน ร้าน การขับถ่าย ----
{
  const { g, id } = setup('normal', 'korat', true);
  const p = g.pets[0];
  check('ซื้อกระบะทราย', buyFurniture(g, 'litter').ok && g.items.length === 1 && g.items[0].x === null);
  check('ของที่ยังไม่วาง แมวใช้ไม่ได้', toiletFor(g, p) === undefined);
  placeItem(g, g.items[0].uid, 120);
  check('วางแล้วแมวใช้ได้ · หมาใช้ไม่ได้', toiletFor(g, p)?.key === 'litter' && toiletFor(setup('normal', 'bangkaew').g, setup('normal', 'bangkaew').g.pets[0]) === undefined);
  let poops = 0, inBox = 0;
  for (let i = 0; i < 40; i++) {
    feed(g, id, 'rice');
    for (const e of advance(g, 1.5)) if (e.type === 'poop') { poops++; if (e.toilet !== null) inBox++; }
    if (g.items[0].fill >= 5) { g.supplies.sand = 9; emptyToilet(g, g.items[0].uid); }
    if (p.clean < 0.5) bathe(g, id);
    tidy(g);
  }
  check(`กินแล้วขับถ่ายมื้อละครั้ง (${poops}/40)`, poops >= 38 && poops <= 40);
  check('ส่วนใหญ่เข้ากระบะ', inBox / poops > 0.4);
  g.supplies.sand = 0; g.items[0].fill = 2;
  check('ทรายหมด เทกระบะไม่ได้', !emptyToilet(g, g.items[0].uid).ok);
  check('ซื้อทรายแล้วเทได้', buySupply(g, 'sand').ok && emptyToilet(g, g.items[0].uid).ok && g.supplies.sand === 2);
}
{
  const { g, id } = setup('normal', 'bangkaew', true);
  for (let i = 0; i < 10; i++) { feed(g, id, 'rice'); advance(g, 1.2); }
  check('ไม่มีห้องน้ำ → อึบนพื้น มีเพดาน 4 กอง', g.poops.length === 4);
  check('เก็บอึได้', cleanPoop(g, g.poops[0].id).ok && g.poops.length === 3);
  const p = g.pets[0]; p.clean = 1;
  advance(g, 2);
  check('อึบนพื้นทำให้สกปรกเร็วขึ้น', p.clean < 1 - 2 * B.cleanDecay - 1e-9);
}
{
  const { g, id } = setup('normal', 'bangkaew', true);
  const p = g.pets[0];
  buySupply(g, 'shampoo'); p.clean = 0.3;
  check('อาบน้ำใช้แชมพู', bathe(g, id).shampoo === true && g.supplies.shampoo === 2);
  buySupply(g, 'treat');
  check('ฝึกใช้ขนม ได้ผลเพิ่ม', train(g, id, 5).treat === true && near(p.trained, B.trainGain * 1.3));
  buyFurniture(g, 'ball'); placeItem(g, g.items[0].uid, 50);
  const b0 = p.bond; play(g, id);
  check('มีของเล่น เล่นได้ผูกพันมากขึ้น', near(p.bond - b0, B.bondPlay * 1.5));
}

// ---- เพจบ้านน้อน ----
{
  const { g, id } = setup('normal', 'bangkaew', true);
  const p = g.pets[0];
  const a = addPhoto(g, { tier: 1, label: 'กินข้าว', petIds: [id] }), b = addPhoto(g, { tier: 0, label: 'นอน', petIds: [id] }), c = addPhoto(g, { tier: 0, label: 'เล่น', petIds: [id] });
  const m0 = g.money;
  const r1 = post(g, a.id);
  check('โพสต์ได้ยอดวิว ผู้ติดตาม เงิน', r1.ok && r1.r!.views > 0 && g.social.followers > 0 && g.money > m0);
  check('โพสต์รูปเดิมซ้ำไม่ได้', !post(g, a.id).ok);
  post(g, b.id);
  check(`วันละ ${SOCIAL.postsPerDay} โพสต์`, postsLeft(g) === 0 && !post(g, c.id).ok);
  advance(g, 1); tidy(g);
  check('ข้ามวันโพสต์ได้อีก', postsLeft(g) === SOCIAL.postsPerDay);
  for (let i = 0; i < 20; i++) addPhoto(g, { tier: 0, label: 'x' + i, petIds: [id] });
  check('อัลบั้มเต็มทิ้งรูปเก่า', g.social.album.length === SOCIAL.albumMax);
  g.social.followers = 1000; p.health.disease = 'skin';
  const sickPh = addPhoto(g, { tier: 1, label: 'ป่วย', petIds: [id] });
  check('รูปน้องป่วย ผู้ติดตามลด', sickPh.sick && post(g, sickPh.id).r!.fans < 0 && g.social.followers < 1000);
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
