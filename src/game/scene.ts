// ฉาก 2 ห้อง: ชานบ้านริมคลอง · ในบ้าน — จอแนวตั้งเป็นหน้าต่างมองทีละห้อง กล้องเลื่อนซ้ายขวา
// น้องเดินไปใช้ของ (นอนที่เบาะ กินที่ชาม เข้าห้องน้ำ เล่นของเล่น) · กระโดดขึ้นที่สูง · เดินผ่านประตูข้ามห้องเอง
// รับแตะ/กดค้าง/ปัด · โหมดจัดบ้านลากของได้
import { breedOf, foodOf, type Breed } from '../engine/content';
import type { GameState } from '../engine/core';
import { assignBeds, fits, FLOORS, furnitureOf, HANG, placed, toiletCap, type HomeItem, type Lane, type RoomKey } from '../engine/home';
import { isPostVax, isSick, petStage, type Pet } from '../engine/pet';
import { nightness } from '../engine/time';
import { Ambient } from './ambient';
import { drawItem, drawPoop, itemHeight, ITEM_SCALE } from './furniture';

/** ความสูงโลก (พิกเซลเกม) — ความกว้างโลกตามสัดส่วนภาพฉาก */
const WORLD_H = 168;
const GROUND = 142;
/** แนวเท้าของแถวของ: 0 = แถวหลัง · 1 = แถวหน้า */
const LANE_Y = [GROUND + 2, GROUND + 16];
/** แนวชายคาที่แขวนของ (ความสูงโลก) และความยาวสายแขวน */
const CHAIN = 16;
/** แนวขอบล่างโครงหลังคา (จันทัน/เชิงชาย) ของชานบ้าน วัดจากภาพฉาก: [x, y] โลก — จุดผูกสายแขวน */
const EAVE: [number, number][] = [[50, 35], [70.4, 39], [118.5, 45]];
const eaveY = (x: number) => {
  for (let i = 1; i < EAVE.length; i++) if (x <= EAVE[i][0] || i === EAVE.length - 1) {
    const [x0, y0] = EAVE[i - 1], [x1, y1] = EAVE[i];
    return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  }
  return EAVE[0][1];
};
/** ของเตี้ยแบบถาด/เบาะ ที่ต้องเอียงตามมุมมอง */
const PERSPECTIVE = new Set(['bed', 'coolmat', 'litter', 'peepad', 'bowl', 'rug']);

/** who: all = ทุกตัว · climber = แมวกับนก · bird = นกเท่านั้น */
interface Perch { x0: number; x1: number; y: number; label: string; who: 'all' | 'climber' | 'bird'; cage?: number }
/** vp = จุดลับตาของภาพฉาก [x, y] (วัดจากเส้นพื้น/ผนัง/คานในภาพ) */
interface RoomDef { bg: string; door: number; perches: Perch[]; ambient: boolean; name: string; vp: [number, number]; }
/** ที่สูงของแต่ละห้อง (พิกัดโลก) — ช่อง 0 คือพื้นเสมอ */
const ROOMS: Record<RoomKey, RoomDef> = {
  terrace: {
    bg: 'bg_home', door: 44, ambient: true, name: 'ชานบ้าน', vp: [120, 70],
    perches: [
      { x0: FLOORS.terrace[0], x1: FLOORS.terrace[1], y: GROUND + 4, label: '', who: 'all' },
      { x0: 89, x1: 130, y: 108, label: 'นั่งบนม้านั่ง', who: 'all' },
      { x0: 72, x1: 162, y: 90, label: 'เดินบนราวระเบียง', who: 'climber' },
      { x0: 225, x1: 247, y: 124, label: 'เกาะขอบโอ่ง', who: 'bird' },
      { x0: 199, x1: 221, y: 143, label: 'เกาะขอบกระถาง', who: 'bird' },
    ],
  },
  room: {
    bg: 'bg_room', door: 158, ambient: false, name: 'ในบ้าน', vp: [122, 62],
    perches: [
      { x0: FLOORS.room[0], x1: FLOORS.room[1], y: GROUND + 4, label: '', who: 'all' },
      { x0: 50, x1: 134, y: 124, label: 'เดินบนฟูก', who: 'all' },
      { x0: 81, x1: 133, y: 111, label: 'นอนบนม้วนเสื่อ', who: 'climber' },
      { x0: 204, x1: 236, y: 105, label: 'นั่งริมหน้าต่าง', who: 'climber' },
      { x0: 199, x1: 218, y: 97, label: 'นั่งบนทีวี', who: 'climber' },
      { x0: 101, x1: 143, y: 30, label: 'เกาะใบพัดลม', who: 'bird' },
    ],
  },
};

type Action = 'idle' | 'walk' | 'eat' | 'happy' | 'sleep' | 'squat';
interface Plan { x: number; action: Action; dur: number; perch?: number; food?: string; room?: RoomKey; }
interface Actor {
  id: number; x: number; face: 1 | -1; target: number;
  action: Action; until: number; walkT: number; nextThink: number; food: string;
  perch: number; jump: number; jumpFrom: number; jumpTo: number; jumpX0: number; jumpX1: number;
  /** ผ่านประตู: 0 = ไม่ได้ผ่าน · >0 เวลาที่เหลือ (จางหาย/ปรากฏ) */
  door: number; doorOut: boolean;
  plan: Plan | null;
}

const img = (name: string) => { const im = new Image(); im.src = `./art/${name}.png`; return im; };
const ready = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface SceneInput {
  onTapPet(id: number): void;
  onHoldPet(id: number): void;
  onTapPoop(id: number): void;
  onTapItem(uid: number): void;
  onMoveItem(uid: number, x: number, lane: Lane): void;
  onRoomChange?(room: RoomKey): void;
}

type Hit = { kind: 'pet' | 'poop' | 'item'; id: number; x: number; y: number; w: number; h: number };

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private bgs: Record<RoomKey, { day: HTMLImageElement; night: HTMLImageElement }> = {
    terrace: { day: img('bg_home_day'), night: img('bg_home_night') },
    room: { day: img('bg_room_day'), night: img('bg_room_night') },
  };
  private icons = img('items');
  private sheets = new Map<string, HTMLImageElement>();
  private actors = new Map<number, Actor>();
  private K = 1;
  private viewW = 120;
  camX = 0;
  /** ห้องที่กำลังดู */
  viewRoom: RoomKey = 'terrace';
  private manualUntil = 0;
  private t = 0;
  private ambient = new Ambient();
  focusId: number | null = null;
  editMode = false;
  highlight: number | null = null;
  private hits: Hit[] = [];
  private drag: { uid: number; dx: number } | null = null;
  private g: GameState | null = null;

  constructor(private canvas: HTMLCanvasElement, private input: SceneInput) {
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
  private rx = (v: number) => Math.round(v * this.K) / this.K;

  /** ความกว้างโลกของห้อง (ตามสัดส่วนภาพฉาก) */
  worldWOf(room: RoomKey) { const b = this.bgs[room].day; return ready(b) ? (b.naturalWidth * WORLD_H) / b.naturalHeight : 250; }
  get worldW() { return this.worldWOf(this.viewRoom); }
  get roomName() { return ROOMS[this.viewRoom].name; }

  private toWorld(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    return { x: ((clientX - r.left) * dpr) / this.K + this.camX, y: ((clientY - r.top) * dpr) / this.K };
  }
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
        const it = this.g?.items.find(i => i.uid === this.drag!.uid);
        const canHang = !!it && !!furnitureOf(it.key).hang && !!HANG[this.viewRoom];
        const lane: Lane = canHang && w.y < GROUND - 40 ? 2 : w.y > GROUND + 7 ? 1 : 0;
        input.onMoveItem(this.drag.uid, w.x - this.drag.dx, lane);
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

  private clampCam(x: number) { return clamp(x, 0, Math.max(0, this.worldW - this.viewW)); }
  get viewCenter() { return this.camX + this.viewW / 2; }
  centerOnX(x: number) { this.camX = this.clampCam(x - this.viewW / 2); this.manualUntil = this.t + 8; }

  /** สลับไปดูอีกห้อง (ผู้เล่นกด) — กล้องเลิกตามน้องจนกว่าจะเลือกน้องใหม่ */
  showRoom(room: RoomKey, keepFocus = false) {
    if (room === this.viewRoom) return;
    this.viewRoom = room;
    if (!keepFocus) this.manualUntil = this.t + 1e6;
    const f = this.focusId !== null ? this.actors.get(this.focusId) : undefined;
    const p = f && this.g?.pets.find(x => x.id === f.id);
    this.camX = this.clampCam(p && p.room === room ? f!.x - this.viewW / 2 : ROOMS[room].door - this.viewW / 2);
    this.input.onRoomChange?.(room);
  }

  private petOf(id: number) { return this.g?.pets.find(p => p.id === id); }
  /** ที่สูงของห้อง = ที่ตายตัว + กรงนกที่แขวนอยู่ */
  private perchesOf(room: RoomKey): Perch[] {
    const base = ROOMS[room].perches;
    if (!this.g) return base;
    const cages = placed(this.g).filter(i => i.room === room && i.lane === 2).map(i => {
      const h = itemHeight(i.key), bottom = eaveY(i.x!) + CHAIN + h;
      return { x0: i.x! - 4, x1: i.x! + 4, y: bottom - h * 0.3, label: 'นอนในกรง', who: 'bird' as const, cage: i.uid };
    });
    return [...base, ...cages];
  }
  private canUse(q: Perch, p: Pet) {
    const sp = breedOf(p.breed).species;
    return q.who === 'all' || (q.who === 'climber' && sp !== 'dog') || (q.who === 'bird' && sp === 'bird');
  }
  private itemOf(kind: string, p: Pet, g: GameState): HomeItem | undefined {
    const ok = placed(g).filter(i => { const f = furnitureOf(i.key); return (f.kind === kind || (kind === 'toy' && f.toy)) && fits(f, p); });
    return ok.find(i => i.room === p.room) ?? ok[0];
  }

  /** ให้น้องทำท่า — ถ้ามีชาม/ของเล่น น้องเดินไปที่นั่นก่อน (ข้ามห้องได้) */
  react(id: number, action: 'eat' | 'happy', food = 'rice') {
    const a = this.actors.get(id), g = this.g, p = this.petOf(id);
    if (!a || !g || !p) return;
    const target = action === 'eat' ? this.itemOf('bowl', p, g) : Math.random() < 0.6 ? this.itemOf('toy', p, g) : undefined;
    if (target && target.x !== null) {
      const fl = FLOORS[target.room];
      this.go(a, { x: clamp(target.x + (a.x < target.x ? -10 : 10), fl[0], fl[1]), action, dur: action === 'eat' ? 3 : 2.2, food, room: target.room });
      return;
    }
    if (a.perch && action === 'eat') { this.go(a, { x: a.x, action, dur: 3, food, perch: a.perch }); return; }
    a.action = action; a.until = this.t + (action === 'eat' ? 3 : 2.2); a.food = food; a.plan = null;
  }
  goPoop(id: number, x: number, room: RoomKey) {
    const a = this.actors.get(id), fl = FLOORS[room];
    if (a) this.go(a, { x: clamp(x, fl[0], fl[1]), action: 'squat', dur: 1.4, room });
  }

  private go(a: Actor, plan: Plan) {
    const p = this.petOf(a.id);
    if (!p) return;
    a.plan = plan;
    const room = plan.room ?? p.room, tp = room === p.room ? plan.perch ?? 0 : 0;
    // ต้องลงจากที่สูงก่อน (หรือกระโดดตรงไปที่สูงอีกที่ถ้าอยู่ในแนว)
    if (a.perch && a.perch !== tp) {
      const per = this.perchesOf(p.room)[tp];
      this.startJump(a, tp && a.x >= per.x0 && a.x <= per.x1 ? tp : 0, a.x);
      return;
    }
    const fl = FLOORS[p.room];
    if (room !== p.room) a.target = ROOMS[p.room].door;
    else if (a.perch) { const per = this.perchesOf(p.room)[a.perch]; a.target = clamp(plan.x, per.x0 + 3, per.x1 - 3); }
    else a.target = clamp(plan.x, fl[0], fl[1]);
    a.action = 'walk';
  }
  private startJump(a: Actor, to: number, toX: number) {
    a.jump = 0.0001; a.jumpFrom = a.perch; a.jumpTo = to; a.jumpX0 = a.x; a.jumpX1 = toX; a.action = 'idle';
  }

  screenPos(id: number): { x: number; y: number } | null {
    const h = this.hits.find(x => x.kind === 'pet' && x.id === id);
    if (!h) return null;
    return { x: (h.x + h.w / 2 - this.camX) / this.viewW, y: h.y / WORLD_H };
  }
  centerOn(id: number) {
    this.focusId = id; this.manualUntil = 0;
    const p = this.petOf(id);
    if (p && p.room !== this.viewRoom) this.showRoom(p.room, true);
  }
  actorState(id: number) {
    const a = this.actors.get(id), p = this.petOf(id);
    if (!a || !p) return null;
    const q = this.perchesOf(p.room)[a.perch];
    return { action: a.action, perch: a.perch, perchLabel: q?.label ?? '', perchSpecial: !!q && q.who !== 'all', jumping: a.jump > 0, x: a.x, inView: p.room === this.viewRoom && a.door === 0 };
  }

  /** ถ่ายรูป: วาดฉากใหม่ที่ขนาด 4 พิกเซลจอต่อพิกเซลเกมพอดี (คมทุกพิกเซล ไม่เบลอ) */
  snapshot(): string {
    const S = 4, w = Math.round(this.viewW * S), h = WORLD_H * S;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const keep = { canvas: this.canvas, ctx: this.ctx, K: this.K, hits: this.hits };
    (this as unknown as { canvas: HTMLCanvasElement }).canvas = cv;
    this.ctx = cv.getContext('2d')!; this.K = S;
    if (this.g) this.draw(this.g);
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = `${7 * S}px Itim, sans-serif`; c.textAlign = 'right';
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillText('🐾 บ้านน้อน', w - 3 * S + 2, h - 3 * S + 2);
    c.fillStyle = '#fff'; c.fillText('🐾 บ้านน้อน', w - 3 * S, h - 3 * S);
    const url = cv.toDataURL('image/jpeg', 0.9);
    (this as unknown as { canvas: HTMLCanvasElement }).canvas = keep.canvas;
    this.ctx = keep.ctx; this.K = keep.K; this.hits = keep.hits;
    return url;
  }

  private sync(g: GameState) {
    const ids = new Set(g.pets.filter(p => p.status === 'home').map(p => p.id));
    for (const id of [...this.actors.keys()]) if (!ids.has(id)) this.actors.delete(id);
    for (const p of g.pets) {
      if (!ids.has(p.id) || this.actors.has(p.id)) continue;
      const fl = FLOORS[p.room];
      const others = [...this.actors.values()].map(a => a.x);
      const cands = [0.25, 0.4, 0.55, 0.7].map(f => clamp(this.camX + this.viewW * f, fl[0], fl[1]));
      const dist = (v: number) => Math.min(Infinity, ...others.map(o => Math.abs(o - v)));
      const x = cands.reduce((best, c) => (dist(c) > dist(best) ? c : best), cands[1]);
      this.actors.set(p.id, { id: p.id, x, face: 1, target: x, action: 'idle', until: 0, walkT: 0, nextThink: this.t + 1, food: 'rice',
        perch: 0, jump: 0, jumpFrom: 0, jumpTo: 0, jumpX0: x, jumpX1: x, door: 0, doorOut: false, plan: null });
    }
  }

  private think(a: Actor, p: Pet, g: GameState) {
    const stage = petStage(p, g.day), night = nightness(g.day) > 0.6;
    if (a.plan || a.jump > 0 || a.door > 0) return;
    if (a.action === 'eat' || a.action === 'happy' || a.action === 'squat') { if (this.t < a.until) return; a.action = 'idle'; }
    if (this.t < a.nextThink) return;
    a.nextThink = this.t + 2 + Math.random() * 4;
    const lazy = isSick(p) || isPostVax(p, g.day) || p.full < 0.15 || stage === 2;
    const canJump = stage < 2 && !isSick(p);
    const other: RoomKey = p.room === 'terrace' ? 'room' : 'terrace';
    // กลางคืน: ไปนอนที่นอนของตัวเอง (ข้ามห้องได้)
    if (night || (stage === 2 && Math.random() < 0.5)) {
      const bed = assignBeds(g).get(p.id);
      if (bed && bed.x !== null && bed.lane === 2) {
        const idx = this.perchesOf(bed.room).findIndex(q => q.cage === bed.uid);
        if (bed.room !== p.room || a.perch !== idx) { this.go(a, { x: bed.x, action: 'sleep', dur: 30, room: bed.room, perch: idx }); return; }
      } else if (bed && bed.x !== null && (bed.room !== p.room || Math.abs(a.x - bed.x) > 2)) { this.go(a, { x: bed.x, action: 'sleep', dur: 30, room: bed.room }); return; }
      a.action = 'sleep'; a.nextThink = this.t + 6 + Math.random() * 6; return;
    }
    if (lazy || Math.random() > 0.7) { a.action = 'idle'; return; }
    // บางทีเดินไปอีกห้อง
    if (Math.random() < 0.08) {
      const fl = FLOORS[other];
      this.go(a, { x: fl[0] + Math.random() * (fl[1] - fl[0]), action: 'idle', dur: 0, room: other });
      return;
    }
    // กระโดดขึ้นที่สูง (หรือลงมา) — บางที่เฉพาะแมว/นก
    const sp = breedOf(p.breed).species, climber = sp === 'cat' || sp === 'bird';
    const perches = this.perchesOf(p.room);
    if (canJump && Math.random() < (climber ? 0.25 : 0.18)) {
      const fl = FLOORS[p.room];
      if (a.perch) { this.go(a, { x: clamp(a.x + (Math.random() - 0.5) * 60, fl[0], fl[1]), action: 'idle', dur: 0 }); return; }
      const opts = perches.map((q, i) => ({ q, i })).filter(o => o.i > 0 && this.canUse(o.q, p));
      const { q, i } = opts[Math.floor(Math.random() * opts.length)];
      const px = q.x0 + 4 + Math.random() * (q.x1 - q.x0 - 8);
      this.go(a, { x: px, action: Math.random() < 0.35 ? 'sleep' : 'idle', dur: 6 + Math.random() * 8, perch: i });
      return;
    }
    if (a.perch) { const q = perches[a.perch]; a.target = clamp(a.x + (Math.random() - 0.5) * 30, q.x0 + 3, q.x1 - 3); a.action = 'walk'; return; }
    const fl = FLOORS[p.room];
    a.target = clamp(a.x + (Math.random() - 0.5) * 120, fl[0], fl[1]);
    a.action = 'walk';
  }

  update(g: GameState, dt: number) {
    this.g = g;
    this.t += dt;
    this.sync(g);
    if (ROOMS[this.viewRoom].ambient) this.ambient.update(dt, nightness(g.day));
    for (const p of g.pets) {
      const a = this.actors.get(p.id);
      if (!a) continue;
      this.think(a, p, g);
      const perches = this.perchesOf(p.room), fl = FLOORS[p.room];
      if (a.perch >= perches.length) { a.perch = 0; a.jump = 0; } // กรงถูกย้ายออก
      // ผ่านประตู: จางหายจากห้องนี้ แล้วโผล่อีกห้อง
      if (a.door > 0) {
        a.door -= dt;
        if (a.door <= 0) {
          if (a.doorOut) {
            const to: RoomKey = a.plan?.room ?? (p.room === 'terrace' ? 'room' : 'terrace');
            p.room = to; a.x = ROOMS[to].door; a.doorOut = false; a.door = 0.35;
            if (this.focusId === p.id && this.t > this.manualUntil) this.showRoom(to, true);
          } else { a.door = 0; if (a.plan) this.go(a, a.plan); }
        }
        continue;
      }
      if (a.jump > 0) {
        a.jump += dt / (Math.abs(perches[a.jumpFrom].y - perches[a.jumpTo].y) > 30 ? 0.6 : 0.45);
        a.x = a.jumpX0 + (a.jumpX1 - a.jumpX0) * Math.min(1, a.jump);
        if (a.jump >= 1) {
          a.jump = 0; a.perch = a.jumpTo;
          if (a.plan) this.go(a, a.plan);
        }
        continue;
      }
      if (a.perch === 0) a.x = clamp(a.x, fl[0], fl[1]);
      if (a.action === 'walk') {
        const dx = a.target - a.x, speed = petStage(p, g.day) === 2 ? 12 : a.perch === 2 ? 10 : a.plan ? 26 : 20;
        if (Math.abs(dx) < 1) {
          a.action = 'idle';
          if (a.plan) {
            const room = a.plan.room ?? p.room;
            if (room !== p.room) { a.door = 0.35; a.doorOut = true; continue; }
            const tp = a.plan.perch ?? 0;
            if (a.perch !== tp) {
              const q = perches[tp];
              this.startJump(a, tp, tp ? clamp(a.plan.x, q.x0 + 3, q.x1 - 3) : a.x);
              continue;
            }
            a.action = a.plan.action; a.until = this.t + a.plan.dur; a.food = a.plan.food ?? a.food;
            a.nextThink = a.until; a.plan = null;
          }
          continue;
        }
        a.face = dx > 0 ? 1 : -1;
        a.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
        a.walkT += dt;
      }
    }
    const f = this.focusId !== null ? this.actors.get(this.focusId) : undefined;
    const fp = f && this.petOf(f.id);
    if (f && fp && fp.room === this.viewRoom && this.t > this.manualUntil && !this.editMode) {
      const want = this.clampCam(f.x - this.viewW / 2);
      this.camX += (want - this.camX) * Math.min(1, dt * 2.5);
    }
    this.camX = this.clampCam(this.camX);
  }

  draw(g: GameState) {
    const c = this.ctx, K = this.K, room = this.viewRoom, bg = this.bgs[room];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2a1d14';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(K, 0, 0, K, 0, 0);
    const n = nightness(g.day), W = this.worldW;
    const drawBg = (im: HTMLImageElement, alpha: number) => {
      if (!ready(im) || alpha <= 0) return;
      c.globalAlpha = alpha;
      c.drawImage(im, this.rx(-this.camX), 0, this.rx(W), WORLD_H);
      c.globalAlpha = 1;
    };
    drawBg(bg.day, 1);
    drawBg(bg.night, n);
    const s = ready(bg.day) ? WORLD_H / bg.day.naturalHeight : 0.52;
    const amb = ROOMS[room].ambient;
    if (amb) this.ambient.drawBack(c, { camX: this.camX, s, rx: this.rx, n });

    this.hits = [];
    const here = placed(g).filter(i => i.room === room);
    const pets = g.pets.filter(p => p.room === room && this.actors.has(p.id)).map(p => ({ p, a: this.actors.get(p.id)! }));
    const flat = (k: string) => k === 'rug' || k === 'coolmat' || k === 'peepad';
    // น้องบนที่สูง (สูงสุดอยู่หลังสุด) — ยกเว้นในกรงแขวนที่วาดพร้อมกรง
    const perchesHere = this.perchesOf(room);
    for (const { p, a } of pets.filter(x => x.a.perch > 0 && x.a.jump === 0 && !perchesHere[x.a.perch]?.cage).sort((u, v) => perchesHere[u.a.perch].y - perchesHere[v.a.perch].y)) this.drawPet(p, a, g);
    for (const it of here.filter(i => flat(i.key))) this.drawHomeItem(it, n);
    for (const it of here.filter(i => i.lane === 0 && !flat(i.key))) this.drawHomeItem(it, n);
    for (const po of g.poops.filter(x => x.room === room)) {
      const x = po.x - this.camX, y = GROUND + 6;
      drawPoop(c, x, y, this.rx, po.small, this.t, g.day - po.day);
      this.hits.push({ kind: 'poop', id: po.id, x: po.x - 7, y: y - 12, w: 14, h: 14 });
    }
    for (const { p, a } of pets.filter(x => x.a.perch === 0 || x.a.jump > 0).sort((u, v) => u.a.x - v.a.x)) this.drawPet(p, a, g);
    for (const it of here.filter(i => i.lane === 1 && !flat(i.key))) this.drawHomeItem(it, n);
    // กรงแขวนที่ชายคา: วาดกรงก่อนแล้ววาดนกทับ (ให้เห็นน้องชัด)
    for (const it of here.filter(i => i.lane === 2)) {
      const idx = perchesHere.findIndex(q => q.cage === it.uid);
      this.drawHomeItem(it, n);
      for (const { p, a } of pets.filter(x => x.a.perch === idx && x.a.jump === 0)) this.drawPet(p, a, g);
    }
    if (amb) this.ambient.drawFront(c, { camX: this.camX, s, rx: this.rx, n });
    if (this.editMode) {
      c.fillStyle = 'rgba(4,52,44,0.12)';
      c.fillRect(0, GROUND - 4, this.viewW, WORLD_H - GROUND + 4);
    }
  }

  private drawHomeItem(it: HomeItem, n: number) {
    const f = furnitureOf(it.key), x = it.x! - this.camX, h = itemHeight(it.key), fw = f.w * ITEM_SCALE;
    const top = eaveY(it.x!), y = it.lane === 2 ? top + CHAIN + h : LANE_Y[it.lane];
    if (it.lane === 2) { this.ctx.fillStyle = '#5a4630'; this.ctx.fillRect(this.rx(x - 0.3), this.rx(top), this.rx(0.6) || 1 / this.K, CHAIN + 1); }
    // ของเตี้ยที่ภาพวาดมองจากตรงกลาง: เอียงขอบบนเข้าหาจุดลับตาของฉาก ให้เข้ากับมุมกล้องเมื่อวางชิดซ้าย/ขวา
    // เส้นลึกที่ผ่านฐานของ → จุดลับตา: เลื่อน x ต่อความสูง 1 หน่วย = (vpX − x) / (ฐาน − vpY)
    const [vx, vy] = ROOMS[it.room].vp;
    const tilt = PERSPECTIVE.has(it.key) && it.lane !== 2 ? clamp((-(vx - it.x!) / (y - vy)) * 0.9, -1.1, 1.1) : 0;
    drawItem(this.ctx, it.key, x, y, this.rx, this.t, it.fill, toiletCap(f), n, ITEM_SCALE, tilt);
    this.hits.push({ kind: 'item', id: it.uid, x: it.x! - fw / 2, y: y - h, w: fw, h: Math.max(h, 8) });
    if (this.editMode) {
      const c = this.ctx;
      c.strokeStyle = this.highlight === it.uid ? '#FAC775' : 'rgba(225,245,238,0.85)';
      c.lineWidth = (1 / this.K) * 2;
      c.setLineDash([2, 1.5]);
      c.strokeRect(this.rx(x - fw / 2 - 1), this.rx(y - h - 1), this.rx(fw + 2), this.rx(h + 2));
      c.setLineDash([]);
    }
  }

  private drawPet(p: Pet, a: Actor, g: GameState) {
    const br: Breed = breedOf(p.breed), stage = petStage(p, g.day);
    const main = this.sheet(br.art), extra = this.sheet(`${br.art}_x`), sleepy = this.sheet(`${br.art}_s`);
    if (!ready(main)) return;
    const perches = this.perchesOf(p.room);
    let im = main, cols = 4, col = 0, scale = br.scale, lift = 0, row: number = stage;
    const step = Math.floor(a.walkT / (stage === 2 ? 0.28 : 0.18));
    let feet = perches[a.perch].y;
    if (a.jump > 0) {
      const from = perches[a.jumpFrom].y, to = perches[a.jumpTo].y;
      feet = from + (to - from) * a.jump - Math.sin(a.jump * Math.PI) * (14 + Math.abs(from - to) * 0.2);
      col = br.species === 'bird' ? 1 : 3;
    }
    const bed = a.action === 'sleep' && !a.perch ? assignBeds(g).get(p.id) : undefined;
    if (bed && bed.x !== null && bed.lane !== 2 && bed.room === p.room && Math.abs(bed.x - a.x) < 3) feet = LANE_Y[bed.lane] - itemHeight(bed.key) * ({ bed: 0.35, coolmat: 0.3, condo: 0.86, cage: 0.3 }[bed.key] ?? 0.3);
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
      // ท่านอน: ชีต _s (คอลัมน์ 1 = ขดหลับ) · ถ้ายังไม่โหลดใช้ท่าขดจากแถววัยชรา
      case 'sleep':
        if (ready(sleepy)) { im = sleepy; cols = 2; col = 0; scale = br.scale * br.sScale; }
        else { col = 3; row = 2; if (stage === 0) scale *= 0.72; }
        break;
      case 'squat': col = 0; lift = -0.5; break;
      default:
        col = 0;
        // ป่วย/ซึมหลังฉีดยา: นอนหมอบตาปรือ (ชีต _s คอลัมน์ 2)
        if ((isSick(p) || isPostVax(p, g.day)) && ready(sleepy)) { im = sleepy; cols = 2; col = 1; scale = br.scale * br.sScale; }
    }
    const fw = im.naturalWidth / cols, fh = im.naturalHeight / 3;
    const w = fw * scale, h = fh * scale, sx = a.x - this.camX;
    const x = this.rx(sx - w / 2), y = this.rx(feet - h - lift);
    const c = this.ctx;
    if (a.action === 'eat' && !this.itemOf('bowl', p, g) && ready(this.icons)) {
      const ic = foodOf(a.food).icon, iw = this.icons.naturalWidth / 4, ih = this.icons.naturalHeight / 3, s = 0.32;
      c.drawImage(this.icons, (ic % 4) * iw, Math.floor(ic / 4) * ih, iw, ih, this.rx(sx + a.face * w * 0.38 - iw * s / 2), this.rx(feet - ih * s), this.rx(iw * s), this.rx(ih * s));
    }
    // ผ่านประตู: จางลง/ค่อยๆ ปรากฏ
    const alpha = a.door > 0 ? (a.doorOut ? a.door / 0.35 : 1 - a.door / 0.35) : 1;
    c.globalAlpha = alpha;
    if (a.jump === 0) { c.fillStyle = 'rgba(60,35,20,0.25)'; c.fillRect(this.rx(sx - w * 0.3), feet - 1.5, this.rx(w * 0.6), 1.5); }
    c.save();
    if (isSick(p)) c.filter = 'saturate(0.35) brightness(0.85)';
    if (a.face < 0) { c.translate(x * 2 + w, 0); c.scale(-1, 1); }
    c.drawImage(im, col * fw, row * fh, fw, fh, x, y, this.rx(w), this.rx(h));
    c.restore();
    c.globalAlpha = 1;
    if (a.action === 'sleep') {
      c.fillStyle = '#E1F5EE';
      c.font = '6px Itim, sans-serif';
      c.fillText('z', sx + w * 0.3, y + 2 - (Math.floor(this.t * 1.5) % 3) * 2);
    }
    const bw = Math.max(26, w * 0.8), bh = Math.max(22, h * 0.9);
    this.hits.push({ kind: 'pet', id: p.id, x: a.x - bw / 2, y: feet - bh, w: bw, h: bh });
  }
}
