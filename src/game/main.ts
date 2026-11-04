// บ้านน้อน — หน้าจอหลัก: เชื่อมเครื่องยนต์ ฉาก HUD และป๊อปอัป
import './game.css';
import { BALANCE as B, type Mode } from '../engine/balance';
import { BREEDS, FOODS, breedOf } from '../engine/content';
import {
  adopt, advance, bathe, canTrain, catchUpOffline, coax, daysUntilTrain, feed, newGame, petById, play, routineCare, tickOnline, train, treat, vaccinate,
  type GameEvent, type GameState,
} from '../engine/core';
import { careFor, careState, diseaseOf, dueItems, HEALTH, vaccineState, vaccinesFor, type ItemState } from '../engine/health';
import { isPostVax, isSick, mood, petAge, petStage, type Pet } from '../engine/pet';
import { calendar, nightness, SEASONS } from '../engine/time';
import { Scene } from './scene';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings } from './store';
import { applyTheme, THEMES } from './themes';
import { runTraining } from './train';
import { petPitch, sfx } from './sound';
import { itemThumb } from './furniture';
import { CHANGELOG, VERSION } from './changelog';
import { checkCode } from './codes';
import { buyFurniture, buySupply, cleanPoop, emptyToilet, furnitureOf, placeItem, SHOP, storeItem, supplyOf, toiletCap, type Furniture } from '../engine/home';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
/** ?speed=60 หรือรหัสเร่งเวลา: เร่งเวลาตอนเปิดเกม (ทดสอบ) */
const urlSpeed = Number(params.get('speed')) || 0;

let g: GameState | null = loadGame();
const settings = loadSettings();
applyTheme(settings.theme);
sfx.enabled = settings.sound;
// เบราว์เซอร์อนุญาตให้เล่นเสียงหลังผู้เล่นแตะจอครั้งแรก
document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
const voice = (p: Pet, mood: 'happy' | 'normal' | 'sad' = 'normal', delayMs = 0) => {
  if (!g) return;
  const st = petStage(p, g.day);
  setTimeout(() => sfx.voice(breedOf(p.breed), petPitch(p.id, st), mood), delayMs);
};
let selId: number | null = null;

// ---------- ไอคอนจากชีต icons.png (4×3 ช่องละ 48×37) ----------
function iconize(el: HTMLElement) {
  const i = Number(el.dataset.i), w = el.offsetWidth || 30, h = el.offsetHeight || 23;
  el.style.backgroundImage = 'url(./art/icons.png)';
  el.style.backgroundSize = `${w * 4}px ${h * 3}px`;
  el.style.backgroundPosition = `${-(i % 4) * w}px ${-Math.floor(i / 4) * h}px`;
}
document.querySelectorAll<HTMLElement>('.ic2').forEach(iconize);
// ---------- ไอคอนปุ่มจากชีตไอเทม ----------
for (const el of document.querySelectorAll<HTMLElement>('.ic')) {
  const i = Number(el.dataset.ic);
  el.style.backgroundImage = 'url(./art/items.png)';
  el.style.backgroundPosition = `${-(i % 4) * 30}px ${-Math.floor(i / 4) * 25.23}px`;
}

// ---------- ฉาก ----------
const scene = new Scene($<HTMLCanvasElement>('scene'), {
  onTapPet: id => { select(id); doPlay(id); },
  onHoldPet: id => { select(id); const p = g && petById(g, id); if (p) voice(p); showStatus(id); },
  onTapPoop: id => { if (g && cleanPoop(g, id).ok) { sfx.sweep(); toast('เก็บกวาดแล้ว ✨', 1200); } },
  onTapItem: uid => (scene.editMode ? itemMenu(uid) : useItem(uid)),
  onMoveItem: (uid, x, lane) => { if (g) placeItem(g, uid, x, lane); },
});
document.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb]').forEach(cv => itemThumb(cv, cv.dataset.thumb!));

// สำหรับทดสอบอัตโนมัติ
(window as unknown as { __bn: unknown }).__bn = { scene, sfx, BREEDS, get g() { return g; } };

// ---------- ตัวช่วย ----------
const sel = (): Pet | undefined => (g && selId !== null ? petById(g, selId) : undefined);
const nameOf = (id: number) => g?.pets.find(p => p.id === id)?.name ?? g?.heaven.find(h => h.id === id)?.name ?? 'น้อง';
const fmtMoney = (v: number) => Math.floor(v).toLocaleString('th-TH');
const STAGES = ['วัยเด็ก', 'วัยโต', 'วัยชรา'];
/** เหรียญตราอุ้งเท้า */
const COIN = '<img class="coin" src="./art/coin.png" alt="เหรียญ" />';

let toastTimer = 0;
function toast(msg: string, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('on'), ms);
}
function floatAt(id: number, text: string) {
  const p = scene.screenPos(id); if (!p) return;
  const el = document.createElement('div');
  el.className = 'float'; el.textContent = text;
  el.style.left = `calc(${p.x * 100}% - 9px)`; el.style.top = `calc(${p.y * 100}% - 10px)`;
  $('floats').appendChild(el); setTimeout(() => el.remove(), 1400);
}

// ---------- ป๊อปอัป ----------
const pop = $('pop'), sheet = $('sheet');
function openPop(html: string, full = false) {
  sheet.innerHTML = html;
  pop.classList.toggle('full', full);
  if (!pop.classList.contains('on')) sfx.open();
  pop.classList.add('on');
  sheet.querySelector<HTMLElement>('.x')?.addEventListener('click', closePop);
  return sheet;
}
function closePop() { if (pop.classList.contains('on')) sfx.close(); pop.classList.remove('on'); sheet.innerHTML = ''; }
pop.addEventListener('click', e => { if (e.target === pop && g) closePop(); });
const head = (title: string, closable = true) => `<h3><span>${title}</span>${closable ? '<button class="x" aria-label="ปิด">✕</button>' : ''}</h3>`;

// ---------- เริ่มเกม / รับน้อง ----------
function thumb(cv: HTMLCanvasElement, art: string) {
  const im = new Image(); im.src = `./art/${art}.png`;
  im.onload = () => {
    const fw = im.naturalWidth / 4, fh = im.naturalHeight / 3, ctx = cv.getContext('2d')!;
    cv.width = fw; cv.height = fh; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, 0, fh, fw, fh, 0, 0, fw, fh);
  };
}
function chooseBreed(title: string, price: number, done: (breed: string, name: string) => void, closable = true) {
  const s = openPop(`${head(title, closable)}<p>${price ? `ค่ารับเลี้ยง ${price} · ` : ''}เลือกน้องที่อยากเลี้ยง</p>
    <div class="grid">${BREEDS.map(b => `<button class="opt" data-k="${b.key}"><canvas></canvas>${b.name.replace(/^(หมา|แมว|นก)/, '')}</button>`).join('')}</div>`, true);
  s.querySelectorAll<HTMLElement>('[data-k]').forEach(el => {
    thumb(el.querySelector('canvas')!, breedOf(el.dataset.k!).art);
    el.addEventListener('click', () => nameStep(el.dataset.k!, done, closable));
  });
}
function nameStep(breed: string, done: (breed: string, name: string) => void, closable: boolean) {
  const b = breedOf(breed);
  const s = openPop(`${head(b.name, closable)}<p>${b.desc}</p><p>ตั้งชื่อน้อง</p>
    <input id="nm" maxlength="14" value="น้อง${['ข้าวตู', 'ถั่วแดง', 'ส้มโอ', 'มะลิ', 'ทองดี', 'ขนมปัง'][Math.floor(Math.random() * 6)]}" />
    <button class="cta" id="ok">รับน้องมาเลี้ยง</button><button class="cta ghost" id="back">เลือกตัวอื่น</button>`, true);
  const nm = s.querySelector<HTMLInputElement>('#nm')!;
  s.querySelector('#ok')!.addEventListener('click', () => done(breed, nm.value.trim() || 'น้อง'));
  s.querySelector('#back')!.addEventListener('click', () => chooseBreed('เลือกน้อง', 0, done, closable));
}
function welcome() {
  const s = openPop(`${head('ยินดีต้อนรับสู่บ้านน้อน', false)}
    <p>เรือนไทยริมคลองหลังนี้รอน้องตัวแรกอยู่ เลือกความเข้มข้นของการเลี้ยงก่อน</p>
    <button class="opt" data-m="normal"><span>โหมดปกติ<br><small>ถ้าละเลยนานมาก น้องจะหนีไปบ้านป้า ง้อกลับได้</small></span>›</button>
    <button class="opt" data-m="hard"><span>โหมดเข้ม<br><small>ถ้าละเลยนานมาก น้องจะจากไปจริงๆ</small></span>›</button>`, true);
  s.querySelectorAll<HTMLElement>('[data-m]').forEach(el => el.addEventListener('click', () => {
    const mode = el.dataset.m as Mode;
    chooseBreed('เลือกน้องตัวแรก', 0, (breed, name) => {
      g = newGame(mode, (Math.random() * 2 ** 32) >>> 0, Date.now());
      const r = adopt(g, breed, name);
      selId = r.pet!.id; scene.centerOn(selId);
      saveGame(g); closePop();
      sfx.jingle(); voice(r.pet!, 'happy', 700);
      toast(`${name} มาอยู่บ้านแล้ว แตะน้องเพื่อเล่นด้วย`);
    }, false);
  }));
}

// ---------- คำสั่ง ----------
function select(id: number) { selId = id; scene.centerOn(id); }
function need(): Pet | undefined {
  const p = sel();
  if (!p) { toast('ยังไม่มีน้องในบ้าน'); return; }
  if (p.status !== 'home') { toast(`${p.name} ไม่อยู่บ้าน`); return; }
  return p;
}
function doPlay(id: number) {
  if (!g) return;
  const r = play(g, id);
  if (!r.ok) { toast(r.reason!); const p = petById(g, id); if (p) voice(p); return; }
  scene.react(id, 'happy'); floatAt(id, '♥');
  const p = petById(g, id); if (p) voice(p, 'happy');
}
function doFeed() {
  const p = need(); if (!p || !g) return;
  const s = openPop(`${head(`ให้อาหาร ${p.name}`)}${FOODS.map(f => `<button class="opt" data-f="${f.key}" ${g!.money < f.price ? 'disabled' : ''}><span>${f.name}</span><span>${f.price}${COIN}</span></button>`).join('')}`);
  s.querySelectorAll<HTMLElement>('[data-f]').forEach(el => el.addEventListener('click', () => {
    const r = feed(g!, p.id, el.dataset.f!);
    closePop();
    if (!r.ok) { toast(r.reason!); return; }
    scene.react(p.id, 'eat', el.dataset.f!); floatAt(p.id, '😋');
    sfx.munch(); voice(p, 'happy', 900);
  }));
}
let batheWarnUntil = 0;
function doBathe() {
  const p = need(); if (!p || !g) return;
  if (p.clean > 0.92) { toast(`${p.name} ยังสะอาดอยู่`); return; }
  if (isPostVax(p, g.day) && performance.now() > batheWarnUntil) {
    batheWarnUntil = performance.now() + 4000;
    toast('เพิ่งฉีดวัคซีน ควรงดอาบน้ำ 1–2 วัน · กดอีกครั้งถ้าจะอาบจริง', 4000); return;
  }
  const r = bathe(g, p.id); scene.react(p.id, 'happy'); floatAt(p.id, '🫧');
  sfx.bubbles();
  if (r.shampoo) toast(`ใช้แชมพู ${p.name} หอมสะอาดนานขึ้น`, 2000);
  if (r.fever) { toast(`${p.name} ตัวรุมๆ เป็นไข้หลังฉีดวัคซีน พาไปคลินิกนะ`, 4500); voice(p, 'sad', 900); }
  else voice(p, 'happy', 700);
}
function doTrain() {
  const p = need(); if (!p || !g) return;
  if (isSick(p)) { toast(`${p.name} ป่วยอยู่ ฝึกไม่ได้`); return; }
  if (!canTrain(g, p)) { toast(`ฝึกได้อีกใน ${Math.ceil(daysUntilTrain(g, p))} วัน`); return; }
  openPop('');
  runTraining(sheet, p.name, hits => {
    const before = p.trained;
    const r = train(g!, p.id, hits); closePop();
    toast(hits ? `${p.name} เก่งขึ้น +${Math.round((p.trained - before) * 100)}%${r.treat ? ' (ใช้ขนมฝึก)' : ''}` : 'รอบนี้พลาดหมด ไว้ลองใหม่สัปดาห์หน้า');
    if (hits) { scene.react(p.id, 'happy'); floatAt(p.id, '★'); voice(p, 'happy'); }
  });
}
function stateText(st: ItemState, series = 1): string {
  switch (st.s) {
    case 'notyet': return `ยังเด็ก อีก ${Math.ceil(st.inDays)} วัน`;
    case 'series': return `เข็ม ${st.dose - 1}/${series} · เข็มถัดไปอีก ${Math.ceil(st.inDays)} วัน`;
    case 'ok': return `ครบ · อีก ${Math.ceil(st.inDays)} วัน`;
    case 'due': return st.dose ? `ถึงกำหนดเข็ม ${st.dose}/${series}` : 'ถึงกำหนด';
    case 'overdue': return st.dose ? `เลยกำหนด! เข็ม ${st.dose}/${series}` : 'เลยกำหนด!';
  }
}
function doClinic() {
  const p = need(); if (!p || !g) return;
  const day = g.day, due = dueItems(p, day);
  const sick = p.health.disease ? diseaseOf(p.health.disease) : null;
  const canDo = (st: ItemState) => st.s === 'due' || st.s === 'overdue';
  const vax = vaccinesFor(p).map(v => { const st = vaccineState(p, v, day); return `<div class="opt"><span>${v.name}<br><small>${v.covers} · ${stateText(st, v.series)}</small></span>${canDo(st) ? `<button class="cta mini" data-v="${v.key}" ${g!.money < v.price ? 'disabled' : ''}>ฉีด ${v.price}</button>` : '<span>✓</span>'}</div>`; }).join('');
  const care = careFor(p).map(c => { const st = careState(p, c, day); return `<div class="opt"><span>${c.name}<br><small>ทุก ${c.every} วัน · ${stateText(st)}</small></span>${canDo(st) ? `<button class="cta mini" data-c="${c.key}" ${g!.money < c.price ? 'disabled' : ''}>ทำ ${c.price}</button>` : '<span>✓</span>'}</div>`; }).join('');
  const total = [...due.vax, ...due.care].reduce((a, x) => a + x.price, 0);
  const s = openPop(`${head(`คลินิกสัตว์ · ${p.name}`)}
    ${sick ? `<div class="alert"><b>อาการ:</b> ${sick.symptom}<br><b>หมอวินิจฉัย:</b> ${sick.name}<br><small>ไม่รักษาเกิน ${sick.limit} วัน น้องจะ${g.mode === 'hard' ? 'จากไป' : 'หนีไปบ้านป้า'}</small>
      <button class="cta" id="treat" ${g.money < sick.price ? 'disabled' : ''}>รักษาด้วย${sick.med} ${sick.price}${COIN}</button></div>` : ''}
    ${vax ? `<p><b>สมุดวัคซีน</b></p>${vax}` : `<p><b>สมุดวัคซีน</b><br><small>นกไม่มีวัคซีนประจำ ดูแลด้วยการถ่ายพยาธิและวิตามิน</small></p>`}
    <p><b>ดูแลประจำ</b></p>${care}
    ${total && !sick ? `<button class="cta" id="all" ${g.money < total ? 'disabled' : ''}>ทำที่ถึงกำหนดทั้งหมด ${total}${COIN}</button>` : ''}
    <p><small>${HEALTH.note}</small></p>`, true);
  const after = (r: { ok: boolean; reason?: string }, msg: string) => { if (!r.ok) toast(r.reason!); else toast(msg); doClinic(); };
  s.querySelector('#treat')?.addEventListener('click', () => {
    const r = treat(g!, p.id);
    if (r.ok) { scene.react(p.id, 'happy'); sfx.coin(); voice(p, 'happy', 400); }
    after(r, `${p.name} หายป่วยแล้ว`);
  });
  s.querySelectorAll<HTMLElement>('[data-v]').forEach(el => el.addEventListener('click', () => { sfx.syringe(); voice(p, 'sad', 250); after(vaccinate(g!, p.id, el.dataset.v!), 'ฉีดแล้ว น้องอาจซึม 1–2 วัน ควรงดอาบน้ำก่อน'); }));
  s.querySelectorAll<HTMLElement>('[data-c]').forEach(el => el.addEventListener('click', () => { sfx.coin(); after(routineCare(g!, p.id, el.dataset.c!), 'เรียบร้อย'); }));
  s.querySelector('#all')?.addEventListener('click', () => {
    let ok = true;
    for (const v of due.vax) ok = vaccinate(g!, p.id, v.key).ok && ok;
    for (const c of due.care) ok = routineCare(g!, p.id, c.key).ok && ok;
    if (due.vax.length) { sfx.syringe(); voice(p, 'sad', 250); } else sfx.coin();
    after({ ok }, due.vax.length ? 'ครบแล้ว น้องอาจซึม 1–2 วัน ควรงดอาบน้ำก่อน' : 'เรียบร้อย');
  });
}
function soon(title: string, text: string) { openPop(`${head(title)}<p>${text}</p><p><small>กำลังสร้าง · มาในอัปเดตถัดไป</small></p>`); }
function showStatus(id: number) {
  if (!g) return;
  const p = petById(g, id); if (!p) return;
  const b = breedOf(p.breed), pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: [string, string][] = [
    ['สายพันธุ์', b.name], ['วัย', STAGES[petStage(p, g.day)]], ['อายุ', `${Math.floor(petAge(p, g.day))} วัน`],
    ['อิ่ม', pct(p.full)], ['สะอาด', pct(p.clean)], ['ผูกพัน', pct(p.bond)], ['ฝึก', pct(p.trained)],
    ['สุขภาพ', p.status === 'away' ? 'อยู่บ้านป้า' : p.health.disease ? diseaseOf(p.health.disease).name : isPostVax(p, g.day) ? 'ซึมหลังฉีดวัคซีน' : 'แข็งแรง'],
    ['วัคซีน/ดูแลประจำ', (() => { const d = dueItems(p, g.day), n = d.vax.length + d.care.length; return n ? `ถึงกำหนด ${n} รายการ` : 'ครบ'; })()], ['อารมณ์', ['ซึม', 'เฉยๆ', 'ดี', 'ร่าเริง'][Math.min(3, Math.floor(mood(p) * 4))]],
  ];
  openPop(`${head(p.name)}${rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('')}`);
}
function menu() {
  if (!g) return;
  const s = openPop(`${head('เมนู')}
    <button class="opt" id="m-theme"><span>สีตัวเครื่อง</span>›</button>
    <button class="opt" id="m-sound"><span>เสียง</span><span>${settings.sound ? 'เปิด' : 'ปิด'}</span></button>
    <button class="opt" id="m-adopt" ${g.pets.length >= B.maxPets ? 'disabled' : ''}><span>รับน้องเพิ่ม<br><small>${g.pets.length >= B.maxPets ? `บ้านนี้เลี้ยงได้ ${B.maxPets} ตัว` : `ค่ารับเลี้ยง ${B.adoptPrice}${COIN}`}</small></span>›</button>
    <button class="opt" id="m-heaven"><span>สวนสวรรค์สัตว์เลี้ยง<br><small>${g.heaven.length} ตัว</small></span>›</button>
    <button class="opt" id="m-info"><span>เกี่ยวกับเกม<br><small>โหมด${g.mode === 'hard' ? 'เข้ม' : 'ปกติ'}</small></span>›</button>
    <button class="opt" id="m-code"><span>ใส่รหัส</span>›</button>
    <button class="opt" id="m-reset"><span>เริ่มเกมใหม่</span>›</button>
    <button class="ver" id="m-ver">v${VERSION} · ดูสิ่งที่เปลี่ยน</button>`);
  s.querySelector('#m-ver')!.addEventListener('click', changelog);
  s.querySelector('#m-theme')!.addEventListener('click', themePicker);
  s.querySelector('#m-code')!.addEventListener('click', codePrompt);
  s.querySelector('#m-sound')!.addEventListener('click', e => {
    settings.sound = !settings.sound; sfx.enabled = settings.sound; saveSettings(settings);
    (e.currentTarget as HTMLElement).lastElementChild!.textContent = settings.sound ? 'เปิด' : 'ปิด';
    if (settings.sound) sfx.ding();
  });
  s.querySelector('#m-adopt')!.addEventListener('click', () => chooseBreed('รับน้องเพิ่ม', B.adoptPrice, (breed, name) => {
    const r = adopt(g!, breed, name, B.adoptPrice); closePop();
    if (!r.ok) { toast(r.reason!); return; }
    select(r.pet!.id); toast(`${name} มาอยู่บ้านแล้ว`); sfx.jingle(); voice(r.pet!, 'happy', 700);
  }));
  s.querySelector('#m-heaven')!.addEventListener('click', () => openPop(`${head('สวนสวรรค์สัตว์เลี้ยง')}${g!.heaven.length ? g!.heaven.map(h => `<div class="row"><span>${h.name} · ${breedOf(h.breed).name}</span><span>${Math.floor(h.ageDays)} วัน</span></div>`).join('') : '<p>ยังไม่มีน้องตัวไหนจากไป</p>'}`, true));
  s.querySelector('#m-info')!.addEventListener('click', () => openPop(`${head('บ้านน้อน · Baan Non: Klong Life')}<p>เกมเลี้ยงน้องหมา แมว นก ในเรือนไทยริมคลอง</p><p>ตอนปิดเกม เวลายังเดินแต่ช้าลงมาก น้องหิวช้าลงด้วย</p><p><small>เวอร์ชันทดลอง v0.1 · กำลังสร้าง</small></p>`));
  s.querySelector('#m-reset')!.addEventListener('click', () => {
    const c = openPop(`${head('เริ่มเกมใหม่')}<p>น้องทุกตัวและความคืบหน้าทั้งหมดจะหายไป แน่ใจไหม</p><button class="cta" id="yes">เริ่มใหม่</button><button class="cta ghost" id="no">ยกเลิก</button>`);
    c.querySelector('#no')!.addEventListener('click', closePop);
    c.querySelector('#yes')!.addEventListener('click', () => { clearGame(); g = null; selId = null; welcome(); });
  });
}
function codePrompt() {
  const s = openPop(`${head('ใส่รหัส')}<p>รหัสทดสอบหรือรหัสปลดล็อกของพิเศษ</p><input id="code" autocomplete="off" autocapitalize="characters" /><button class="cta" id="go">ตกลง</button>`);
  const inp = s.querySelector<HTMLInputElement>('#code')!;
  inp.focus();
  const go = async () => {
    const eff = await checkCode(inp.value);
    if (!eff || !g) { sfx.miss(); toast('รหัสไม่ถูกต้อง'); return; }
    closePop(); sfx.ding();
    switch (eff) {
      case 'money': g.money += 1000; toast('ได้ 1,000 เหรียญ'); break;
      case 'fast': settings.speed = 60; saveSettings(settings); toast('เร่งเวลา ×60 (ใส่รหัสช้าเพื่อกลับปกติ)', 3500); break;
      case 'slow': settings.speed = 1; saveSettings(settings); toast('เวลากลับเป็นปกติ'); break;
      case 'skip': handle(advance(g, 1)); toast('ข้ามไป 1 วันในเกม'); break;
      case 'heal':
        for (const p of g.pets) { p.health.disease = null; p.sickDays = 0; p.full = 1; p.clean = 1; p.status = 'home'; p.starveDays = 0; }
        g.poops = []; toast('น้องทุกตัวแข็งแรง อิ่ม สะอาด'); break;
      case 'gold':
        if (!settings.unlocks.includes('gold')) settings.unlocks.push('gold');
        settings.theme = 'gold'; applyTheme('gold'); saveSettings(settings); toast('ปลดล็อกสีเครื่อง "ทองคำ" ✦', 3500); break;
    }
  };
  s.querySelector('#go')!.addEventListener('click', go);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') void go(); });
}
function changelog() {
  openPop(`${head(`บ้านน้อน v${VERSION}`)}${CHANGELOG.map(c => `<p class="sec">v${c.v} <small>${c.date}</small></p>${c.items.map(i => `<div class="row"><span>• ${i}</span></div>`).join('')}`).join('')}`, true);
}
function themePicker() {
  const s = openPop(`${head('สีตัวเครื่อง')}<div class="grid">${THEMES.filter(t => !t.locked || settings.unlocks.includes(t.locked)).map(t => `<button class="opt ${t.key === settings.theme ? 'sel' : ''}" data-t="${t.key}"><span class="swatch" style="background:${t.shell};border-color:${t.ink}"></span>${t.name}</button>`).join('')}</div>`, true);
  s.querySelectorAll<HTMLElement>('[data-t]').forEach(el => el.addEventListener('click', () => {
    settings.theme = el.dataset.t!; applyTheme(settings.theme); saveSettings(settings);
    s.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
  }));
}

const ACTIONS: Record<string, () => void> = {
  feed: doFeed, bathe: doBathe, train: doTrain, clinic: doClinic, menu,
  shop: () => shop(), decor: () => setEdit(true),
  page: () => soon('เพจบ้านน้อน', 'ช่องโซเชียลของน้อง: อัลบั้มรูปจากจังหวะชัตเตอร์ โพสต์ ผู้ติดตาม และรายได้จากโฆษณา'),
};
document.querySelectorAll<HTMLElement>('#btns [data-act]').forEach(el => el.addEventListener('click', () => { sfx.click(); if (g) ACTIONS[el.dataset.act!](); }));
$('hud').addEventListener('click', () => { const p = sel(); if (p) showStatus(p.id); });
const cycle = (d: number) => {
  if (!g || !g.pets.length) return;
  const i = g.pets.findIndex(p => p.id === selId);
  select(g.pets[(i + d + g.pets.length) % g.pets.length].id);
};
$('prev').addEventListener('click', () => cycle(-1));
$('next').addEventListener('click', () => cycle(1));
$('chip-time').addEventListener('click', () => { if (!g) return; const c = calendar(g.day); toast(`ปีที่ ${c.year} · ฤดู${SEASONS[c.season]} วันที่ ${c.dayOfSeason}/${B.daysPerSeason}`); });
$('chip-money').addEventListener('click', () => toast('รายได้จากเพจของน้องจะมาในอัปเดตถัดไป'));
$('chip-fans').addEventListener('click', () => toast('ผู้ติดตามเพจบ้านน้อน · เร็วๆ นี้'));

// ---------- ร้าน · จัดบ้าน ----------
const SPECIES_TH: Record<string, string> = { dog: 'หมา', cat: 'แมว', bird: 'นก' };
const KIND_TH: Record<string, string> = { bed: 'ที่นอน', toilet: 'ห้องน้ำ', bowl: 'ชามอาหาร', toy: 'ของเล่น', decor: 'ของแต่งบ้าน' };
function shop() {
  if (!g) return;
  const owned = (k: string) => g!.items.filter(i => i.key === k).length;
  const row = (f: Furniture) => `<div class="shop-row"><canvas data-k="${f.key}"></canvas><span>${f.name}${owned(f.key) ? ` <small style="display:inline">(มี ${owned(f.key)})</small>` : ''}<small>${f.desc}</small><span class="tags">${f.species.length ? f.species.map(x => SPECIES_TH[x]).join(' · ') : 'ทุกตัว'}</span></span><button class="cta mini" data-buy="${f.key}" ${g!.money < f.price ? 'disabled' : ''}>${f.price}${COIN}</button></div>`;
  const kinds = ['bed', 'toilet', 'bowl', 'toy', 'decor'];
  const s = openPop(`${head('เพ็ทช็อปปากซอย')}<p>เงิน ${fmtMoney(g.money)}${COIN} · ซื้อแล้ววางในฉากได้ทันที</p>
    ${kinds.map(k => `<p class="sec">${KIND_TH[k]}</p>${SHOP.furniture.filter(f => f.kind === k).map(row).join('')}`).join('')}
    <p class="sec">ของสิ้นเปลือง</p>
    ${SHOP.supplies.map(su => `<div class="shop-row"><span style="font-size:22px;text-align:center">${{ sand: '🧂', pad: '🧻', shampoo: '🧴', treat: '🦴' }[su.key] ?? '•'}</span><span>${su.name} <small style="display:inline">(เหลือ ${g!.supplies[su.key] ?? 0} ครั้ง)</small><small>${su.desc}</small></span><button class="cta mini" data-sup="${su.key}" ${g!.money < su.price ? 'disabled' : ''}>${su.price}${COIN}</button></div>`).join('')}`, true);
  s.querySelectorAll<HTMLCanvasElement>('canvas[data-k]').forEach(cv => itemThumb(cv, cv.dataset.k!));
  s.querySelectorAll<HTMLElement>('[data-buy]').forEach(el => el.addEventListener('click', () => {
    const r = buyFurniture(g!, el.dataset.buy!);
    if (!r.ok) { toast(r.reason!); return; }
    sfx.buy(); closePop();
    placeItem(g!, r.item!.uid, scene.viewCenter, 0);
    scene.highlight = r.item!.uid;
    setEdit(true);
    toast(`ได้${furnitureOf(r.item!.key).name}แล้ว ลากไปวางตรงที่ชอบ`, 3000);
  }));
  s.querySelectorAll<HTMLElement>('[data-sup]').forEach(el => el.addEventListener('click', () => {
    const r = buySupply(g!, el.dataset.sup!);
    if (!r.ok) { toast(r.reason!); return; }
    sfx.buy(); toast(`ซื้อ${supplyOf(el.dataset.sup!).name}แล้ว`); shop();
  }));
}
function setEdit(on: boolean) {
  scene.editMode = on;
  if (!on) scene.highlight = null;
  $('editbar').classList.toggle('on', on);
  $('hud').style.visibility = on ? 'hidden' : '';
}
$('edit-done').addEventListener('click', () => { setEdit(false); if (g) saveGame(g); });
$('stored').addEventListener('click', () => storedList());
function storedList() {
  if (!g) return;
  const stored = g.items.filter(i => i.x === null);
  const s = openPop(`${head('ของในคลัง')}${stored.length ? stored.map(i => `<div class="shop-row"><canvas data-k="${i.key}"></canvas><span>${furnitureOf(i.key).name}</span><button class="cta mini" data-place="${i.uid}">วาง</button></div>`).join('') : '<p>ไม่มีของเก็บไว้ · ซื้อเพิ่มได้ที่ร้าน</p>'}`);
  s.querySelectorAll<HTMLCanvasElement>('canvas[data-k]').forEach(cv => itemThumb(cv, cv.dataset.k!));
  s.querySelectorAll<HTMLElement>('[data-place]').forEach(el => el.addEventListener('click', () => {
    const uid = Number(el.dataset.place); placeItem(g!, uid, scene.viewCenter, 0); scene.highlight = uid; closePop();
  }));
}
function itemMenu(uid: number) {
  if (!g) return;
  const it = g.items.find(i => i.uid === uid); if (!it) return;
  scene.highlight = uid;
  const f = furnitureOf(it.key);
  const s = openPop(`${head(f.name)}<p>${f.desc}</p>
    <button class="opt" id="lane"><span>ย้ายไป${it.lane ? 'แถวหลัง (ชิดราว)' : 'แถวหน้า'}</span>›</button>
    <button class="opt" id="store"><span>เก็บเข้าคลัง</span>›</button>`);
  s.querySelector('#lane')!.addEventListener('click', () => { placeItem(g!, uid, it.x ?? scene.viewCenter, it.lane ? 0 : 1); closePop(); });
  s.querySelector('#store')!.addEventListener('click', () => { storeItem(g!, uid); closePop(); toast('เก็บเข้าคลังแล้ว'); });
}
/** แตะของในฉาก (โหมดปกติ): ห้องน้ำ = เททิ้ง · อย่างอื่นบอกชื่อ */
function useItem(uid: number) {
  if (!g) return;
  const it = g.items.find(i => i.uid === uid); if (!it) return;
  const f = furnitureOf(it.key), cap = toiletCap(f);
  if (cap > 0) {
    if (it.fill <= 0) { toast(`${f.name} ยังสะอาดอยู่`); return; }
    const r = emptyToilet(g, uid);
    if (!r.ok) { toast(r.reason!, 3000); return; }
    sfx.sweep(); toast(`${f.key === 'litter' ? 'ตักทรายแล้ว' : f.key === 'peepad' ? 'เปลี่ยนแผ่นแล้ว' : 'ล้างถาดแล้ว'} ✨`, 1500);
    return;
  }
  toast(f.name, 1200);
}

// ---------- เหตุการณ์จากเครื่องยนต์ ----------
function handle(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'newDay') continue;
    if (e.type === 'poop') { scene.goPoop(e.petId, e.x); setTimeout(() => sfx.plop(), 900); continue; }
    const name = nameOf(e.petId);
    const pet = g ? petById(g, e.petId) : undefined;
    if (e.type === 'sick') { toast(`${name} ไม่สบาย (${diseaseOf(e.disease).symptom}) พาไปคลินิกนะ`, 4500); sfx.alert(); if (pet) voice(pet, 'sad', 350); }
    else if (e.type === 'runaway') { toast(`${name} หนีไปอยู่บ้านป้าข้างบ้าน`, 4500); sfx.jingle(true); }
    else if (e.type === 'stage') { toast(e.stage === 1 ? `${name} โตเป็นผู้ใหญ่แล้ว` : `${name} เริ่มแก่แล้ว`, 3500); sfx.grow(); if (pet) voice(pet, 'happy', 500); }
    else if (e.type === 'died') {
      sfx.jingle(true);
      openPop(`${head('ลาก่อน')}<p>${e.cause === 'age' ? `${name} จากไปอย่างสงบตามวัย` : `${name} จากไปเพราะไม่มีใครดูแล`}</p><p>น้องไปอยู่สวนสวรรค์สัตว์เลี้ยงแล้ว เปิดดูได้ในเมนู</p>`);
      if (selId === e.petId) selId = null;
    }
  }
  if (g && (selId === null || !petById(g, selId)) && g.pets.length) select(g.pets[0].id);
}

// ---------- HUD ----------
function seg(id: string, v: number, warn = false) {
  const el = $(id), n = Math.ceil(v * 5 - 1e-9);
  if (el.childElementCount !== 5) el.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
  [...el.children].forEach((c, i) => c.classList.toggle('on', i < n));
  el.classList.toggle('warn', warn);
}
function renderHud() {
  if (!g) return;
  const c = calendar(g.day), hh = Math.floor(c.hour), mm = Math.floor((c.hour - hh) * 60 / 10) * 10;
  $('ic-time').dataset.i = nightness(g.day) > 0.5 ? '5' : '4'; iconize($('ic-time'));
  $('time').textContent = `ฤดู${SEASONS[c.season]} วัน ${c.dayOfSeason} · ${hh}:${String(mm).padStart(2, '0')}`;
  $('money').textContent = fmtMoney(g.money);
  const p = sel();
  $('hud').hidden = !p;
  if (p) {
    $('pet-name').textContent = p.name;
    $('pet-idx').textContent = g.pets.length > 1 ? `${g.pets.indexOf(p) + 1}/${g.pets.length}` : '';
    seg('seg-full', p.full, p.full < B.hungryBelow);
    seg('seg-clean', p.clean, p.clean < B.dirtyBelow);
    seg('seg-bond', p.bond);
  }
  $('prev').hidden = $('next').hidden = g.pets.length < 2;
  const home = g.pets.filter(x => x.status === 'home');
  const dots: Record<string, boolean> = {
    feed: home.some(x => x.full < 0.35), bathe: home.some(x => x.clean < 0.3), train: home.some(x => canTrain(g!, x)),
    clinic: home.some(x => isSick(x) || (() => { const d = dueItems(x, g!.day); return d.vax.length + d.care.length > 0; })()),
    shop: false, decor: g.items.some(i => { const f = furnitureOf(i.key); return i.x !== null && toiletCap(f) > 0 && i.fill >= toiletCap(f); }), page: false, menu: false,
  };
  document.querySelectorAll<HTMLElement>('#btns [data-act]').forEach(el => el.querySelector('.dot')!.classList.toggle('on', dots[el.dataset.act!]));
  // ป้ายเมื่อน้องไม่อยู่ / บ้านว่าง
  const banner = $('banner');
  if (p && p.status === 'away') {
    if (!banner.dataset.away || banner.dataset.away !== String(p.id)) {
      banner.dataset.away = String(p.id);
      banner.innerHTML = `${p.name} หนีไปอยู่บ้านป้าข้างบ้าน<button class="cta">ไปง้อกลับ ${B.coaxCost}${COIN}</button>`;
      banner.querySelector('button')!.addEventListener('click', () => {
        const r = coax(g!, p.id);
        if (!r.ok) { toast(r.reason!); return; }
        toast(`${p.name} ยอมกลับบ้านแล้ว แต่ยังงอนอยู่`); delete banner.dataset.away; voice(p, 'normal');
      });
    }
    banner.classList.add('on');
  } else if (!g.pets.length) {
    if (banner.dataset.away !== 'empty') {
      banner.dataset.away = 'empty';
      banner.innerHTML = `บ้านเงียบเหงา<button class="cta">รับน้องใหม่</button>`;
      banner.querySelector('button')!.addEventListener('click', () => chooseBreed('รับน้องใหม่', 0, (breed, name) => {
        const r = adopt(g!, breed, name); closePop(); select(r.pet!.id); delete banner.dataset.away;
      }));
    }
    banner.classList.add('on');
  } else { banner.classList.remove('on'); delete banner.dataset.away; }
}

// ---------- ลูปหลัก ----------
function resume() {
  if (!g) return;
  const { days, events } = catchUpOffline(g, Date.now());
  handle(events);
  if (days >= 1) toast(`ระหว่างที่ไม่อยู่ ผ่านไป ${Math.floor(days)} วันในเกม`, 3500);
}
if (g) {
  resume();
  if (g.pets.length) select(g.pets[0].id);
} else welcome();

// โลโก้ตอนเข้าเกม แล้วค่อยๆ จางเป็นหน้าเกม (แตะเพื่อข้าม)
const splash = $('splash');
$('splash-ver').textContent = `v${VERSION}`;
const hideSplash = () => { splash.classList.add('out'); setTimeout(() => splash.remove(), 800); };
const splashTimer = setTimeout(hideSplash, 1800);
splash.addEventListener('click', () => { clearTimeout(splashTimer); hideSplash(); });

let last = performance.now(), hudT = 0, saveT = 0, chatterT = 40;
/** น้องส่งเสียงเองเป็นครั้งคราว · ป่วยจะครางเบาๆ บ่อยกว่า */
function chatter(dt: number) {
  if (!g || (chatterT -= dt) > 0) return;
  const home = g.pets.filter(x => x.status === 'home');
  const sick = home.filter(isSick);
  chatterT = sick.length ? 18 + Math.random() * 12 : 50 + Math.random() * 70;
  const p = (sick.length ? sick : home)[Math.floor(Math.random() * (sick.length || home.length))];
  if (p && nightness(g.day) < 0.6) voice(p, isSick(p) ? 'sad' : 'normal');
}
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (g) {
    handle(tickOnline(g, dt * (urlSpeed || settings.speed || 1), Date.now()));
    scene.update(g, dt);
    scene.draw(g);
    if ((hudT -= dt) <= 0) { hudT = 0.25; renderHud(); }
    if ((saveT -= dt) <= 0) { saveT = 5; saveGame(g); }
    chatter(dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => {
  if (!g) return;
  if (document.hidden) { saveGame(g); sfx.suspend(); }
  else { resume(); last = performance.now(); }
});
window.addEventListener('pagehide', () => { if (g) saveGame(g); });
