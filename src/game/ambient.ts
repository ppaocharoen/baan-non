// ความเคลื่อนไหวในฉาก: ใบไม้ปลิว นกบินผ่าน แสงระยิบบนคลอง หิ่งห้อยตอนกลางคืน
// (เอากระถาง/ต้นไม้ไหวออก — เลื่อนภาพฉากเป็นแถบแล้วไม่เนียน ถ้าจะทำต้องเจนกระถางแยกเป็นสไปรต์)
// พิกัดทั้งหมดอ้างอิงภาพฉาก bg_home_*.png (กว้าง 480) แล้วแปลงเป็นพิกัดโลกด้วย s

const WATER = { x0: 322, x1: 436, y0: 168, y1: 204 };     // ผิวคลองที่เห็น
const FIREFLY = { x0: 120, x1: 470, y0: 140, y1: 250 };
const LEAF_SRC = { x0: 330, x1: 470, y0: 0, y1: 40 };

interface Leaf { x: number; y: number; vx: number; vy: number; ph: number; c: string; life: number; }
interface Bird { x: number; y: number; vx: number; flap: number; }
interface Glint { x: number; y: number; life: number; len: number; }
interface Fly { x: number; y: number; ph: number; sp: number; }

export class Ambient {
  private t = 0;
  private leaves: Leaf[] = [];
  private birds: Bird[] = [];
  private glints: Glint[] = [];
  private flies: Fly[] = Array.from({ length: 9 }, () => ({
    x: FIREFLY.x0 + Math.random() * (FIREFLY.x1 - FIREFLY.x0), y: FIREFLY.y0 + Math.random() * (FIREFLY.y1 - FIREFLY.y0),
    ph: Math.random() * 6.28, sp: 0.5 + Math.random(),
  }));
  private nextLeaf = 2;
  private nextBird = 4;

  update(dt: number, night: number) {
    this.t += dt;
    // ใบไม้ปลิว
    if ((this.nextLeaf -= dt) <= 0) {
      this.nextLeaf = 2.5 + Math.random() * 5;
      const pal = ['#7FA34A', '#A8B94E', '#D9A441', '#6E8B3D'];
      this.leaves.push({
        x: LEAF_SRC.x0 + Math.random() * (LEAF_SRC.x1 - LEAF_SRC.x0), y: LEAF_SRC.y0 + Math.random() * (LEAF_SRC.y1 - LEAF_SRC.y0),
        vx: -10 - Math.random() * 14, vy: 9 + Math.random() * 6, ph: Math.random() * 6.28, c: pal[Math.floor(Math.random() * pal.length)], life: 14,
      });
    }
    for (const l of this.leaves) { l.x += (l.vx + Math.sin(this.t * 2 + l.ph) * 8) * dt; l.y += l.vy * dt; l.life -= dt; }
    this.leaves = this.leaves.filter(l => l.life > 0 && l.y < 300 && l.x > -10);
    // นกบินผ่านตอนกลางวัน
    if (night < 0.5 && (this.nextBird -= dt) <= 0) {
      this.nextBird = 8 + Math.random() * 14;
      const n = 1 + Math.floor(Math.random() * 3), dir = Math.random() < 0.5 ? -1 : 1, y = 12 + Math.random() * 50;
      for (let i = 0; i < n; i++) this.birds.push({ x: dir < 0 ? 490 + i * 14 : -10 - i * 14, y: y + i * 5, vx: dir * (26 + Math.random() * 8), flap: Math.random() * 6 });
    }
    for (const b of this.birds) { b.x += b.vx * dt; b.flap += dt * 9; }
    this.birds = this.birds.filter(b => b.x > -40 && b.x < 520);
    // แสงระยิบบนผิวน้ำ
    if (Math.random() < dt * 5) this.glints.push({ x: WATER.x0 + Math.random() * (WATER.x1 - WATER.x0), y: WATER.y0 + Math.random() * (WATER.y1 - WATER.y0), life: 1.2, len: 2 + Math.floor(Math.random() * 4) });
    for (const g of this.glints) { g.life -= dt; g.x += dt * 3; }
    this.glints = this.glints.filter(g => g.life > 0);
    for (const f of this.flies) {
      f.x += Math.cos(this.t * f.sp + f.ph) * 6 * dt; f.y += Math.sin(this.t * f.sp * 1.3 + f.ph) * 4 * dt;
    }
  }

  /** วาดชั้นหลัง (ทับภาพฉาก ก่อนวาดน้อง) — ctx อยู่ในพิกัดโลกแล้ว */
  drawBack(c: CanvasRenderingContext2D, o: { camX: number; s: number; rx: (v: number) => number; n: number }) {
    const { camX, s, rx } = o;
    // แสงระยิบบนน้ำ
    for (const g of this.glints) {
      c.fillStyle = `rgba(255,255,230,${Math.min(1, g.life) * (0.55 - o.n * 0.3)})`;
      c.fillRect(rx(g.x * s - camX), rx(g.y * s), rx(g.len * s), rx(s));
    }
    // นก (เงาดำตัวเล็ก กระพือปีก 2 ท่า)
    c.fillStyle = 'rgba(40,30,25,0.85)';
    for (const b of this.birds) {
      const x = b.x * s - camX, y = b.y * s, up = Math.sin(b.flap) > 0, u = s;
      c.fillRect(rx(x), rx(y), rx(u), rx(u));
      c.fillRect(rx(x - 2 * u), rx(y + (up ? -u : u)), rx(2 * u), rx(u));
      c.fillRect(rx(x + u), rx(y + (up ? -u : u)), rx(2 * u), rx(u));
    }
  }

  /** วาดชั้นหน้า (หลังวาดน้อง) */
  drawFront(c: CanvasRenderingContext2D, o: { camX: number; s: number; rx: (v: number) => number; n: number }) {
    const { camX, s, rx } = o;
    for (const l of this.leaves) {
      c.globalAlpha = Math.min(1, l.life / 2) * (1 - o.n * 0.5);
      c.fillStyle = l.c;
      const x = l.x * s - camX, y = l.y * s, flip = Math.sin(this.t * 4 + l.ph) > 0;
      c.fillRect(rx(x), rx(y), rx(flip ? 2 * s : s), rx(flip ? s : 2 * s));
    }
    c.globalAlpha = 1;
    // หิ่งห้อยตอนกลางคืน
    if (o.n > 0.3) {
      for (const f of this.flies) {
        const blink = (Math.sin(this.t * 2.2 * f.sp + f.ph) + 1) / 2;
        if (blink < 0.35) continue;
        c.fillStyle = `rgba(214,255,120,${blink * o.n})`;
        c.fillRect(rx(f.x * s - camX), rx(f.y * s), rx(s), rx(s));
        c.fillStyle = `rgba(214,255,120,${blink * o.n * 0.25})`;
        c.fillRect(rx(f.x * s - camX - s), rx(f.y * s - s), rx(3 * s), rx(3 * s));
      }
    }
  }
}
