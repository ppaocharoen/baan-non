// หน้าตั้งต้น (ขั้นวางโครง): ฉากชั่วคราว + สัตว์ 8 สายพันธุ์เดินไปมา เพื่อเช็กว่าภาพ ความคม และ deploy ทำงาน
// ฉากจริงและ HUD มาในขั้นถัดไป
import './game.css';
import { BREEDS, type Breed } from '../engine/content';

const SCENE_W = 240, SCENE_H = 168;
const GROUND = Math.round(SCENE_H * 0.84); // พื้นเป็นแถบ 16% ล่าง

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let K = 1; // พิกเซลจอต่อ 1 พิกเซลเกม

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.floor((canvas.clientWidth * dpr) / SCENE_W));
  K = k;
  canvas.width = SCENE_W * k;
  canvas.height = SCENE_H * k;
}
window.addEventListener('resize', resize);
resize();

const sheets: Record<string, HTMLImageElement> = {};
for (const b of BREEDS) {
  const im = new Image();
  im.src = `./art/${b.art}.png`;
  sheets[b.art] = im;
}

interface Walker { breed: Breed; x: number; face: 1 | -1; speed: number; stage: 0 | 1 | 2; walkT: number; pauseUntil: number; }
const walkers: Walker[] = BREEDS.map((breed, i) => ({
  breed,
  x: 20 + i * 27,
  face: i % 2 ? 1 : -1,
  speed: 10 + (i % 3) * 4,
  stage: (i % 3) as 0 | 1 | 2,
  walkT: 0,
  pauseUntil: 0,
}));

const rx = (v: number) => Math.round(v * K) / K; // ปัดพิกัดลงตาราง K ภาพจะคม

function drawBackground(t: number) {
  // ท้องฟ้าชั่วคราว เปลี่ยนกลางวัน/กลางคืนทุก 40 วินาที (จะแทนด้วยภาพฉากจริง)
  const night = (Math.sin(t / 40 * Math.PI * 2) + 1) / 2;
  const mix = (a: number[], b: number[]) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * night)).join(',')})`;
  ctx.fillStyle = mix([150, 205, 230], [30, 40, 80]);
  ctx.fillRect(0, 0, SCENE_W, GROUND - 30);
  ctx.fillStyle = mix([70, 140, 110], [20, 50, 60]); // คลอง
  ctx.fillRect(0, GROUND - 30, SCENE_W, 30);
  ctx.fillStyle = mix([150, 100, 60], [70, 45, 35]); // พื้นไม้ชานบ้าน
  ctx.fillRect(0, GROUND, SCENE_W, SCENE_H - GROUND);
  ctx.fillStyle = mix([120, 78, 45], [55, 35, 28]);
  for (let x = 0; x < SCENE_W; x += 16) ctx.fillRect(x, GROUND, 1, SCENE_H - GROUND);
}

function drawWalker(w: Walker, dt: number, t: number) {
  const im = sheets[w.breed.art];
  if (!im.complete || !im.naturalWidth) return;
  const fw = im.naturalWidth / 4, fh = im.naturalHeight / 3;
  const walking = t > w.pauseUntil;
  let col = 0, lift = 0;
  if (walking) {
    w.x += w.face * w.speed * (w.stage === 2 ? 0.6 : 1) * dt;
    w.walkT += dt;
    if (w.x < 15) w.face = 1;
    if (w.x > SCENE_W - 15) w.face = -1;
    if (Math.random() < dt * 0.15) w.pauseUntil = t + 1 + Math.random() * 2;
    const step = Math.floor(w.walkT / (w.stage === 2 ? 0.28 : 0.18));
    if (w.breed.species === 'bird') { col = 2; lift = step % 2 ? 2 : 0; }
    else { col = 1 + (step % 2); }
  } else if (w.stage === 2) col = 3; // แก่แล้วชอบนอน
  const sc = w.breed.scale, ww = fw * sc, hh = fh * sc;
  const x = rx(w.x - ww / 2), y = rx(GROUND + 4 - hh - lift);
  ctx.fillStyle = 'rgba(60,35,20,0.25)';
  ctx.fillRect(rx(w.x - ww * 0.3), GROUND + 2.5, rx(ww * 0.6), 1.5);
  ctx.save();
  if (w.face < 0) { ctx.translate(x * 2 + ww, 0); ctx.scale(-1, 1); }
  ctx.drawImage(im, col * fw, w.stage * fh, fw, fh, x, y, rx(ww), rx(hh));
  ctx.restore();
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawBackground(t);
  for (const w of walkers) drawWalker(w, dt, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
