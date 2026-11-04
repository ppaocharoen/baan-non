// ฉากชานบ้านริมคลอง: จอแนวตั้งเป็นหน้าต่างมองโลกกว้าง กล้องเลื่อนซ้ายขวา
// วาดน้อง ของในบ้าน อึ · น้องเดินไปใช้ของ (นอนที่เบาะ กินที่ชาม เข้าห้องน้ำ เล่นของเล่น) · กระโดดขึ้นม้านั่ง
// รับแตะ/กดค้าง/ปัด · โหมดจัดบ้านลากของได้
import { breedOf, foodOf, type Breed } from '../engine/content';
import type { GameState } from '../engine/core';
import { assignBeds, fits, FLOOR, furnitureOf, placed, toiletCap, type HomeItem } from '../engine/home';
import { isPostVax, isSick, petStage, type Pet } from '../engine/pet';
import { nightness } from '../engine/time';
import { Ambient } from './ambient';
import { drawItem, drawPoop, itemHeight, ITEM_SCALE } from './furniture';

/** ความสูงโลก (พิกเซลเกม) — ความกว้างโลกตามสัดส่วนภาพฉาก */
const WORLD_H = 168;
const GROUND = 142;
/** แนวเดินบนพื้นตามภาพฉาก: ซ้ายไม่เข้าผนัง/ประตู · ขวาไม่ชนกระถางและโอ่ง */
const FLOOR_L = FLOOR[0], FLOOR_R = FLOOR[1];
/** แนวเท้าของแถวของ: 0 = แถวหลัง (ชิดราว) · 1 = แถวหน้า */
const LANE_Y = [GROUND + 2, GROUND + 16];
/** ที่ที่น้องขึ้นไปอยู่ได้ (พิกัดโลก): 0 พื้น · 1 ม้านั่งกลางฉาก · 2 ราวระเบียง (เฉพาะแมวกับนก) */
const PERCH = [
  { x0: FLOOR_L, x1: FLOOR_R, y: GROUND + 4 },
  { x0: 89, x1: 130, y: 108 },
  { x0: 72, x1: 162, y: 90 },
];
const inPerch = (k: number, x: number) => x >= PERCH[k].x0 + 2 && x <= PERCH[k].x1 - 2;
const clampPerch = (k: number, x: number) => Math.max(PERCH[k].x0 + 3, Math.min(PERCH[k].x1 - 3, x));

type Action = 'idle' | 'walk' | 'eat' | 'happy' | 'sleep' | 'squat';
interface Plan { x: number; action: Action; dur: number; perch?: number; food?: string; }
interface Actor {
  id: number; x: number; face: 1 | -1; target: number;
  action: Action; until: number; walkT: number; nextThink: number; food: string;
  /** อยู่ที่ไหน (PERCH) · กำลังกระโดด (0–1) จากที่ไหนไปที่ไหน */
  perch: number; jump: number; jumpFrom: number; jumpTo: number;
  plan: Plan | null;
  /** ที่นอนที่ไปนอนอยู่ */
  bedY: number | null;
}

const img = (name: string) => { const im = new Image(); im.src = `./art/${name}.png`; return im; };
const ready = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;

export interface SceneInput {
  onTapPet(id: number): void;
  onHoldPet(id: number): void;
  onTapPoop(id: number): void;
  onTapItem(uid: number): void;
  onMoveItem(uid: number, x: number, lane: 0 | 1): void;
}

type Hit = { kind: 'pet' | 'poop' | 'item'; id: number; x: number; y: number; w: number; h: number };

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private bgDay = img('bg_home_day');
  private bgNight = img('bg_home_night');
  private icons = img('items');
  private sheets = new Map<string, HTMLImageElement>();
  private actors = new Map<number, Actor>();
  private K = 1;          // พิกเซลจอต่อพิกเซลเกม
  private viewW = 120;    // ความกว้างที่มองเห็น (พิกเซลเกม)
  worldW = 250;
  camX = 0;
  private manualUntil = 0;
  private t = 0;
  private ambient = new Ambient();
  focusId: number | null = null;
  /** โหมดจัดบ้าน: ลากของได้ แตะของเพื่อดูตัวเลือก */
  editMode = false;
  highlight: number | null = null;
  private hits: Hit[] = [];
  private drag: { uid: number; dx: number } | null = null;
  private g: GameState | null = null;

  constructor(private canvas: HTMLCanvasElement, input: SceneInput) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.bindInput(input);
  }

  private sheet(name: string) {
    let im = this.sheets.get(name);
    if (!im) { im = img(name); this.sheets.set(name, im); }
    return im;
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.K = this.canvas.height / WORLD_H;
    this.viewW = this.canvas.width / this.K;
  }

  private rx = (v: number) => Math.round(v * this.K) / this.K; // ปัดลงตาราง K ภาพจะคม

  private toWorld(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    return { x: ((clientX - r.left) * dpr) / this.K + this.camX, y: ((clientY - r.top) * dpr) / this.K };
  }
  /** หาสิ่งที่ถูกแตะ: ในโหมดจัดบ้านเลือกของก่อน · ปกติเลือกอึ > น้อง > ห้องน้ำ */
  private hitAt(clientX: number, clientY: number): Hit | null {
    const p = this.toWorld(clientX, clientY);
    const order: Hit['kind'][] = this.editMode ? ['item'] : ['poop', 'pet', 'item'];
    for (const kind of order) {
      let best: Hit | null = null, bestD = Infinity;
      for (const h of this.hits) {
        if (h.kind !== kind) continue;
        if (p.x >= h.x - 3 && p.x <= h.x + h.w + 3 && p.y >= h.y - 3 && p.y <= h.y + h.h + 3) {
          const d = Math.abs(p.x - (h.x + h.w / 2));
          if (d < bestD) { bestD = d; best = h; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private bindInput(input: SceneInput) {
    let down: { x: number; y: number; cam: number; hit: Hit | null; moved: boolean } | null = null;
    let holdTimer = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      const hit = this.hitAt(e.clientX, e.clientY);
      down = { x: e.clientX, y: e.clientY, cam: this.camX, hit, moved: false };
      const d = down;
      if (this.editMode && hit?.kind === 'item') {
        const w = this.toWorld(e.clientX, e.clientY), it = this.g?.items.find(i => i.uid === hit.id);
        if (it && it.x !== null) this.drag = { uid: it.uid, dx: w.x - it.x };
      }
      if (!this.editMode) holdTimer = window.setTimeout(() => { if (d.hit?.kind === 'pet' && !d.moved) { d.moved = true; input.onHoldPet(d.hit.id); } }, 500);
    });
    c.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 8 || Math.abs(e.clientY - down.y) > 8) { down.moved = true; clearTimeout(holdTimer); }
      if (!down.moved) return;
      if (this.drag) {
        const w = this.toWorld(e.clientX, e.clientY);
        const lane: 0 | 1 = w.y > GROUND + 7 ? 1 : 0;
        input.onMoveItem(this.drag.uid, w.x - this.drag.dx, lane);
        // ลากใกล้ขอบจอ กล้องเลื่อนตาม
        const sx = w.x - this.camX;
        if (sx < 12) this.camX = this.clampCam(this.camX - 1.5);
        if (sx > this.viewW - 12) this.camX = this.clampCam(this.camX + 1.5);
        this.manualUntil = this.t + 6;
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      this.camX = this.clampCam(down.cam - (dx * dpr) / this.K);
      this.manualUntil = this.t + 6;
    });
    const end = () => {
      clearTimeout(holdTimer);
      if (down && !down.moved && down.hit) {
        const h = down.hit;
        if (h.kind === 'pet') input.onTapPet(h.id);
        else if (h.kind === 'poop') input.onTapPoop(h.id);
        else input.onTapItem(h.id);
      }
      down = null; this.drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => { clearTimeout(holdTimer); down = null; this.drag = null; });
  }

  private clampCam(x: number) { return Math.max(0, Math.min(this.worldW - this.viewW, x)); }
  /** กึ่งกลางจอตอนนี้ (พิกัดโลก) — ใช้วางของที่เพิ่งซื้อ */
  get viewCenter() { return this.camX + this.viewW / 2; }
  centerOnX(x: number) { this.camX = this.clampCam(x - this.viewW / 2); this.manualUntil = this.t + 8; }

  private itemOf(kind: string, p: Pet, g: GameState): HomeItem | undefined {
    return placed(g).find(i => { const f = furnitureOf(i.key); return (f.kind === kind || (kind === 'toy' && f.toy)) && fits(f, p); });
  }

  /** ให้น้องทำท่า (เรียกจาก UI หลังคำสั่งสำเร็จ) — ถ้ามีชาม/ของเล่น น้องเดินไปที่นั่นก่อน */
  react(id: number, action: 'eat' | 'happy', food = 'rice') {
    const a = this.actors.get(id), g = this.g;
    if (!a || !g) return;
    const p = g.pets.find(x => x.id === id);
    const target = p && (action === 'eat' ? this.itemOf('bowl', p, g) : Math.random() < 0.6 ? this.itemOf('toy', p, g) : undefined);
    if (target && target.x !== null) { this.go(a, { x: Math.max(FLOOR_L, Math.min(FLOOR_R, target.x + (a.x < target.x ? -10 : 10))), action, dur: action === 'eat' ? 3 : 2.2, food }); return; }
    if (a.perch && action === 'eat') { this.go(a, { x: a.x, action, dur: 3, food, perch: a.perch }); return; }
    a.action = action; a.until = this.t + (action === 'eat' ? 3 : 2.2); a.food = food; a.plan = null;
  }
  /** น้องไปขับถ่ายที่ x */
  goPoop(id: number, x: number) {
    const a = this.actors.get(id);
    if (a) this.go(a, { x: Math.max(FLOOR_L, Math.min(FLOOR_R, x)), action: 'squat', dur: 1.4 });
  }
  private go(a: Actor, plan: Plan) {
    a.plan = plan;
    const tp = plan.perch ?? 0;
    if (a.perch && a.perch !== tp) {
      // ออกจากที่สูง: กระโดดตรงไปที่หมายถ้าอยู่ในแนวเดียวกัน ไม่งั้นลงพื้นก่อน
      this.startJump(a, tp && inPerch(tp, a.x) ? tp : 0);
      return;
    }
    a.target = a.perch ? clampPerch(a.perch, plan.x) : plan.x;
    a.action = 'walk';
  }
  private startJump(a: Actor, to: number) { a.jump = 0.0001; a.jumpFrom = a.perch; a.jumpTo = to; a.action = 'idle'; }

  screenPos(id: number): { x: number; y: number } | null {
    const h = this.hits.find(x => x.kind === 'pet' && x.id === id);
    if (!h) return null;
    return { x: (h.x + h.w / 2 - this.camX) / this.viewW, y: h.y / WORLD_H };
  }

  centerOn(id: number) { this.focusId = id; this.manualUntil = 0; }

  private sync(g: GameState) {
    const ids = new Set(g.pets.filter(p => p.status === 'home').map(p => p.id));
    for (const id of [...this.actors.keys()]) if (!ids.has(id)) this.actors.delete(id);
    for (const id of ids) {
      if (!this.actors.has(id)) {
        const others = [...this.actors.values()].map(a => a.x);
        const cands = [0.25, 0.4, 0.55, 0.7].map(f => Math.max(FLOOR_L, Math.min(FLOOR_R, this.camX + this.viewW * f)));
        const dist = (v: number) => Math.min(Infinity, ...others.map(o => Math.abs(o - v)));
        const x = cands.reduce((best, c) => (dist(c) > dist(best) ? c : best), cands[1]);
        this.actors.set(id, { id, x, face: 1, target: x, action: 'idle', until: 0, walkT: 0, nextThink: this.t + 1, food: 'rice', perch: 0, jump: 0, jumpFrom: 0, jumpTo: 0, plan: null, bedY: null });
      }
    }
  }

  private think(a: Actor, p: Pet, g: GameState) {
    const stage = petStage(p, g.day), night = nightness(g.day) > 0.6;
    if (a.plan || a.jump > 0) return;
    if (a.action === 'eat' || a.action === 'happy' || a.action === 'squat') { if (this.t < a.until) return; a.action = 'idle'; }
    if (this.t < a.nextThink) return;
    a.nextThink = this.t + 2 + Math.random() * 4;
    const lazy = isSick(p) || isPostVax(p, g.day) || p.full < 0.15 || stage === 2;
    const canJump = stage < 2 && !isSick(p);
    // กลางคืน: ไปนอนที่นอนของตัวเอง (ถ้ามี)
    if (night || (stage === 2 && Math.random() < 0.5)) {
      const bed = assignBeds(g).get(p.id);
      if (bed && bed.x !== null && Math.abs(a.x - bed.x) > 2) { this.go(a, { x: bed.x, action: 'sleep', dur: 30 }); return; }
      a.action = 'sleep'; a.nextThink = this.t + 6 + Math.random() * 6; return;
    }
    a.bedY = null;
    if (lazy || Math.random() > 0.7) { a.action = 'idle'; return; }
    // บางทีกระโดดขึ้นที่สูง (หรือลงมา): ม้านั่งได้ทุกตัว · ราวระเบียงเฉพาะแมวกับนก
    const sp = breedOf(p.breed).species, climber = sp === 'cat' || sp === 'bird';
    if (canJump && Math.random() < (climber ? 0.25 : 0.18)) {
      if (a.perch) { this.go(a, { x: Math.max(FLOOR_L, Math.min(FLOOR_R, a.x + (Math.random() - 0.5) * 60)), action: 'idle', dur: 0 }); return; }
      const k = climber && Math.random() < 0.55 ? 2 : 1;
      const px = PERCH[k].x0 + 4 + Math.random() * (PERCH[k].x1 - PERCH[k].x0 - 8);
      this.go(a, { x: px, action: Math.random() < 0.35 ? 'sleep' : 'idle', dur: 6 + Math.random() * 8, perch: k });
      return;
    }
    if (a.perch) { a.target = clampPerch(a.perch, a.x + (Math.random() - 0.5) * (a.perch === 2 ? 40 : 20)); a.action = 'walk'; return; }
    a.target = Math.max(FLOOR_L, Math.min(FLOOR_R, a.x + (Math.random() - 0.5) * 120));
    a.action = 'walk';
  }

  update(g: GameState, dt: number) {
    this.g = g;
    this.t += dt;
    if (ready(this.bgDay)) this.worldW = (this.bgDay.naturalWidth * WORLD_H) / this.bgDay.naturalHeight;
    this.sync(g);
    this.ambient.update(dt, nightness(g.day));
    for (const p of g.pets) {
      const a = this.actors.get(p.id);
      if (!a) continue;
      this.think(a, p, g);
      // กำลังกระโดดขึ้น/ลงม้านั่ง
      if (a.jump > 0) {
        a.jump += dt / (Math.abs(PERCH[a.jumpFrom].y - PERCH[a.jumpTo].y) > 30 ? 0.6 : 0.45);
        if (a.jump >= 1) {
          a.jump = 0; a.perch = a.jumpTo;
          if (a.plan) { a.target = a.perch ? clampPerch(a.perch, a.plan.x) : a.plan.x; a.action = 'walk'; }
        }
        continue;
      }
      if (a.perch === 0 && a.jump === 0) a.x = Math.max(FLOOR_L, Math.min(FLOOR_R, a.x)); // เซฟเก่าที่อยู่นอกแนวเดิน
      if (a.action === 'walk') {
        const dx = a.target - a.x, speed = petStage(p, g.day) === 2 ? 12 : a.perch === 2 ? 10 : a.plan ? 26 : 20;
        if (Math.abs(dx) < 1) {
          a.action = 'idle';
          if (a.plan) {
            const tp = a.plan.perch ?? 0;
            if (a.perch !== tp) { this.startJump(a, tp); continue; }
            a.action = a.plan.action; a.until = this.t + a.plan.dur; a.food = a.plan.food ?? a.food;
            a.nextThink = a.until; a.plan = null;
          }
          continue;
        }
        a.face = dx > 0 ? 1 : -1;
        a.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
        a.walkT += dt;
      } else if (a.plan && a.jump === 0 && a.perch === (a.plan.perch ?? 0)) { a.action = 'walk'; }
    }
    const f = this.focusId !== null ? this.actors.get(this.focusId) : undefined;
    if (f && this.t > this.manualUntil && !this.editMode) {
      const want = this.clampCam(f.x - this.viewW / 2);
      this.camX += (want - this.camX) * Math.min(1, dt * 2.5);
    }
    this.camX = this.clampCam(this.camX);
  }

  draw(g: GameState) {
    const c = this.ctx, K = this.K;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2a1d14';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(K, 0, 0, K, 0, 0);
    const n = nightness(g.day);
    const drawBg = (im: HTMLImageElement, alpha: number) => {
      if (!ready(im) || alpha <= 0) return;
      c.globalAlpha = alpha;
      c.drawImage(im, this.rx(-this.camX), 0, this.rx(this.worldW), WORLD_H);
      c.globalAlpha = 1;
    };
    drawBg(this.bgDay, 1);
    drawBg(this.bgNight, n);
    const s = ready(this.bgDay) ? WORLD_H / this.bgDay.naturalHeight : 0.52;
    this.ambient.drawBack(c, { camX: this.camX, s, rx: this.rx, n });

    this.hits = [];
    const pets = g.pets.filter(p => this.actors.has(p.id)).map(p => ({ p, a: this.actors.get(p.id)! }));
    // ชั้นหลังสุด: น้องบนราวระเบียง แล้วบนม้านั่ง
    for (const k of [2, 1]) for (const { p, a } of pets.filter(x => x.a.perch === k && x.a.jump === 0).sort((u, v) => u.a.x - v.a.x)) this.drawPet(p, a, g);
    // ของแบนติดพื้น (เสื่อ แผ่นรอง) ก่อน แล้วของแถวหลัง
    const flat = (k: string) => k === 'rug' || k === 'coolmat' || k === 'peepad';
    for (const it of placed(g).filter(i => flat(i.key))) this.drawHomeItem(it, n);
    for (const it of placed(g).filter(i => i.lane === 0 && !flat(i.key))) this.drawHomeItem(it, n);
    // อึ
    for (const po of g.poops) {
      const x = po.x - this.camX, y = GROUND + 6;
      drawPoop(c, x, y, this.rx, po.small, this.t, g.day - po.day);
      this.hits.push({ kind: 'poop', id: po.id, x: po.x - 7, y: y - 12, w: 14, h: 14 });
    }
    // น้องบนพื้น (และกำลังกระโดด)
    for (const { p, a } of pets.filter(x => x.a.perch === 0 || x.a.jump > 0).sort((u, v) => u.a.x - v.a.x)) this.drawPet(p, a, g);
    // ของแถวหน้า
    for (const it of placed(g).filter(i => i.lane === 1 && !flat(i.key))) this.drawHomeItem(it, n);
    this.ambient.drawFront(c, { camX: this.camX, s, rx: this.rx, n });
    if (this.editMode) {
      c.fillStyle = 'rgba(4,52,44,0.12)';
      c.fillRect(0, GROUND - 4, this.viewW, WORLD_H - GROUND + 4);
    }
  }

  private drawHomeItem(it: HomeItem, n: number) {
    const f = furnitureOf(it.key), x = it.x! - this.camX, y = LANE_Y[it.lane];
    drawItem(this.ctx, it.key, x, y, this.rx, this.t, it.fill, toiletCap(f), n);
    const h = itemHeight(it.key), fw = f.w * ITEM_SCALE;
    this.hits.push({ kind: 'item', id: it.uid, x: it.x! - fw / 2, y: y - h, w: fw, h: Math.max(h, 8) });
    if (this.editMode) {
      const c = this.ctx, f = { w: fw };
      c.strokeStyle = this.highlight === it.uid ? '#FAC775' : 'rgba(225,245,238,0.85)';
      c.lineWidth = 1 / this.K * 2;
      c.setLineDash([2, 1.5]);
      c.strokeRect(this.rx(x - f.w / 2 - 1), this.rx(y - h - 1), this.rx(f.w + 2), this.rx(h + 2));
      c.setLineDash([]);
    }
  }

  private drawPet(p: Pet, a: Actor, g: GameState) {
    const br: Breed = breedOf(p.breed), stage = petStage(p, g.day);
    const main = this.sheet(br.art), extra = this.sheet(`${br.art}_x`);
    if (!ready(main)) return;
    let im = main, cols = 4, col = 0, scale = br.scale, lift = 0;
    const step = Math.floor(a.walkT / (stage === 2 ? 0.28 : 0.18));
    // เท้าอยู่ที่ไหน: พื้น ม้านั่ง หรือกลางอากาศตอนกระโดด
    let feet = PERCH[a.perch].y;
    if (a.jump > 0) {
      const from = PERCH[a.jumpFrom].y, to = PERCH[a.jumpTo].y;
      feet = from + (to - from) * a.jump - Math.sin(a.jump * Math.PI) * (14 + Math.abs(from - to) * 0.2);
      col = br.species === 'bird' ? 1 : 3;
    }
    const bed = a.action === 'sleep' && !a.perch ? assignBeds(g).get(p.id) : undefined;
    if (bed && bed.x !== null && Math.abs(bed.x - a.x) < 3) feet = LANE_Y[bed.lane] - itemHeight(bed.key) * ({ bed: 0.35, coolmat: 0.3, condo: 0.86, cage: 0.3 }[bed.key] ?? 0.3);
    if (a.jump === 0) switch (a.action) {
      case 'walk':
        col = br.species === 'bird' ? 2 : 1 + (step % 2);
        if (br.species === 'bird') lift = step % 2 ? 2 : 0;
        else if (br.species === 'dog' && stage === 0) { col = 1; lift = step % 2; }
        break;
      case 'eat':
        if (ready(extra)) { im = extra; cols = 2; col = 0; scale = br.scale * br.xScale; lift = Math.floor(this.t * 4) % 2 ? 0.5 : 0; }
        break;
      case 'happy':
        if (stage < 2) { col = 3; lift = Math.abs(Math.sin(this.t * 9)) * 5; }
        else if (ready(extra)) { im = extra; cols = 2; col = 1; scale = br.scale * br.xScale; }
        break;
      case 'sleep': col = stage === 2 ? 3 : 0; break;
      case 'squat': col = 0; lift = -0.5; break;
      default: col = 0;
    }
    const fw = im.naturalWidth / cols, fh = im.naturalHeight / 3;
    const w = fw * scale, h = fh * scale, sx = a.x - this.camX;
    const x = this.rx(sx - w / 2), y = this.rx(feet - h - lift);
    const c = this.ctx;
    // ชามอาหาร (ถ้าไม่มีชามตั้งพื้น)
    if (a.action === 'eat' && !this.itemOf('bowl', p, g) && ready(this.icons)) {
      const ic = foodOf(a.food).icon, iw = this.icons.naturalWidth / 4, ih = this.icons.naturalHeight / 3, s = 0.32;
      c.drawImage(this.icons, (ic % 4) * iw, Math.floor(ic / 4) * ih, iw, ih, this.rx(sx + a.face * w * 0.38 - iw * s / 2), this.rx(feet - ih * s), this.rx(iw * s), this.rx(ih * s));
    }
    if (a.jump === 0) { c.fillStyle = 'rgba(60,35,20,0.25)'; c.fillRect(this.rx(sx - w * 0.3), feet - 1.5, this.rx(w * 0.6), 1.5); }
    c.save();
    if (isSick(p)) c.filter = 'saturate(0.35) brightness(0.85)';
    if (a.face < 0) { c.translate(x * 2 + w, 0); c.scale(-1, 1); }
    c.drawImage(im, col * fw, stage * fh, fw, fh, x, y, this.rx(w), this.rx(h));
    c.restore();
    if (a.action === 'sleep') {
      c.fillStyle = '#E1F5EE';
      c.font = '6px Itim, sans-serif';
      c.fillText('z', sx + w * 0.3, y + 2 - (Math.floor(this.t * 1.5) % 3) * 2);
    }
    const bw = Math.max(26, w * 0.8), bh = Math.max(22, h * 0.9);
    this.hits.push({ kind: 'pet', id: p.id, x: a.x - bw / 2, y: feet - bh, w: bw, h: bh });
  }
}
