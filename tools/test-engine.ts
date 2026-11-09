// ทดสอบเครื่องยนต์ — รันใน CI ก่อน sim และ build
import { BALANCE as B } from '../src/engine/balance';
import { BREEDS, breedOf, FOODS } from '../src/engine/content';
import { adopt, advance, bathe, brush, canTrain, catchUpOffline, coax, feed, groomKind, newGame, play, playToy, routineCare, tickOnline, train, treat, vaccinate, type GameState } from '../src/engine/core';
import { buyFurniture, buySupply, buyToy, cleanPoop, emptyToilet, expandHome, EXPANSIONS, maxPets, placeItem, roomsOf, toiletFor, toyOf } from '../src/engine/home';
import { addPhoto, post, postsLeft, SOCIAL } from '../src/engine/social';
import { acceptOffer, photoFits, SPONSOR, sponsorDef, stepSponsor } from '../src/engine/sponsor';
import { migrate } from '../src/game/store';
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
  buyFurniture(g, 'bed'); placeItem(g, g.items[0].uid, 50);
  const b0 = p.bond; play(g, id);
  check('เบาะนอนไม่ใช่ที่เล่น แตะเล่นได้ผูกพันปกติ', near(p.bond - b0, B.bondPlay));
}

// ---- ของเล่นใช้แล้วเสื่อม ----
{
  const { g, id } = setup('normal', 'bangkaew', true);
  const p = g.pets[0];
  check('หมาซื้อลูกบอลได้ เข้ากล่องของเล่น ไม่ได้วางในฉาก', buyToy(g, 'ball').ok && g.toys.length === 1 && g.items.length === 0);
  buyToy(g, 'wand');
  const ball = g.toys[0], wand = g.toys[1];
  check('หมาเล่นไม้ตกแมวไม่ได้', !playToy(g, id, wand.uid).ok);
  const b0 = p.bond, r = playToy(g, id, ball.uid);
  check('เล่นลูกบอล: ผูกพันเพิ่ม และความทนลด 1', r.ok && near(p.bond - b0, B.bondToy) && ball.left === toyOf('ball').uses - 1);
  playToy(g, id, ball.uid);
  check(`เล่นของเล่นได้วันละ ${B.toyPlaysPerDay} ครั้ง`, !playToy(g, id, ball.uid).ok);
  let broke = false;
  for (let d = 0; d < 20 && !broke; d++) { advance(g, 1); feed(g, id, 'rice'); tidy(g); for (let i = 0; i < 2; i++) broke = !!playToy(g, id, ball.uid).broke || broke; }
  check('เล่นครบจำนวนครั้งแล้วของเล่นพัง หายจากกล่อง', broke && !g.toys.some(t => t.uid === ball.uid));
}

// ---- สกปรกน้อยแปรง สกปรกมากลงอ่าง ----
{
  const { g, id } = setup('normal', 'korat', true);
  const p = g.pets[0];
  p.clean = 0.95; check('สะอาดอยู่ ไม่ต้องทำอะไร', groomKind(p) === 'none' && !brush(g, id).ok);
  p.clean = 0.6; check('สกปรกน้อย → แปรงขน สะอาดเพิ่ม', groomKind(p) === 'brush' && brush(g, id).ok && near(p.clean, 0.6 + B.brushGain));
  p.clean = 0.3; check('สกปรกมาก → ต้องลงอ่าง แปรงไม่ได้', groomKind(p) === 'tub' && !brush(g, id).ok);
  bathe(g, id); check('ลงอ่างแล้วสะอาดเต็ม', p.clean === 1);
}

// ---- ต่อเติมบ้าน ----
{
  const { g } = setup();
  check('เริ่มเลี้ยงได้ 2 ตัว 2 ห้อง', maxPets(g) === 2 && roomsOf(g).length === 2);
  adopt(g, 'korat', 'b');
  check('บ้านเต็มรับเพิ่มไม่ได้', !adopt(g, 'myna', 'c').ok);
  g.money = 0; check('เงินไม่พอต่อเติมไม่ได้', !expandHome(g).ok);
  g.money = 1e5;
  for (const e of EXPANSIONS) check(`ต่อเติม ${e.room} ได้ห้องใหม่`, expandHome(g).room === e.room);
  check('ต่อเติมครบ เลี้ยงได้ 6 ตัว 6 ห้อง', maxPets(g) === 6 && roomsOf(g).length === 6 && !expandHome(g).ok);
  for (const b of ['myna', 'nokkhao', 'langan', 'khaomanee']) adopt(g, b, b);
  check('รับครบ 6 ตัว', g.pets.length === 6 && !adopt(g, 'bulbul', 'x').ok);
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

// ---- สปอนเซอร์ ----
{
  const H = 3600_000;
  const { g, id } = setup('normal', 'bangkaew', true);
  g.lastReal = 1000;
  g.social.followers = 200;
  check('ผู้ติดตามไม่ถึง 300 ไม่มีข้อเสนอ', stepSponsor(g) === null && !g.social.sponsor.offer);
  g.social.followers = 500;
  const ev = stepSponsor(g);
  const of = g.social.sponsor.offer!;
  check('ผู้ติดตาม 500 ได้ข้อเสนอขั้นร้านในชุมชน', ev?.type === 'sponsorOffer' && sponsorDef(of.key).tier === 0);
  check('ข้อเสนอตรงชนิดสัตว์ (หมาไม่ได้งานทรายแมว)', !sponsorDef(of.key).species || sponsorDef(of.key).species!.includes('dog'));
  // บังคับเป็นงานให้อาหาร เพื่อทดสอบต่อ
  of.key = 'padaeng';
  const old = addPhoto(g, { tier: 1, label: 'กินข้าว', kind: 'eat', petIds: [id] });
  const m0 = g.money;
  const r = acceptOffer(g);
  check('รับงานได้มัดจำและอาหารฟรี', r.ok && g.money === m0 + of.upfront && g.supplies.meal_premium === 3);
  const m1 = g.money; feed(g, id, 'premium');
  check('ให้อาหารพรีเมียมใช้ของฟรีก่อน ไม่เสียเงิน', g.money === m1 && g.supplies.meal_premium === 2);
  check('รูปที่ถ่ายก่อนรับงานส่งไม่ได้', !photoFits(g, old));
  const wrong = addPhoto(g, { tier: 1, label: 'นอน', kind: 'sleep', petIds: [id] });
  const right = addPhoto(g, { tier: 0, label: 'กินข้าว', kind: 'eat', petIds: [id] });
  check('รูปตรงโจทย์เท่านั้นที่นับ', !photoFits(g, wrong) && photoFits(g, right));
  const m2 = g.money, rp = post(g, right.id);
  check('ส่งงานครบได้ค่าตอบแทนที่เหลือ', !!rp.r!.sponsor?.finished && g.money - m2 >= of.pay - of.upfront && !g.social.sponsor.active && g.social.sponsor.rep === 1);

  // ส่งไม่ทัน: เสียผู้ติดตาม 5%
  const g2 = setup('normal', 'korat', true).g;
  g2.lastReal = 1000; g2.social.followers = 1000;
  stepSponsor(g2); acceptOffer(g2);
  const dl = g2.social.sponsor.active!.deadlineAt!;
  g2.lastReal = dl - 1; stepSponsor(g2);
  check('ยังไม่เลยกำหนด งานยังอยู่', !!g2.social.sponsor.active);
  g2.lastReal = dl + 1;
  const fe = stepSponsor(g2);
  check('เลยกำหนด เสียผู้ติดตาม 5% และพักข้อเสนอ', fe?.type === 'sponsorFail' && g2.social.followers === 950 && g2.social.sponsor.nextOfferAt === dl + 1 + SPONSOR.failPauseH * H);
  check('ปิดเกมทั้งคืนไม่กินเวลาส่งงานเกินจริง (นับเวลาจริง ไม่ใช่วันในเกม)', sponsorDef('padaeng').hours >= 24);

  // เซฟเก่า v6 อัปเกรดได้
  const v6 = JSON.parse(JSON.stringify(g)); v6.v = 6; delete v6.social.sponsor; for (const ph of v6.social.album) delete ph.tags;
  const up = migrate(v6)!;
  check('เซฟ v6 อัปเกรดเป็นปัจจุบัน มีสปอนเซอร์และป้ายรูป', up.v === 8 && !!up.social.sponsor && up.social.album.every(p => Array.isArray(p.tags)));
  // v7 → v8: ลูกบอล/ไม้ตกแมวที่วางในฉาก ย้ายเข้ากล่องของเล่น
  const v7 = JSON.parse(JSON.stringify(g)); v7.v = 7; delete v7.toys; delete v7.expand;
  v7.items = [{ uid: 900, key: 'ball', x: 60, lane: 0, fill: 0, room: 'terrace' }, { uid: 901, key: 'bed', x: 80, lane: 0, fill: 0, room: 'terrace' }];
  for (const q of v7.pets) { delete q.toyDay; delete q.toysToday; }
  const u8 = migrate(v7)!;
  check('เซฟ v7: ลูกบอลย้ายเข้ากล่องของเล่น เบาะยังอยู่ ต่อเติม 0', u8.v === 8 && u8.toys.length === 1 && u8.toys[0].left === 15 && u8.items.length === 1 && u8.expand === 0);
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
