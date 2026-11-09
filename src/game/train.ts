// มินิเกมฝึก แยกตามชนิดสัตว์ — ทำ 5 รอบชัดเจน ครบแล้วจบ (ใช้ต่อกับงานวัดใน v0.3 ได้)
//   หมา: วิ่งกระโดดข้ามรั้ว · แมว: ตะปบไม้ตกแมว · นก: ร้องตามโน้ต
// ใช้ Math.random ของเบราว์เซอร์ (ไม่แตะ RNG หลักในเซฟ) · ความยากขึ้นกับวัย: ลูกสัตว์ช้ากว่า สัตว์แก่ได้ช่องกว้างกว่า
import { BALANCE as B } from '../engine/balance';
import type { Breed } from '../engine/content';
import { sfx } from './sound';
import { frameFit } from './sprites';

const W = 160, H = 90;
const TITLE: Record<Breed['species'], [string, string]> = {
  dog: ['วิ่งกระโดดข้ามรั้ว', 'แตะให้น้องกระโดดตอนรั้วมาถึง'],
  cat: ['ตะปบไม้ตกแมว', 'แตะตอนขนนกเข้าวงอุ้งเท้า'],
  bird: ['ร้องตามเพลง', 'แตะตอนโน้ตถึงเส้นปากนก'],
};

export function runTraining(host: HTMLElement, petName: string, br: Breed, stage: 0 | 1 | 2, onDone: (hits: number) => void) {
  const [title, how] = TITLE[br.species];
  host.innerHTML = `
    <h3>ฝึก ${petName} · ${title}<span></span></h3>
    <p>${how} ${B.trainTaps} ครั้ง</p>
    <canvas class="traincv"></canvas>
    <div class="taps"></div>
    <button class="cta" id="tap">แตะ!</button>`;
  const cv = host.querySelector<HTMLCanvasElement>('canvas')!;
  const taps = host.querySelector<HTMLElement>('.taps')!;
  const btn = host.querySelector<HTMLButtonElement>('#tap')!;
  const K = 4; cv.width = W * K; cv.height = H * K;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const sheet = new Image(); sheet.src = `./art/${br.art}.png`;

  /** ลูกสัตว์ช้ากว่า 15% · สัตว์แก่ช้ากว่า 20% */
  const slow = stage === 0 ? 0.85 : stage === 2 ? 0.8 : 1;
  /** สัตว์แก่ได้ช่องให้อภัยกว้างขึ้น */
  const wide = stage === 2 ? 1.3 : stage === 0 ? 1.15 : 1;
  const marks: boolean[] = [];
  let done = false, raf = 0, last = performance.now(), t = 0;
  const render = () => { taps.textContent = Array.from({ length: B.trainTaps }, (_, i) => (i < marks.length ? (marks[i] ? '★' : '✕') : '○')).join(' '); };
  const judge = (ok: boolean) => {
    if (done || marks.length >= B.trainTaps) return;
    marks.push(ok); if (ok) sfx.ding(); else sfx.miss(); render();
    if (marks.length >= B.trainTaps) {
      done = true;
      const hits = marks.filter(Boolean).length;
      btn.textContent = `เสร็จ! ได้ ${hits}/${B.trainTaps}`; btn.disabled = true;
      setTimeout(() => { cancelAnimationFrame(raf); onDone(hits); }, 900);
    }
  };

  const r = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x * K), Math.round(y * K), Math.round(w * K), Math.round(h * K)); };
  /** วาดน้องจากชีตหลัก (4×3): col ท่า · row วัย · (x, feet) = กึ่งกลางล่าง · ht = ความสูงที่ต้องการ */
  const pet = (col: number, x: number, feet: number, ht: number, face = 1) => {
    if (!sheet.complete || !sheet.naturalWidth) return;
    const fit = frameFit(sheet, sheet, 'main', 4, col, stage, br.species === 'bird' && col === 1);
    const fw = sheet.naturalWidth / 4, fh = sheet.naturalHeight / 3, s = (ht / fh) * fit.k, w = fw * s, hh = fh * s, drop = fit.bottom * s;
    c.save();
    if (face < 0) { c.translate((x * 2) * K, 0); c.scale(-1, 1); }
    c.drawImage(sheet, col * fw, stage * fh, fw, fh, Math.round((x - w / 2) * K), Math.round((feet - hh + drop) * K), Math.round(w * K), Math.round(hh * K));
    c.restore();
  };
  const hopCol = stage < 2 ? 3 : 0;
  const petH = stage === 0 ? 28 : 34;

  let draw: () => void, tap: () => void, step: (dt: number) => void;

  if (br.species === 'dog') {
    // ---- หมา: รั้วเลื่อนมาจากขวา แตะให้กระโดดข้าม ----
    const G = 74, DX = 36, HURDLE = 10;
    let speed = 58 * slow, jump = -1, x = 0;
    const hurdles = Array.from({ length: B.trainTaps }, (_, i) => ({ x: 175 + i * 78 + Math.random() * 30, judged: false }));
    const height = () => (jump < 0 ? 0 : Math.sin(Math.min(1, jump) * Math.PI) * 26);
    tap = () => { if (jump < 0) { jump = 0; sfx.hop(); } };
    step = dt => {
      x += speed * dt;
      if (jump >= 0) { jump += dt / (0.62 / Math.sqrt(slow)); if (jump >= 1) jump = -1; }
      for (const h of hurdles) {
        h.x -= speed * dt;
        if (!h.judged && h.x < DX) { h.judged = true; judge(height() > HURDLE - 1 + (wide > 1 ? -2 : 0)); speed += 5 * slow; }
      }
    };
    draw = () => {
      r(0, 0, W, H, '#bfe8f2'); r(0, 46, W, 28, '#8fc87a');
      for (let i = 0; i < 6; i++) r(((i * 37 - x * 0.3) % 190 + 190) % 190 - 20, 52 + (i % 3) * 3, 18, 8, '#6fa560'); // พุ่มไม้เลื่อนช้า
      r(0, G, W, H - G, '#c8a26a');
      for (let i = 0; i < 12; i++) r((((i * 17 - x) % 170) + 170) % 170 - 5, G + 6 + (i % 3) * 4, 3, 1, '#a8824a');
      for (const h of hurdles) if (h.x > -10 && h.x < W + 10) {
        r(h.x - 4, G - HURDLE, 2, HURDLE, '#6b4528'); r(h.x + 3, G - HURDLE, 2, HURDLE, '#6b4528');
        for (let i = 0; i < 4; i++) r(h.x - 4 + i * 2.5, G - HURDLE, 2.5, 2, i % 2 ? '#f4f1ea' : '#c0645a');
        if (h.judged) r(h.x - 1, G - HURDLE - 6, 3, 3, marks[hurdles.indexOf(h)] ? '#5DCAA5' : '#E24B4A');
      }
      const air = jump >= 0;
      r(DX - 6, G - 1, 12, 1.5, 'rgba(60,35,20,0.25)');
      pet(air ? hopCol : 1 + (Math.floor(t / 0.13) % 2), DX, G - height(), petH);
    };
  } else if (br.species === 'cat') {
    // ---- แมว: ขนนกแกว่งไปมา แตะตอนเข้าวงอุ้งเท้า ----
    const CX = 80, CY = 38;
    let phase = Math.random() * 6, rate = 2 * slow, swipe = -1, caught = -1;
    const radius = () => (10.5 - marks.length * 0.9) * wide;
    const feather = () => ({ x: CX + Math.sin(phase) * 58, y: CY + Math.sin(phase * 2) * 9 });
    tap = () => {
      if (swipe >= 0) return;
      const f = feather(), ok = Math.hypot(f.x - CX, f.y - CY) <= radius();
      swipe = 0; if (ok) caught = 0.5;
      judge(ok);
      rate = (1.8 + Math.random() * 0.9 + marks.length * 0.18) * slow; // แต่ละรอบเร็วไม่เท่ากัน
    };
    step = dt => {
      if (caught > 0) caught -= dt; else phase += rate * dt;
      if (swipe >= 0) { swipe += dt / 0.4; if (swipe >= 1) swipe = -1; }
    };
    draw = () => {
      r(0, 0, W, H, '#f3e3c3'); for (let x = 0; x < W; x += 12) r(x, 0, 1, 70, '#e2ccA0');
      r(0, 70, W, 20, '#c29466'); r(0, 70, W, 1.5, '#a87a4e');
      const f = feather(), rad = radius();
      // วงอุ้งเท้า
      c.strokeStyle = caught > 0 ? '#5DCAA5' : 'rgba(58,36,24,0.55)'; c.lineWidth = K * 0.8; c.setLineDash([K * 2, K * 1.5]);
      c.beginPath(); c.arc(CX * K, CY * K, rad * K, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      // ไม้ + เชือก + ขนนก
      r(f.x - 30, 4, 34, 1.5, '#8a5a32');
      c.strokeStyle = '#3a2418'; c.lineWidth = K * 0.5; c.beginPath(); c.moveTo((f.x + 3) * K, 5 * K); c.lineTo(f.x * K, f.y * K); c.stroke();
      r(f.x - 1, f.y - 1, 2, 2, '#3a2418'); r(f.x - 2, f.y + 1, 4, 3, '#c0645a'); r(f.x - 1.5, f.y + 4, 3, 3, '#e8b04a'); r(f.x - 1, f.y + 7, 2, 2, '#6e9b45');
      const sw = swipe >= 0 ? Math.sin(swipe * Math.PI) : 0;
      r(CX - 7, 69, 14, 1.5, 'rgba(60,35,20,0.25)');
      pet(sw > 0.1 ? hopCol : 0, CX, 70 - sw * 8, petH, f.x < CX - 6 ? -1 : 1);
    };
  } else {
    // ---- นก: โน้ตไหลมาทางซ้าย แตะตอนถึงเส้น ----
    const LINE = 50, BX = 30;
    const speed = 46 * slow, win = 7 * wide;
    const notes = Array.from({ length: B.trainTaps }, (_, i) => ({ x: 170 + i * 46 + Math.random() * 18, p: Math.floor(Math.random() * 5), judged: false, ok: false }));
    let sing = 0;
    tap = () => {
      const n = notes.find(o => !o.judged);
      if (!n) return;
      // แตะเร็วไปมาก (โน้ตยังไกล) ไม่นับ — กันกดรัว
      if (n.x - LINE > 24) { sfx.miss(); return; }
      n.judged = true; n.ok = Math.abs(n.x - LINE) <= win;
      if (n.ok) { sfx.note(n.p); sing = 0.35; }
      judge(n.ok);
    };
    step = dt => {
      if (sing > 0) sing -= dt;
      for (const n of notes) { n.x -= speed * dt; if (!n.judged && n.x < LINE - win) { n.judged = true; judge(false); } }
    };
    draw = () => {
      r(0, 0, W, H, '#fbe2c0'); r(0, 60, W, 30, '#a8dcf0');
      for (let i = 0; i < 5; i++) r(0, 18 + i * 8, W, 0.6, 'rgba(58,36,24,0.25)'); // บรรทัดห้าเส้น
      r(LINE - win, 14, win * 2, 38, 'rgba(93,202,165,0.25)'); r(LINE - 0.5, 14, 1, 38, '#3a2418');
      for (const n of notes) if (n.x < W + 6 && !(n.judged && n.ok)) {
        const y = 48 - n.p * 7;
        r(n.x - 2.5, y - 2, 5, 4, n.judged ? '#E24B4A' : '#3a2418'); r(n.x + 2, y - 10, 1, 9, n.judged ? '#E24B4A' : '#3a2418');
      }
      // กิ่งไม้ + นก
      r(0, 66, 46, 3, '#6b4528'); r(10, 69, 3, 6, '#6b4528');
      pet(sing > 0 ? 1 : 0, BX, 66, petH * 0.85);
      if (sing > 0) { r(BX + 8, 46 - sing * 20, 2, 2, '#c0645a'); r(BX + 12, 50 - sing * 24, 2, 2, '#e8b04a'); }
    };
  }

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (!done || marks.length >= B.trainTaps) step(dt);
    draw();
    if (cv.isConnected) raf = requestAnimationFrame(loop);
  };
  const onTap = (e: Event) => { e.preventDefault(); if (!done) tap(); };
  btn.addEventListener('click', onTap);
  cv.addEventListener('pointerdown', onTap);
  render();
  raf = requestAnimationFrame(loop);
}
