// ฉาก 2 ห้อง: ชานบ้านริมคลอง · ในบ้าน — จอแนวตั้งเป็นหน้าต่างมองทีละห้อง กล้องเลื่อนซ้ายขวา
// น้องเดินไปใช้ของ (นอนที่เบาะ กินที่ชาม เข้าห้องน้ำ เล่นของเล่น) · กระโดดขึ้นที่สูง · เดินผ่านประตูข้ามห้องเอง
// รับแตะ/กดค้าง/ปัด · โหมดจัดบ้านลากของได้
import { breedOf, foodOf, type Breed } from '../engine/content';
import type { GameState } from '../engine/core';
import { assignBeds, fits, FLOORS, furnitureOf, HANG, placed, roomsOf, ROOM_TH, toiletCap, type HomeItem, type Lane, type RoomKey } from '../engine/home';
import { isPostVax, isSick, petStage, type Pet } from '../engine/pet';
import { nightness } from '../engine/time';
import { Ambient } from './ambient';
import { drawItem, drawPoop, itemHeight, ITEM_SCALE, spriteW } from './furniture';
import { drawRoomArt, ROOM_ART, ROOM_W } from './rooms';

/** ความสูงโลก (พิกเซลเกม) — ความกว้างโลกตามสัดส่วนภาพฉาก */
const WORLD_H = 168;
const GROUND = 142;
/** แนวเท้าของแถวของ: 0 = แถวหลัง · 1 = แถวหน้า */
const LANE_Y = [GROUND + 2, GROUND + 16];
/** แนวชายคาที่แขวนของ (ความสูงโลก) และความยาวสายแขวน */
const CHAIN = 16;
/** แนวขอบล่างโครงหลังคา (จันทัน/เชิงชาย) ของชานบ้าน วัดจากภาพฉาก: [x, y] โลก — จุดผูกสายแขวน */
const EAVE: [number, number][] = [[50, 35], [70.4, 39], [118.5, 45]];
/** แนวที่ผูกสายแขวนของห้อง: ชานบ้านตามโครงหลังคา · ใต้ถุนตามคานพื้นเรือน */
const eaveY = (room: RoomKey, x: number) => {
  if (room === 'under') return 38;
  for (let i = 1; i < EAVE.length; i++) if (x <= EAVE[i][0] || i === EAVE.length - 1) {
    const [x0, y0] = EAVE[i - 1], [x1, y1] = EAVE[i];
    return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  }
  return EAVE[0][1];
};

/** who: all = ทุกตัว · climber = แมวกับนก · bird = นกเท่านั้น */
interface Perch { x0: number; x1: number; y: number; label: string; who: 'all' | 'climber' | 'bird'; cage?: number; /** คอนนกที่วางบนพื้น */ stand?: number }
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
  // ห้องจากการต่อเติมบ้าน — ที่สูงวัดจากภาพที่วาดด้วยโค้ดใน rooms.ts (ได้ภาพจริงแล้วต้องวัดใหม่)
  under: {
    bg: 'bg_under', door: 30, ambient: false, name: 'ใต้ถุนเรือน', vp: [125, 70],
    perches: [
      { x0: FLOORS.under[0], x1: FLOORS.under[1], y: GROUND + 4, label: '', who: 'all' },
      { x0: 102, x1: 150, y: 120, label: 'นั่งบนแคร่ไม้ไผ่', who: 'all' },
      { x0: 184, x1: 216, y: 103, label: 'นอนในเปลญวน', who: 'climber' },
    ],
  },
  kitchen: {
    bg: 'bg_kitchen', door: 24, ambient: false, name: 'ครัวหลังบ้าน', vp: [125, 70],
    perches: [
      { x0: FLOORS.kitchen[0], x1: FLOORS.kitchen[1], y: GROUND + 4, label: '', who: 'all' },
      { x0: 122, x1: 168, y: 112, label: 'แอบขึ้นโต๊ะกับข้าว', who: 'climber' },
      { x0: 150, x1: 200, y: 82, label: 'นั่งริมหน้าต่าง', who: 'climber' },
      { x0: 32, x1: 78, y: 70, label: 'เกาะชั้นวางหม้อ', who: 'bird' },
      { x0: 210, x1: 234, y: 116, label: 'เกาะขอบโอ่ง', who: 'bird' },
    ],
  },
  garden: {
    bg: 'bg_garden', door: 20, ambient: false, name: 'สวนกล้วย', vp: [125, 70],
    perches: [
      { x0: FLOORS.garden[0], x1: FLOORS.garden[1], y: GROUND + 4, label: '', who: 'all' },
      { x0: 90, x1: 110, y: 127, label: 'นั่งบนตอไม้', who: 'all' },
      { x0: 10, x1: 240, y: 100, label: 'เดินบนรั้วไม้ไผ่', who: 'climber' },
      { x0: 124, x1: 146, y: 40, label: 'เกาะใบกล้วย', who: 'bird' },
    ],
  },
  pier: {
    bg: 'bg_pier', door: 20, ambient: false, name: 'ท่าน้ำ', vp: [125, 70],
    perches: [
      { x0: FLOORS.pier[0], x1: FLOORS.pier[1], y: GROUND + 4, label: '', who: 'all' },
      { x0: 66, x1: 134, y: 122, label: 'นั่งในเรือพาย', who: 'all' },
      { x0: 178, x1: 186, y: 106, label: 'ยืนบนเสาผูกเรือ', who: 'climber' },
      { x0: 191, x1: 199, y: 84, label: 'เกาะเสาตะเกียง', who: 'bird' },
    ],
  },
};

/** ท่าดูแล/ของเล่นที่เล่นกับน้องในฉาก */
export type FxKind = 'tub' | 'dish' | 'brush' | 'mist' | 'syringe' | 'pill' | 'drops' | 'ball' | 'rope' | 'wand' | 'bell';
const FX_DUR: Record<FxKind, number> = { tub: 3.6, dish: 3.2, brush: 2.6, mist: 2.4, syringe: 1.8, pill: 1.9, drops: 1.8, ball: 3.2, rope: 2.8, wand: 3, bell: 2.6 };
interface Fx { kind: FxKind; t: number; dur: number; x0: number; /** ลูกบอล: จุดที่น้องวิ่งไปถึง */ x1: number; }
/** ช่องในชีต items.png (4×3) */
const ICON = { tub: 4, brush: 5, dish: 6, syringe: 8, bottle: 9, blister: 10 };
const ease = (u: number) => u * u * (3 - 2 * u);

type Action = 'idle' | 'walk' | 'eat' | 'happy' | 'sleep' | 'squat';
interface Plan { x: number; action: Action; dur: number; perch?: number; food?: string; room?: RoomKey; fx?: FxKind; }
interface Actor {
  id: number; x: number; face: 1 | -1; target: number;
  action: Action; until: number; walkT: number; nextThink: number; food: string;
  perch: number; jump: number; jumpFrom: number; jumpTo: number; jumpX0: number; jumpX1: number;
  /** ผ่านประตู: 0 = ไม่ได้ผ่าน · >0 เวลาที่เหลือ (จางหาย/ปรากฏ) */
  door: number; doorOut: boolean;
  plan: Plan | null;
  /** กำลังอาบน้ำ/แปรง/ฉีดยา/เล่นของเล่นอยู่ */
  fx: Fx | null;
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
  /** ภาพฉาก — โหลดเฉพาะห้องที่มีภาพจริง (ROOM_ART) ห้องอื่นวาดด้วยโค้ด */
  private bgs: Partial<Record<RoomKey, { day: HTMLImageElement; night: HTMLImageElement }>> = Object.fromEntries(
    [...ROOM_ART].map(k => [k, { day: img(`${ROOMS[k].bg}_day`), night: img(`${ROOMS[k].bg}_night`) }]));
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
  worldWOf(room: RoomKey) { const b = this.bgs[room]?.day; return b && ready(b) ? (b.naturalWidth * WORLD_H) / b.naturalHeight : ROOM_W; }
  get worldW() { return this.worldWOf(this.viewRoom); }
  get roomName() { return ROOM_TH[this.viewRoom]; }

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
      const h = itemHeight(i.key), bottom = eaveY(room, i.x!) + CHAIN + h;
      return { x0: i.x! - 4, x1: i.x! + 4, y: bottom - h * 0.3, label: 'นอนในกรง', who: 'bird' as const, cage: i.uid };
    });
    const stands = placed(this.g).filter(i => i.room === room && i.lane !== 2 && furnitureOf(i.key).kind === 'perch').map(i => (
      { x0: i.x! - 3, x1: i.x! + 3, y: LANE_Y[i.lane] - itemHeight(i.key) * 0.93, label: 'เกาะคอนเล่น', who: 'bird' as const, stand: i.uid }));
    return [...base, ...cages, ...stands];
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
  /** เล่นท่าดูแล/ของเล่นกับน้อง (ลงจากที่สูงก่อนถ้าอยู่บนนั้น) · คืนเวลาที่ใช้ (วินาที) */
  care(id: number, kind: FxKind): number {
    const a = this.actors.get(id);
    if (!a) return 0;
    if (a.door > 0 || a.jump > 0 || a.perch) { a.fx = null; this.go(a, { x: a.x, action: 'idle', dur: 0, perch: 0, fx: kind }); return FX_DUR[kind] + 0.8; }
    this.startFx(a, kind);
    return FX_DUR[kind];
  }
  private startFx(a: Actor, kind: FxKind) {
    const p = this.petOf(a.id), fl = FLOORS[p?.room ?? 'terrace'];
    // ลูกบอลโยนไปทางที่มีที่ว่าง
    if (kind === 'ball' && clamp(a.x + a.face * 30, fl[0], fl[1]) - a.x === 0) a.face = a.face > 0 ? -1 : 1;
    a.fx = { kind, t: 0, dur: FX_DUR[kind], x0: a.x, x1: clamp(a.x + a.face * 30, fl[0], fl[1]) };
    a.action = 'idle'; a.plan = null; a.target = a.x;
  }
  goPoop(id: number, x: number, room: RoomKey) {
    const a = this.actors.get(id), fl = FLOORS[room];
    if (a) this.go(a, { x: clamp(x, fl[0], fl[1]), action: 'squat', dur: 1.4, room });
  }

  private go(a: Actor, plan: Plan) {
    const p = this.petOf(a.id);
    if (!p) return;
    if (a.fx) return; // กำลังอาบน้ำ/เล่นอยู่ ไม่ไปไหน
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
        perch: 0, jump: 0, jumpFrom: 0, jumpTo: 0, jumpX0: x, jumpX1: x, door: 0, doorOut: false, plan: null, fx: null });
    }
  }

  private think(a: Actor, p: Pet, g: GameState) {
    const stage = petStage(p, g.day), night = nightness(g.day) > 0.6;
    if (a.plan || a.jump > 0 || a.door > 0 || a.fx) return;
    if (a.action === 'eat' || a.action === 'happy' || a.action === 'squat') { if (this.t < a.until) return; a.action = 'idle'; }
    if (this.t < a.nextThink) return;
    a.nextThink = this.t + 2 + Math.random() * 4;
    const lazy = isSick(p) || isPostVax(p, g.day) || p.full < 0.15 || stage === 2;
    const canJump = stage < 2 && !isSick(p);
    const others = roomsOf(g).filter(r => r !== p.room);
    const other: RoomKey = others[Math.floor(Math.random() * others.length)] ?? p.room;
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
    if (others.length && Math.random() < 0.08) {
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
      if (a.fx && a.door === 0 && a.jump === 0) { this.stepFx(a, p, dt); continue; }
      this.think(a, p, g);
      const perches = this.perchesOf(p.room), fl = FLOORS[p.room];
      if (a.perch >= perches.length) { a.perch = 0; a.jump = 0; } // กรงถูกย้ายออก
      // ผ่านประตู: จางหายจากห้องนี้ แล้วโผล่อีกห้อง
      if (a.door > 0) {
        a.door -= dt;
        if (a.door <= 0) {
          if (a.doorOut) {
            const to: RoomKey = a.plan?.room ?? 'terrace';
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
            if (a.plan.fx) { this.startFx(a, a.plan.fx); continue; }
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

  private stepFx(a: Actor, p: Pet, dt: number) {
    const fx = a.fx!;
    fx.t += dt;
    if (fx.kind === 'ball') { // วิ่งไล่ลูกบอล
      const u = clamp((fx.t - 0.6) / 0.9, 0, 1);
      a.x = fx.x0 + (fx.x1 - fx.x0) * u;
      if (u > 0 && u < 1) a.walkT += dt;
    }
    void p;
    if (fx.t >= fx.dur) {
      const after = fx.kind === 'syringe' || fx.kind === 'pill' || fx.kind === 'drops';
      a.fx = null; a.action = after ? 'idle' : 'happy'; a.until = this.t + (after ? 0 : 1.4); a.nextThink = this.t + 1.5;
    }
  }

  /** ไอคอนจาก items.png ตามความกว้าง w (x, y = กึ่งกลางล่าง) · rot = หมุน (เรเดียน) */
  private icon(i: number, x: number, y: number, w: number, alpha = 1, rot = 0) {
    if (!ready(this.icons) || alpha <= 0) return;
    const iw = this.icons.naturalWidth / 4, ih = this.icons.naturalHeight / 3, h = (w * ih) / iw, c = this.ctx;
    c.save(); c.globalAlpha = alpha;
    if (rot) { c.translate(x, y - h / 2); c.rotate(rot); c.translate(-x, -(y - h / 2)); }
    c.drawImage(this.icons, (i % 4) * iw, Math.floor(i / 4) * ih, iw, ih, this.rx(x - w / 2), this.rx(y - h), this.rx(w), this.rx(h));
    c.restore();
  }
  private dots(list: [number, number][], col: string, size = 1) {
    const c = this.ctx; c.fillStyle = col;
    for (const [x, y] of list) c.fillRect(this.rx(x), this.rx(y), size, size);
  }

  draw(g: GameState): void {
    const c = this.ctx, K = this.K, room = this.viewRoom, bg = this.bgs[room];
    if (!roomsOf(g).includes(room)) { this.viewRoom = 'terrace'; return this.draw(g); }
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
    if (bg) { drawBg(bg.day, 1); drawBg(bg.night, n); }
    else drawRoomArt(c, room, this.rx(-this.camX), n);
    const s = bg && ready(bg.day) ? WORLD_H / bg.day.naturalHeight : 0.52;
    const amb = ROOMS[room].ambient;
    if (amb) this.ambient.drawBack(c, { camX: this.camX, s, rx: this.rx, n });

    this.hits = [];
    const here = placed(g).filter(i => i.room === room);
    const pets = g.pets.filter(p => p.room === room && this.actors.has(p.id)).map(p => ({ p, a: this.actors.get(p.id)! }));
    const flat = (k: string) => k === 'rug' || k === 'coolmat' || k === 'peepad';
    // น้องบนที่สูง (สูงสุดอยู่หลังสุด) — ยกเว้นในกรงแขวนที่วาดพร้อมกรง
    const perchesHere = this.perchesOf(room);
    for (const { p, a } of pets.filter(x => x.a.perch > 0 && x.a.jump === 0 && !perchesHere[x.a.perch]?.cage && !perchesHere[x.a.perch]?.stand).sort((u, v) => perchesHere[u.a.perch].y - perchesHere[v.a.perch].y)) this.drawPet(p, a, g);
    for (const it of here.filter(i => flat(i.key))) this.drawHomeItem(it, n);
    for (const it of here.filter(i => i.lane === 0 && !flat(i.key))) this.drawHomeItem(it, n);
    for (const po of g.poops.filter(x => x.room === room)) {
      const x = po.x - this.camX, y = GROUND + 6;
      drawPoop(c, x, y, this.rx, po.small, this.t, g.day - po.day);
      this.hits.push({ kind: 'poop', id: po.id, x: po.x - 7, y: y - 12, w: 14, h: 14 });
    }
    for (const { p, a } of pets.filter(x => x.a.perch === 0 || x.a.jump > 0).sort((u, v) => u.a.x - v.a.x)) this.drawPet(p, a, g);
    for (const it of here.filter(i => i.lane === 1 && !flat(i.key))) this.drawHomeItem(it, n);
    // นกบนคอนที่วางพื้น: วาดหลังคอน
    for (const { p, a } of pets.filter(x => x.a.perch > 0 && x.a.jump === 0 && perchesHere[x.a.perch]?.stand)) this.drawPet(p, a, g);
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
    const top = eaveY(it.room, it.x!), y = it.lane === 2 ? top + CHAIN + h : LANE_Y[it.lane];
    if (it.lane === 2) { this.ctx.fillStyle = '#5a4630'; this.ctx.fillRect(this.rx(x - 0.3), this.rx(top), this.rx(0.6) || 1 / this.K, CHAIN + 1); }
    // ของเตี้ยที่ภาพวาดมองจากตรงกลาง: เอียงขอบบนเข้าหาจุดลับตาของฉาก ให้เข้ากับมุมกล้องเมื่อวางชิดซ้าย/ขวา
    drawItem(this.ctx, it.key, x, y, this.rx, this.t, it.fill, toiletCap(f), n);
    this.hits.push({ kind: 'item', id: it.uid, x: it.x! - fw / 2, y: y - h, w: fw, h: Math.max(h, 8) });
    if (this.editMode) {
      const c = this.ctx;
      c.strokeStyle = this.highlight === it.uid ? '#FAC775' : 'rgba(225,245,238,0.85)';
      c.lineWidth = (1) * 2;
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
    // ท่าดูแล/ของเล่น: ปรับท่า และเตรียมวาดของทับหน้าน้อง
    const fx = a.jump === 0 ? a.fx : null, bird = br.species === 'bird', hop = stage < 2 ? 3 : 0;
    let dx = 0, front: ((sx: number, w: number, h: number) => void) | null = null;
    if (fx) {
      const t = fx.t, base = feet, ft = fx.dur;
      const ex = () => { if (ready(extra)) { im = extra; cols = 2; scale = br.scale * br.xScale; } };
      const reset = () => { im = main; cols = 4; scale = br.scale; row = stage; };
      reset(); col = 0; lift = 0;
      switch (fx.kind) {
        case 'tub': case 'dish': {
          const tw = fx.kind === 'dish' ? 24 : 34, inA = 0.45, inB = ft - 0.75;
          const show = clamp(t / 0.3, 0, 1) * clamp((ft - 0.45 - t) / 0.3, 0, 1);
          let inside = false;
          if (t >= inA && t < inA + 0.35) { lift = Math.sin(((t - inA) / 0.35) * Math.PI) * 10; col = bird ? 1 : hop; }
          else if (t >= inA + 0.35 && t < inB) { inside = true; feet = base - (bird ? 0 : 1); col = bird ? (Math.floor(t * 8) % 2 ? 1 : 2) : 0; lift = Math.abs(Math.sin(t * 5)) * 1.2; dx = Math.sin(t * 9) * 0.6; }
          else if (t >= inB && t < inB + 0.35) { lift = Math.sin(((t - inB) / 0.35) * Math.PI) * 10; col = bird ? 1 : hop; }
          else if (t >= inB + 0.35) { col = hop; lift = Math.abs(Math.sin(t * 9)) * 4; dx = Math.sin(t * 30) * 0.7; } // สะบัดน้ำ
          front = (sx, w, h) => {
            this.icon(fx.kind === 'dish' ? ICON.dish : ICON.tub, a.x - this.camX, base + 1.5, tw * (0.6 + 0.4 * show), show);
            const tt = this.t;
            if (inside) this.dots(Array.from({ length: 7 }, (_, i) => [sx - tw * 0.4 + ((i * 13) % 24) * (tw / 26), base - 12 - ((tt * 14 + i * 5) % 14)] as [number, number]), fx.kind === 'dish' ? '#bfe8f2' : '#f4fbff', 2);
            if (t >= inB + 0.35) this.dots(Array.from({ length: 8 }, (_, i) => { const ang = i * 0.8 + tt * 3; return [sx + Math.cos(ang) * (w * 0.5 + 3), base - h * 0.5 + Math.sin(ang) * h * 0.4] as [number, number]; }), '#9fd8f0', 1.5);
          };
          break;
        }
        case 'brush': case 'mist': {
          col = t > ft - 0.7 ? hop : 0; if (t > ft - 0.7) lift = Math.abs(Math.sin(t * 9)) * 4;
          if (bird) col = t > ft - 0.7 ? 1 : 0;
          front = (sx, w, h) => {
            if (fx.kind === 'brush' && t < ft - 0.6) {
              this.icon(ICON.brush, sx + Math.sin(t * 7) * w * 0.25, feet - h * 0.45, 15, clamp(t / 0.2, 0, 1), -0.5);
              this.dots(Array.from({ length: 5 }, (_, i) => [sx + Math.sin(i * 2.1 + t) * w * 0.3, feet - h * 0.5 + ((t * 20 + i * 4) % 14)] as [number, number]), '#f3e3c3', 1.2);
            }
            if (fx.kind === 'mist' && t < ft - 0.5) this.dots(Array.from({ length: 9 }, (_, i) => [sx + (((i * 37) % 20) - 10) * (w / 20), feet - h - 10 + ((t * 30 + i * 7) % 20)] as [number, number]), '#9fd8f0', 1.5);
          };
          break;
        }
        case 'syringe': {
          if (t > 0.5 && t < 0.75) lift = Math.sin(((t - 0.5) / 0.25) * Math.PI) * 3; // สะดุ้ง
          front = (sx, w, h) => {
            const tx = sx - a.face * w * 0.08, ty = feet - h * 0.62;
            const e = t < 0.5 ? 1 - ease(t / 0.5) : t < 1.1 ? 0 : ease(clamp((t - 1.1) / 0.4, 0, 1));
            const ox = a.face * 14 * e, oy = -12 * e;
            this.icon(ICON.syringe, tx + ox + 7, ty + oy + 6, 16, clamp((ft - t) / 0.3, 0, 1), Math.PI);
          };
          break;
        }
        case 'pill': {
          if (t > 0.95) { ex(); col = 0; lift = Math.floor(this.t * 4) % 2 ? 0.5 : 0; }
          front = (sx, w, h) => {
            const bx = sx + a.face * (w * 0.5 + 6), by = feet - 2;
            this.icon(ICON.blister, bx, by, 13, clamp(t / 0.2, 0, 1) * clamp((ft - t) / 0.3, 0, 1));
            if (t > 0.5 && t < 1) { const u = (t - 0.5) / 0.5, mx = sx + a.face * w * 0.42, my = feet - h * 0.5; this.dots([[bx + (mx - bx) * u, by - 8 + (my - by + 8) * u - Math.sin(u * Math.PI) * 8]], '#f4f1ea', 2); }
          };
          break;
        }
        case 'drops':
          front = (sx, w, h) => {
            const bx = sx - a.face * w * 0.05, by = feet - h - 4;
            this.icon(ICON.bottle, bx, by, 11, clamp(t / 0.2, 0, 1) * clamp((ft - t) / 0.3, 0, 1));
            if (t > 0.3 && t < 1.3) this.dots([0, 1, 2].map(i => [bx + (i - 1), by + 1 + ((t * 26 + i * 5) % (h * 0.5))] as [number, number]), '#e8d070', 1.5);
          };
          break;
        case 'ball': {
          const run = t > 0.6 && t < 1.5;
          if (run) col = bird ? 2 : 1 + (step % 2); else if (t >= 1.5) { col = hop; lift = Math.abs(Math.sin(t * 9)) * 4; }
          front = (sx, w) => {
            const off = a.face * (w * 0.5 + 3);
            let bx: number, by: number;
            if (t < 0.6) { bx = fx.x0 + off; by = base - Math.abs(Math.sin(t * 10)) * 4; }
            else if (t < 1.0) { const u = (t - 0.6) / 0.4; bx = fx.x0 + off + (fx.x1 - fx.x0) * u; by = base - Math.sin(u * Math.PI) * 16; }
            else { bx = a.x + off; by = base - Math.abs(Math.sin(t * 7)) * (t < 1.5 ? 3 : 1.5); }
            void sx;
            if (!spriteW(this.ctx, 'ball', bx - this.camX, by, this.rx, 7)) this.dots([[bx - this.camX - 2, by - 4]], '#e05a3a', 4);
          };
          break;
        }
        case 'rope':
          dx = -a.face * Math.abs(Math.sin(t * 6)) * 2.5; col = t > ft - 0.6 ? hop : step % 2; if (t > ft - 0.6) lift = Math.abs(Math.sin(t * 9)) * 4;
          front = (sx, w, h) => {
            if (t > ft - 0.6) return;
            const mx = sx + a.face * w * 0.42, my = feet - h * 0.55, hx = sx + a.face * (w * 0.5 + 20) - dx, hy = feet - h * 0.8 - 6;
            for (let i = 0; i <= 16; i++) { const u = i / 16; this.dots([[mx + (hx - mx) * u, my + (hy - my) * u + Math.sin(u * Math.PI) * 2]], i % 2 ? '#c0645a' : '#f3e3c3', 1.4); }
            this.dots([[hx - 1, hy - 1]], '#e8b890', 3);
          };
          break;
        case 'wand': {
          const fxp = Math.sin(t * 3.5) * 12;
          col = hop; lift = Math.abs(Math.sin(t * 7)) * 6;
          front = (sx, w, h) => {
            if (t > ft - 0.4) return;
            if (fxp * a.face < -4) a.face = a.face > 0 ? -1 : 1;
            const fx2 = sx + fxp, fy = feet - h - 2 + Math.cos(t * 7) * 2;
            if (!spriteW(this.ctx, 'wand', fx2, fy, this.rx, 16)) this.dots([[fx2, fy - 4]], '#c0645a', 3);
          };
          break;
        }
        case 'bell':
          col = 0; lift = Math.floor(t * 6) % 2 ? 1.5 : 0;
          if (t > ft - 0.5) { col = 1; lift = Math.abs(Math.sin(t * 9)) * 4; }
          front = (sx, w, h) => { drawItem(this.ctx, 'bell', sx + a.face * (w * 0.5 + 3) + Math.sin(t * 8) * 1.5, feet - h * 0.35, this.rx, this.t, 0, 0, 0, 1.1); };
          break;
      }
    }
    const fw = im.naturalWidth / cols, fh = im.naturalHeight / 3;
    const w = fw * scale, h = fh * scale, sx = a.x - this.camX + dx;
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
    front?.(sx, w, h);
    if (a.action === 'sleep') {
      c.fillStyle = '#E1F5EE';
      c.font = '6px Itim, sans-serif';
      c.fillText('z', sx + w * 0.3, y + 2 - (Math.floor(this.t * 1.5) % 3) * 2);
    }
    const bw = Math.max(26, w * 0.8), bh = Math.max(22, h * 0.9);
    this.hits.push({ kind: 'pet', id: p.id, x: a.x - bw / 2, y: feet - bh, w: bw, h: bh });
  }
}
