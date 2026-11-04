// ฉากชานบ้านริมคลอง: จอแนวตั้งเป็นหน้าต่างมองโลกกว้าง กล้องเลื่อนซ้ายขวา · วาดน้องทุกตัว · รับแตะ/กดค้าง/ปัด
import { breedOf, foodOf, type Breed } from '../engine/content';
import type { GameState } from '../engine/core';
import { isSick, petStage, type Pet } from '../engine/pet';
import { nightness } from '../engine/time';

/** ความสูงโลก (พิกเซลเกม) — ความกว้างโลกตามสัดส่วนภาพฉาก */
const WORLD_H = 168;
const GROUND = 142;
const FLOOR_L = 18, FLOOR_R_PAD = 18;

type Action = 'idle' | 'walk' | 'eat' | 'happy' | 'sleep';
interface Actor {
  id: number; x: number; face: 1 | -1; target: number;
  action: Action; until: number; walkT: number; nextThink: number; food: string;
}

const img = (name: string) => { const im = new Image(); im.src = `./art/${name}.png`; return im; };
const ready = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;

export interface SceneInput {
  onTapPet(id: number): void;
  onHoldPet(id: number): void;
}

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private bgDay = img('bg_home_day');
  private bgNight = img('bg_home_night');
  private items = img('items');
  private sheets = new Map<string, HTMLImageElement>();
  private actors = new Map<number, Actor>();
  private K = 1;          // พิกเซลจอต่อพิกเซลเกม
  private viewW = 120;    // ความกว้างที่มองเห็น (พิกเซลเกม)
  worldW = 250;
  camX = 0;
  private manualUntil = 0;
  private t = 0;
  focusId: number | null = null;
  private boxes = new Map<number, { x: number; y: number; w: number; h: number }>();

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

  /** แปลงพิกัดจอ (px ของ element) → พิกัดโลก */
  private toWorld(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    return { x: ((clientX - r.left) * dpr) / this.K + this.camX, y: ((clientY - r.top) * dpr) / this.K };
  }
  private petAt(clientX: number, clientY: number): number | null {
    const p = this.toWorld(clientX, clientY);
    let best: number | null = null, bestD = Infinity;
    for (const [id, b] of this.boxes) {
      if (p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 2) {
        const d = Math.abs(p.x - (b.x + b.w / 2));
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    return best;
  }

  private bindInput(input: SceneInput) {
    let down: { x: number; y: number; cam: number; t: number; pet: number | null; moved: boolean } | null = null;
    let holdTimer = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY, cam: this.camX, t: performance.now(), pet: this.petAt(e.clientX, e.clientY), moved: false };
      const d = down;
      holdTimer = window.setTimeout(() => { if (d.pet !== null && !d.moved) { d.moved = true; input.onHoldPet(d.pet); } }, 500);
    });
    c.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 8) { down.moved = true; clearTimeout(holdTimer); }
      if (down.moved) {
        const dpr = window.devicePixelRatio || 1;
        this.camX = this.clampCam(down.cam - (dx * dpr) / this.K);
        this.manualUntil = this.t + 6;
      }
    });
    const end = () => {
      clearTimeout(holdTimer);
      if (down && !down.moved && down.pet !== null) input.onTapPet(down.pet);
      down = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => { clearTimeout(holdTimer); down = null; });
  }

  private clampCam(x: number) { return Math.max(0, Math.min(this.worldW - this.viewW, x)); }

  /** ให้น้องทำท่า (เรียกจาก UI หลังคำสั่งสำเร็จ) */
  react(id: number, action: 'eat' | 'happy', food = 'rice') {
    const a = this.actors.get(id);
    if (!a) return;
    a.action = action; a.until = this.t + (action === 'eat' ? 3 : 2.2); a.food = food;
  }

  /** ตำแหน่งบนจอ (สัดส่วน 0–1) เหนือหัวน้อง — ใช้วางตัวลอย ♥ */
  screenPos(id: number): { x: number; y: number } | null {
    const b = this.boxes.get(id);
    if (!b) return null;
    return { x: (b.x + b.w / 2 - this.camX) / this.viewW, y: b.y / WORLD_H };
  }

  centerOn(id: number) { this.focusId = id; this.manualUntil = 0; }

  private sync(g: GameState) {
    const ids = new Set(g.pets.filter(p => p.status === 'home').map(p => p.id));
    for (const id of [...this.actors.keys()]) if (!ids.has(id)) this.actors.delete(id);
    for (const id of ids) {
      if (!this.actors.has(id)) {
        // วางให้ห่างจากน้องตัวอื่น จะได้ไม่ซ้อนกันจนมองไม่เห็น
        const others = [...this.actors.values()].map(a => a.x);
        const cands = [0.25, 0.4, 0.55, 0.7].map(f => this.camX + this.viewW * f);
        const x = cands.reduce((best, c) => {
          const d = (v: number) => Math.min(Infinity, ...others.map(o => Math.abs(o - v)));
          return d(c) > d(best) ? c : best;
        }, cands[1]);
        this.actors.set(id, { id, x, face: 1, target: x, action: 'idle', until: 0, walkT: 0, nextThink: this.t + 1, food: 'rice' });
      }
    }
  }

  private think(a: Actor, p: Pet, g: GameState) {
    const stage = petStage(p, g.day), night = nightness(g.day) > 0.6;
    if (a.action === 'eat' || a.action === 'happy') { if (this.t < a.until) return; a.action = 'idle'; }
    if (this.t < a.nextThink) return;
    const lazy = isSick(p) || p.full < 0.15 || stage === 2;
    if (night || (stage === 2 && Math.random() < 0.5)) { a.action = 'sleep'; a.nextThink = this.t + 6 + Math.random() * 6; return; }
    if (!lazy && Math.random() < 0.65) {
      const R = this.worldW - FLOOR_R_PAD;
      a.target = Math.max(FLOOR_L, Math.min(R, a.x + (Math.random() - 0.5) * 120));
      a.action = 'walk';
    } else a.action = 'idle';
    a.nextThink = this.t + 2 + Math.random() * 4;
  }

  update(g: GameState, dt: number) {
    this.t += dt;
    const bg = this.bgDay;
    if (ready(bg)) this.worldW = (bg.naturalWidth * WORLD_H) / bg.naturalHeight;
    this.sync(g);
    for (const p of g.pets) {
      const a = this.actors.get(p.id);
      if (!a) continue;
      this.think(a, p, g);
      if (a.action === 'walk') {
        const dx = a.target - a.x, speed = petStage(p, g.day) === 2 ? 12 : 20;
        if (Math.abs(dx) < 1) { a.action = 'idle'; continue; }
        a.face = dx > 0 ? 1 : -1;
        a.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
        a.walkT += dt;
      }
    }
    // กล้องตามน้องที่เลือก (ถ้าผู้เล่นไม่ได้ปัดเองเมื่อครู่)
    const f = this.focusId !== null ? this.actors.get(this.focusId) : undefined;
    if (f && this.t > this.manualUntil) {
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

    this.boxes.clear();
    const order = g.pets.filter(p => this.actors.has(p.id)).sort((a, b) => this.actors.get(a.id)!.x - this.actors.get(b.id)!.x);
    for (const p of order) this.drawPet(p, this.actors.get(p.id)!, g);
  }

  private drawPet(p: Pet, a: Actor, g: GameState) {
    const br: Breed = breedOf(p.breed), stage = petStage(p, g.day);
    const main = this.sheet(br.art), extra = this.sheet(`${br.art}_x`);
    if (!ready(main)) return;
    let im = main, cols = 4, col = 0, scale = br.scale, lift = 0;
    const step = Math.floor(a.walkT / (stage === 2 ? 0.28 : 0.18));
    switch (a.action) {
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
      case 'sleep':
        col = stage === 2 ? 3 : 0;
        break;
      default: col = 0;
    }
    const fw = im.naturalWidth / cols, fh = im.naturalHeight / 3;
    const w = fw * scale, h = fh * scale, sx = a.x - this.camX;
    const x = this.rx(sx - w / 2), y = this.rx(GROUND + 4 - h - lift);
    const c = this.ctx;
    // ชามอาหารตอนกิน
    if (a.action === 'eat' && ready(this.items)) {
      const ic = foodOf(a.food).icon, iw = this.items.naturalWidth / 4, ih = this.items.naturalHeight / 3, s = 0.32;
      c.drawImage(this.items, (ic % 4) * iw, Math.floor(ic / 4) * ih, iw, ih, this.rx(sx + a.face * w * 0.38 - iw * s / 2), this.rx(GROUND + 4 - ih * s), this.rx(iw * s), this.rx(ih * s));
    }
    c.fillStyle = 'rgba(60,35,20,0.25)';
    c.fillRect(this.rx(sx - w * 0.3), GROUND + 2.5, this.rx(w * 0.6), 1.5);
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
    // กล่องแตะ: อย่างน้อย 26×22 พิกเซลเกม นกตัวเล็กจะได้แตะโดนง่าย
    const bw = Math.max(26, w * 0.8), bh = Math.max(22, h * 0.9);
    this.boxes.set(p.id, { x: a.x - bw / 2, y: GROUND + 4 - bh, w: bw, h: bh });
  }
}
