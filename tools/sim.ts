// จำลองเล่นเพื่อเช็กสมดุล — `npm run sim` (CI ใช้ `--strict` ให้ล้มถ้าไม่ผ่านเป้า)
// เป้า v0.1:
//  1. ผู้เล่นที่ดูแลปกติไม่ป่วยเลย
//  2. ปิดเกม 23 ชั่วโมงแล้วปลอดภัย
//  3. โหมดปกติ ละเลย 4 วันจริงแล้วหนีแต่ไม่ตาย
//  4. ผู้ติดตามไม่โตแบบทวีคูณ (รอขั้น 5 ช่องโซเชียล)
// หมายเหตุ: ยังไม่มีรายได้จนกว่าจะถึงขั้น 5 → sim ให้เงินไม่จำกัด เพื่อดูแค่เรื่องการดูแล
import { BALANCE as B, type Mode } from '../src/engine/balance';
import { BREEDS } from '../src/engine/content';
import { adopt, bathe, canTrain, catchUpOffline, coax, feed, newGame, play, routineCare, tickOnline, train, treat, vaccinate, type GameState } from '../src/engine/core';
import { careFor, dueItems, vaccinesFor } from '../src/engine/health';
import { buyFurniture, buySupply, cleanPoop, emptyToilet, furnitureOf, placeItem } from '../src/engine/home';
import { breedOf } from '../src/engine/content';
import { addPhoto, post, postsLeft } from '../src/engine/social';
import { acceptOffer, declineOffer, photoFits, sponsorDef } from '../src/engine/sponsor';
import { isSick, type Pet } from '../src/engine/pet';
import { nextRandom } from '../src/engine/rng';
import { realHoursOffline } from '../src/engine/time';

const strict = process.argv.includes('--strict');
const H = 3600 * 1000, MIN = 60 * 1000;
let failed = 0;
const goal = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
  if (!ok) failed++;
};

function fresh(mode: Mode, seed: number, breed: string, vaccinated = false) {
  const g = newGame(mode, seed, 0);
  g.money = 1e12;
  const pet = adopt(g, breed, 'น้อน').pet!;
  if (vaccinated) upToDate(g, pet);
  // ห้องน้ำตามชนิด (นกเดินอิสระ ไม่มีกรง)
  const toilet = { dog: 'peepad', cat: 'litter', bird: null }[breedOf(breed).species];
  if (toilet) { const it = buyFurniture(g, toilet).item!; placeItem(g, it.uid, 100); }
  return { g, id: pet.id };
}
/** ทำให้วัคซีนและการดูแลประจำครบ ณ วันนี้ (น้องที่ได้รับการดูแลมาดี) */
function upToDate(g: GameState, p: Pet) {
  for (const v of vaccinesFor(p)) p.health.vax[v.key] = { doses: v.series, last: p.careClock };
  for (const c of careFor(p)) p.health.care[c.key] = p.careClock;
  p.born -= 20; // พ้นวัยลูกสัตว์ที่ต้องถ่ายพยาธิถี่
}

/** ผู้เล่นดูแลปกติ: เปิดเกมแล้วทำครบทุกอย่างที่ควรทำ */
function careSession(g: GameState, now: number, minutes: number, rngHits: { rng: number }): number {
  const evs = catchUpOffline(g, now).events; let sick = evs.filter(e => e.type === 'sick').length;
  for (const e of evs) if (e.type === 'sick' && process.env.DBG) console.log('DBG sick', e.disease, g.pets[0]?.breed, (g.day - g.pets[0]?.born).toFixed(1));
  const doCare = () => {
    for (const po of [...g.poops]) cleanPoop(g, po.id);
    for (const it of g.items) if (it.fill > 0) {
      const sup = furnitureOf(it.key).supply;
      if (sup && !(g.supplies[sup] > 0)) buySupply(g, sup);
      emptyToilet(g, it.uid);
    }
    for (const p of [...g.pets]) {
      if (p.status === 'away') coax(g, p.id);
      if (p.status !== 'home') continue;
      if (isSick(p)) treat(g, p.id);
      const due = dueItems(p, g.day);
      for (const v of due.vax) vaccinate(g, p.id, v.key);
      for (const c of due.care) routineCare(g, p.id, c.key);
      if (p.full < 0.7) feed(g, p.id, 'kibble');
      if (p.clean < 0.5 && g.day >= p.health.postVaxUntil) bathe(g, p.id);
      for (let i = 0; i < B.playsPerDay; i++) play(g, p.id);
      if (canTrain(g, p)) train(g, p.id, 3 + Math.floor(nextRandom(rngHits) * 3));
    }
  };
  doCare();
  let t = now;
  for (let m = 0; m < minutes; m++) {
    t += MIN;
    sick += tickOnline(g, 60, t).filter(e => e.type === 'sick').length;
    if (m % 10 === 9) doCare();
  }
  return sick;
}

/** ผู้เล่นดูแลดีถ่ายรูปตามจังหวะชัตเตอร์ แล้วโพสต์รูปที่ดีที่สุด */
function socialSession(g: GameState, r: { rng: number }) {
  const n = 2 + Math.floor(nextRandom(r) * 2);
  const labels: [string, string][] = [['นอนหลับ', 'sleep'], ['กินข้าว', 'eat'], ['เล่น', 'play'], ['บนม้านั่ง', 'high'], ['อาบน้ำ', 'bath']];
  // รับงานสปอนเซอร์ที่ทำได้ (ผู้เล่นจริงจะไม่รับโจทย์ที่รู้ว่าทำไม่ได้ · sim ถ่ายได้แค่ระดับทั่วไป/ดี)
  const of = g.social.sponsor.offer;
  if (of && !g.social.sponsor.active) {
    const d = sponsorDef(of.key);
    if (['eat', 'play', 'high', 'bath', 'sleep', 'healthy', 'any'].includes(d.quest) && d.minTier <= 1) acceptOffer(g); else declineOffer(g);
  }
  // มีงานค้าง: ผู้เล่นตั้งใจสร้างจังหวะตามโจทย์ (ให้อาหาร/เล่น/อาบน้ำ แล้วถ่าย) รอบละ 1 รูป
  const act = g.social.sponsor.active;
  if (act && g.pets.length) {
    const q = sponsorDef(act.key).quest;
    if (q === 'eat' || q === 'play' || q === 'bath') addPhoto(g, { tier: nextRandom(r) < 0.35 ? 1 : 0, label: 'งาน', kind: q, petIds: [g.pets[0].id] });
  }
  for (let i = 0; i < n && g.pets.length; i++) {
    const [label, kind] = labels[Math.floor(nextRandom(r) * labels.length)];
    addPhoto(g, { tier: nextRandom(r) < 0.35 ? 1 : 0, label, kind, petIds: [g.pets[0].id] });
  }
  while (postsLeft(g) > 0) {
    const open = g.social.album.filter(p => !p.posted);
    const best = open.find(p => photoFits(g, p)) ?? open.sort((a, b) => b.score - a.score)[0];
    if (!best) break;
    post(g, best.id);
  }
}

// ---------- เป้า 1: ดูแลปกติไม่ป่วย + รายงานอายุขัยเป็นวันจริง ----------
{
  const SESSIONS: [number, number][] = [[8, 15], [12.5, 10], [20, 30]]; // [ชั่วโมงที่เปิด, นาที] ≈ 55 นาที/วัน
  let sickTotal = 0, runs = 0;
  const lifeRealDays: Record<string, number[]> = {};
  for (let seed = 1; seed <= 40; seed++) {
    for (const br of BREEDS) {
      const { g } = fresh('normal', seed * 7919 + br.key.length, br.key);
      const hits = { rng: seed };
      let sick = 0, d = 0;
      for (; d < 60 && g.pets.length; d++) {
        for (const [h, mins] of SESSIONS) sick += careSession(g, d * 24 * H + h * H, mins, hits);
      }
      if (g.heaven[0]) (lifeRealDays[br.key] ??= []).push(d);
      sickTotal += sick; runs++;
    }
  }
  goal('1. ดูแลปกติไม่ป่วยเลย', sickTotal === 0, `${runs} รอบ (8 สายพันธุ์ × 40 seed) ป่วยรวม ${sickTotal} ครั้ง`);
  console.log('   อายุขัยจริงเมื่อเปิดเกม ~55 นาที/วัน (เฉลี่ย 40 seed):');
  for (const br of BREEDS) {
    const xs = lifeRealDays[br.key] ?? [];
    const avg = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    console.log(`     ${br.name.padEnd(14)} อายุขัย ${br.life[0]}–${br.life[1]} วันในเกม ≈ ${avg.toFixed(1)} วันจริง`);
  }
}

// ---------- เป้า 2: ปิดเกม 23 ชั่วโมงปลอดภัย ----------
{
  let unsafe = 0, minFull = 1;
  for (let seed = 1; seed <= 200; seed++) {
    const br = BREEDS[seed % BREEDS.length];
    const { g, id } = fresh('normal', seed, br.key, true);
    feed(g, id, 'rice'); bathe(g, id);
    catchUpOffline(g, 23 * H);
    const p = g.pets.find(x => x.id === id);
    if (!p || p.status !== 'home' || isSick(p) || p.full < B.hungryBelow) unsafe++;
    if (p) minFull = Math.min(minFull, p.full);
  }
  goal('2. ปิดเกม 23 ชม.ปลอดภัย', unsafe === 0, `200 รอบ ไม่ปลอดภัย ${unsafe} · อิ่มต่ำสุดตอนกลับมา ${minFull.toFixed(2)}`);
}

// ---------- เป้า 3: ละเลย 4 วันจริง — ปกติหนี · เข้มตาย ----------
{
  const outcome = (mode: Mode) => {
    const tally = { home: 0, away: 0, dead: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const br = BREEDS[seed % BREEDS.length];
      const { g, id } = fresh(mode, seed, br.key, true);
      feed(g, id, 'rice'); bathe(g, id);
      catchUpOffline(g, 4 * 24 * H);
      const p = g.pets.find(x => x.id === id);
      if (!p) tally.dead++; else if (p.status === 'away') tally.away++; else tally.home++;
    }
    return tally;
  };
  const n = outcome('normal'), h = outcome('hard');
  goal('3. โหมดปกติ ละเลย 4 วันจริง → หนีแต่ไม่ตาย', n.away === 200, `หนี ${n.away} · อยู่บ้าน ${n.home} · ตาย ${n.dead}`);
  goal('   โหมดเข้ม ละเลย 4 วันจริง → ตาย', h.dead === 200, `ตาย ${h.dead} · หนี ${h.away} · อยู่บ้าน ${h.home}`);
}

// ---------- รายงาน: ปิดเกมนานแค่ไหนถึงเกิดอะไร (ให้อาหารเต็มก่อนปิด) ----------
{
  const decay = B.fullDecay * B.offlineNeedsMult;
  const hungryAt = (1 - B.hungryBelow) / decay;
  const riskAt = hungryAt + B.riskAfterDays / B.offlineNeedsMult;
  const starveAt = 1 / decay;
  const neglectAt = starveAt + B.starveLimit / B.offlineNeedsMult;
  const row = (label: string, d: number) => console.log(`     ${label.padEnd(22)} ${d.toFixed(1).padStart(5)} วันในเกม ≈ ${realHoursOffline(d).toFixed(0).padStart(3)} ชม.จริง`);
  console.log('   ไทม์ไลน์ตอนปิดเกม (ป้อนอาหารเต็มก่อนปิด · เพดาน ' + B.offlineMaxDays + ' วัน ≈ ' + realHoursOffline(B.offlineMaxDays).toFixed(0) + ' ชม.):');
  row('เริ่มหิว', hungryAt);
  row('เริ่มเสี่ยงป่วย', riskAt);
  row('อิ่มหมด (ซึม)', starveAt);
  row('หนี / ตาย (โหมดเข้ม)', neglectAt);
}

// ---------- รายงาน: ผู้เล่นขี้ลืม (วันละครั้ง 10 นาที · ข้าวคลุกปลาทู · อาบน้ำเมื่อสกปรกมาก · บางวันลืมเปิด · ไม่เคยพาไปฉีดวัคซีน) ----------
{
  let sick = 0, runaway = 0, lives = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const br = BREEDS[seed % BREEDS.length];
    const { g } = fresh('normal', seed, br.key);
    const r = { rng: seed * 31 };
    let t = 0;
    for (let d = 0; d < 30 && g.pets.length; d++) {
      if (nextRandom(r) < 0.25) continue; // ลืมเปิดเกมวันนี้
      t = d * 24 * H + 21 * H;
      const ev = catchUpOffline(g, t).events;
      sick += ev.filter(e => e.type === 'sick').length;
      runaway += ev.filter(e => e.type === 'runaway').length;
      for (const p of [...g.pets]) {
        if (p.status === 'away') coax(g, p.id);
        if (isSick(p)) treat(g, p.id);
        feed(g, p.id, 'rice');
        if (p.clean < 0.2) bathe(g, p.id);
      }
      for (let m = 0; m < 10; m++) { t += MIN; sick += tickOnline(g, 60, t).filter(e => e.type === 'sick').length; }
    }
    lives++;
  }
  console.log(`   ผู้เล่นขี้ลืม 30 วันจริง (100 ตัว): ป่วยเฉลี่ย ${(sick / lives).toFixed(2)} ครั้ง/ตัว · หนีเฉลี่ย ${(runaway / lives).toFixed(2)} ครั้ง/ตัว`);
}

// ---------- รายงาน: อึ ----------
{
  let floor = 0, toilet = 0;
  for (let seed = 1; seed <= 40; seed++) for (const br of BREEDS.filter(b => b.species !== 'bird')) {
    const { g, id } = fresh('normal', seed, br.key, true);
    for (let d = 0; d < 30; d++) {
      feed(g, id, 'kibble');
      for (const e of catchUpOffline(g, (d + 1) * 8 * H).events) if (e.type === 'poop') { if (e.toilet === null) floor++; else toilet++; }
      for (const po of [...g.poops]) cleanPoop(g, po.id);
      for (const it of g.items) { if (it.fill) { buySupply(g, furnitureOf(it.key).supply!); emptyToilet(g, it.uid); } }
    }
  }
  console.log(`   ขับถ่าย หมา/แมวที่มีห้องน้ำ (วัยเด็ก ยังไม่ฝึก): เข้าห้องน้ำ ${Math.round(toilet / (toilet + floor) * 100)}% · บนพื้น ${Math.round(floor / (toilet + floor) * 100)}%`);
}

// ---------- เป้า 4–5: เพจ — ผู้ติดตามไม่โตทวีคูณ · เงินพอใช้ดูแลน้อง (เริ่มจากเงินตั้งต้นจริง) ----------
{
  const SESSIONS: [number, number][] = [[8, 15], [12.5, 10], [20, 30]];
  const fans15: number[] = [], fans30: number[] = [], fans60: number[] = [], money: number[] = [];
  let broke = 0, runs = 0;
  const spShare: number[] = [], spDone: number[] = [], spFail: number[] = [];
  for (let seed = 1; seed <= 30; seed++) for (const br of BREEDS) {
    const { g } = fresh('normal', seed * 31 + 7, br.key);
    g.money = B.startMoney - (g.items.length ? 0 : 0); // เงินจริง (ห้องน้ำซื้อไปแล้วใน fresh ด้วยเงินไม่จำกัด)
    const r = { rng: seed }, hits = { rng: seed + 99 };
    let minMoney = Infinity;
    for (let d = 0; d < 60; d++) {
      if (!g.pets.length) adopt(g, br.key, 'น้อน', 0);
      for (const [h, mins] of SESSIONS) {
        careSession(g, d * 24 * H + h * H, mins, hits);
        socialSession(g, r);
        minMoney = Math.min(minMoney, g.money);
      }
      if (d === 14) fans15.push(g.social.followers);
      if (d === 29) fans30.push(g.social.followers);
    }
    fans60.push(g.social.followers); money.push(g.money);
    const sp = g.social.sponsor;
    spShare.push(sp.earned / Math.max(1, g.social.earned)); spDone.push(sp.rep); spFail.push(sp.failed);
    if (minMoney < 0) broke++;
    runs++;
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const g1 = avg(fans15), g2 = avg(fans30) - avg(fans15), g3 = avg(fans60) - avg(fans30);
  goal('4. ผู้ติดตามไม่โตทวีคูณ', g3 / 30 < (g2 / 15) * 1.2 && g2 / 15 < g1 / 15 * 1.6,
    `เฉลี่ยวันละ +${(g1 / 15).toFixed(0)} (วัน 1–15) · +${(g2 / 15).toFixed(0)} (16–30) · +${(g3 / 30).toFixed(0)} (31–60) · ครบ 60 วัน ${avg(fans60).toFixed(0)} คน`);
  const share = avg(spShare);
  goal('6. สปอนเซอร์เป็นรายได้เสริม ไม่ใช่รายได้หลัก (10–45% ของรายได้เพจ)', share > 0.1 && share < 0.45,
    `สัดส่วน ${(share * 100).toFixed(0)}% · ทำสำเร็จเฉลี่ย ${avg(spDone).toFixed(1)} งาน · ไม่ทัน ${avg(spFail).toFixed(1)} งาน ใน 60 วัน`);
  goal('5. ผู้เล่นดูแลดีมีเงินพอ (ไม่ติดลบ)', broke === 0, `${runs} รอบ ติดลบ ${broke} · เงินเฉลี่ยตอนจบ ${avg(money).toFixed(0)}`);
}

if (failed) {
  console.error(`${strict ? '❌' : '⚠'} sim ไม่ผ่าน ${failed} เป้า`);
  if (strict) process.exit(1);
} else console.log('✓ sim ผ่านทุกเป้า');
