// บ้านน้อน — หน้าจอหลัก: เชื่อมเครื่องยนต์ ฉาก HUD และป๊อปอัป
import './game.css';
import { BALANCE as B, type Mode } from '../engine/balance';
import { BREEDS, FOODS, breedOf } from '../engine/content';
import {
  adopt, bathe, canTrain, catchUpOffline, coax, daysUntilTrain, feed, newGame, petById, play, tickOnline, train, treat,
  type GameEvent, type GameState,
} from '../engine/core';
import { isSick, mood, petAge, petStage, type Pet } from '../engine/pet';
import { calendar, nightness, SEASONS } from '../engine/time';
import { Scene } from './scene';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings } from './store';
import { applyTheme, THEMES } from './themes';
import { runTraining } from './train';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
/** ?speed=60 เร่งเวลาตอนเปิดเกม (ทดสอบ) */
const SPEED = Math.max(1, Number(params.get('speed')) || 1);

let g: GameState | null = loadGame();
const settings = loadSettings();
applyTheme(settings.theme);
let selId: number | null = null;

// ---------- ไอคอนปุ่มจากชีตไอเทม ----------
for (const el of document.querySelectorAll<HTMLElement>('.ic')) {
  const i = Number(el.dataset.ic);
  el.style.backgroundImage = 'url(./art/items.png)';
  el.style.backgroundPosition = `${-(i % 4) * 30}px ${-Math.floor(i / 4) * 25.23}px`;
}

// ---------- ฉาก ----------
const scene = new Scene($<HTMLCanvasElement>('scene'), {
  onTapPet: id => { select(id); doPlay(id); },
  onHoldPet: id => { select(id); showStatus(id); },
});

// สำหรับทดสอบอัตโนมัติ
(window as unknown as { __bn: unknown }).__bn = { scene, get g() { return g; } };

// ---------- ตัวช่วย ----------
const sel = (): Pet | undefined => (g && selId !== null ? petById(g, selId) : undefined);
const nameOf = (id: number) => g?.pets.find(p => p.id === id)?.name ?? g?.heaven.find(h => h.id === id)?.name ?? 'น้อง';
const fmtMoney = (v: number) => Math.floor(v).toLocaleString('th-TH');
const STAGES = ['วัยเด็ก', 'วัยโต', 'วัยชรา'];

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
  pop.classList.add('on');
  sheet.querySelector<HTMLElement>('.x')?.addEventListener('click', closePop);
  return sheet;
}
function closePop() { pop.classList.remove('on'); sheet.innerHTML = ''; }
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
  if (!r.ok) { toast(r.reason!); return; }
  scene.react(id, 'happy'); floatAt(id, '♥');
}
function doFeed() {
  const p = need(); if (!p || !g) return;
  const s = openPop(`${head(`ให้อาหาร ${p.name}`)}${FOODS.map(f => `<button class="opt" data-f="${f.key}" ${g!.money < f.price ? 'disabled' : ''}><span>${f.name}</span><span>${f.price} 🪙</span></button>`).join('')}`);
  s.querySelectorAll<HTMLElement>('[data-f]').forEach(el => el.addEventListener('click', () => {
    const r = feed(g!, p.id, el.dataset.f!);
    closePop();
    if (!r.ok) { toast(r.reason!); return; }
    scene.react(p.id, 'eat', el.dataset.f!); floatAt(p.id, '😋');
  }));
}
function doBathe() {
  const p = need(); if (!p || !g) return;
  if (p.clean > 0.92) { toast(`${p.name} ยังสะอาดอยู่`); return; }
  bathe(g, p.id); scene.react(p.id, 'happy'); floatAt(p.id, '🫧');
}
function doTrain() {
  const p = need(); if (!p || !g) return;
  if (isSick(p)) { toast(`${p.name} ป่วยอยู่ ฝึกไม่ได้`); return; }
  if (!canTrain(g, p)) { toast(`ฝึกได้อีกใน ${Math.ceil(daysUntilTrain(g, p))} วัน`); return; }
  openPop('');
  runTraining(sheet, p.name, hits => {
    const before = p.trained;
    train(g!, p.id, hits); closePop();
    toast(hits ? `${p.name} เก่งขึ้น +${Math.round((p.trained - before) * 100)}%` : 'รอบนี้พลาดหมด ไว้ลองใหม่สัปดาห์หน้า');
    if (hits) { scene.react(p.id, 'happy'); floatAt(p.id, '★'); }
  });
}
function doClinic() {
  const p = need(); if (!p || !g) return;
  if (!isSick(p)) { openPop(`${head('คลินิกสัตว์')}<p>${p.name} แข็งแรงดี ไม่ต้องรักษา</p><p><small>สมุดวัคซีนและถ่ายพยาธิจะมาในอัปเดตถัดไป</small></p>`); return; }
  const s = openPop(`${head('คลินิกสัตว์')}<p>${p.name} ไม่สบาย ต้องรักษา</p><button class="cta" id="tr" ${g.money < B.treatCost ? 'disabled' : ''}>รักษา ${B.treatCost} 🪙</button>`);
  s.querySelector('#tr')!.addEventListener('click', () => {
    const r = treat(g!, p.id); closePop();
    if (!r.ok) { toast(r.reason!); return; }
    toast(`${p.name} หายป่วยแล้ว`); scene.react(p.id, 'happy');
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
    ['สุขภาพ', p.status === 'away' ? 'อยู่บ้านป้า' : isSick(p) ? 'ไม่สบาย' : 'แข็งแรง'], ['อารมณ์', ['ซึม', 'เฉยๆ', 'ดี', 'ร่าเริง'][Math.min(3, Math.floor(mood(p) * 4))]],
  ];
  openPop(`${head(p.name)}${rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('')}`);
}
function menu() {
  if (!g) return;
  const s = openPop(`${head('เมนู')}
    <button class="opt" id="m-theme"><span>สีตัวเครื่อง</span>›</button>
    <button class="opt" id="m-adopt" ${g.pets.length >= B.maxPets ? 'disabled' : ''}><span>รับน้องเพิ่ม<br><small>${g.pets.length >= B.maxPets ? `บ้านนี้เลี้ยงได้ ${B.maxPets} ตัว` : `ค่ารับเลี้ยง ${B.adoptPrice} 🪙`}</small></span>›</button>
    <button class="opt" id="m-heaven"><span>สวนสวรรค์สัตว์เลี้ยง<br><small>${g.heaven.length} ตัว</small></span>›</button>
    <button class="opt" id="m-info"><span>เกี่ยวกับเกม<br><small>โหมด${g.mode === 'hard' ? 'เข้ม' : 'ปกติ'}</small></span>›</button>
    <button class="opt" id="m-reset"><span>เริ่มเกมใหม่</span>›</button>`);
  s.querySelector('#m-theme')!.addEventListener('click', themePicker);
  s.querySelector('#m-adopt')!.addEventListener('click', () => chooseBreed('รับน้องเพิ่ม', B.adoptPrice, (breed, name) => {
    const r = adopt(g!, breed, name, B.adoptPrice); closePop();
    if (!r.ok) { toast(r.reason!); return; }
    select(r.pet!.id); toast(`${name} มาอยู่บ้านแล้ว`);
  }));
  s.querySelector('#m-heaven')!.addEventListener('click', () => openPop(`${head('สวนสวรรค์สัตว์เลี้ยง')}${g!.heaven.length ? g!.heaven.map(h => `<div class="row"><span>${h.name} · ${breedOf(h.breed).name}</span><span>${Math.floor(h.ageDays)} วัน</span></div>`).join('') : '<p>ยังไม่มีน้องตัวไหนจากไป</p>'}`, true));
  s.querySelector('#m-info')!.addEventListener('click', () => openPop(`${head('บ้านน้อน · Baan Non: Klong Life')}<p>เกมเลี้ยงน้องหมา แมว นก ในเรือนไทยริมคลอง</p><p>ตอนปิดเกม เวลายังเดินแต่ช้าลงมาก น้องหิวช้าลงด้วย</p><p><small>เวอร์ชันทดลอง v0.1 · กำลังสร้าง</small></p>`));
  s.querySelector('#m-reset')!.addEventListener('click', () => {
    const c = openPop(`${head('เริ่มเกมใหม่')}<p>น้องทุกตัวและความคืบหน้าทั้งหมดจะหายไป แน่ใจไหม</p><button class="cta" id="yes">เริ่มใหม่</button><button class="cta ghost" id="no">ยกเลิก</button>`);
    c.querySelector('#no')!.addEventListener('click', closePop);
    c.querySelector('#yes')!.addEventListener('click', () => { clearGame(); g = null; selId = null; welcome(); });
  });
}
function themePicker() {
  const s = openPop(`${head('สีตัวเครื่อง')}<div class="grid">${THEMES.map(t => `<button class="opt ${t.key === settings.theme ? 'sel' : ''}" data-t="${t.key}"><span class="swatch" style="background:${t.shell};border-color:${t.ink}"></span>${t.name}</button>`).join('')}</div>`, true);
  s.querySelectorAll<HTMLElement>('[data-t]').forEach(el => el.addEventListener('click', () => {
    settings.theme = el.dataset.t!; applyTheme(settings.theme); saveSettings(settings);
    s.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
  }));
}

const ACTIONS: Record<string, () => void> = {
  feed: doFeed, bathe: doBathe, train: doTrain, clinic: doClinic, menu,
  play: () => { const p = need(); if (p) doPlay(p.id); },
  album: () => soon('อัลบั้ม', 'เก็บรูปจากจังหวะชัตเตอร์ แล้วเลือกไปโพสต์ลงเพจ'),
  page: () => soon('เพจบ้านน้อน', 'ช่องโซเชียลของน้อง โพสต์รูป หาผู้ติดตาม และรายได้จากโฆษณา'),
};
document.querySelectorAll<HTMLElement>('#btns [data-act]').forEach(el => el.addEventListener('click', () => { if (g) ACTIONS[el.dataset.act!](); }));
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

// ---------- เหตุการณ์จากเครื่องยนต์ ----------
function handle(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'newDay') continue;
    const name = nameOf(e.petId);
    if (e.type === 'sick') toast(`${name} ไม่สบาย พาไปคลินิกนะ`, 4000);
    else if (e.type === 'runaway') toast(`${name} หนีไปอยู่บ้านป้าข้างบ้าน`, 4500);
    else if (e.type === 'stage') toast(e.stage === 1 ? `${name} โตเป็นผู้ใหญ่แล้ว` : `${name} เริ่มแก่แล้ว`, 3500);
    else if (e.type === 'died') {
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
  $('ic-time').textContent = nightness(g.day) > 0.5 ? '☾' : '☀';
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
    clinic: home.some(isSick), play: false, album: false, page: false, menu: false,
  };
  document.querySelectorAll<HTMLElement>('#btns [data-act]').forEach(el => el.querySelector('.dot')!.classList.toggle('on', dots[el.dataset.act!]));
  // ป้ายเมื่อน้องไม่อยู่ / บ้านว่าง
  const banner = $('banner');
  if (p && p.status === 'away') {
    if (!banner.dataset.away || banner.dataset.away !== String(p.id)) {
      banner.dataset.away = String(p.id);
      banner.innerHTML = `${p.name} หนีไปอยู่บ้านป้าข้างบ้าน<button class="cta">ไปง้อกลับ ${B.coaxCost} 🪙</button>`;
      banner.querySelector('button')!.addEventListener('click', () => {
        const r = coax(g!, p.id);
        if (!r.ok) { toast(r.reason!); return; }
        toast(`${p.name} ยอมกลับบ้านแล้ว แต่ยังงอนอยู่`); delete banner.dataset.away;
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

let last = performance.now(), hudT = 0, saveT = 0;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (g) {
    handle(tickOnline(g, dt * SPEED, Date.now()));
    scene.update(g, dt);
    scene.draw(g);
    if ((hudT -= dt) <= 0) { hudT = 0.25; renderHud(); }
    if ((saveT -= dt) <= 0) { saveT = 5; saveGame(g); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => {
  if (!g) return;
  if (document.hidden) saveGame(g);
  else { resume(); last = performance.now(); }
});
window.addEventListener('pagehide', () => { if (g) saveGame(g); });
