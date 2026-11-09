// ฉากห้องใหม่จากการต่อเติมบ้าน — ระหว่างรอภาพเจนจาก Gemini วาดแบบพิกเซลด้วยโค้ดแทน
// พิกัดเป็นพิกเซลเกมของโลก (กว้าง ROOM_W สูง 168) · ox = เลื่อนตามกล้อง (-camX)
// เมื่อได้ภาพจริง (public/art/bg_<room>_day.png / _night.png) ให้ใส่ชื่อห้องใน ROOM_ART แล้ววัดที่สูงใน scene.ts ใหม่
import type { RoomKey } from '../engine/home';

export const ROOM_W = 250;
/** ห้องที่มีภาพจริงแล้ว (ไม่มีในนี้ = วาดด้วยโค้ด และไม่โหลดไฟล์ภาพ) */
export const ROOM_ART = new Set<RoomKey>(['terrace', 'room']);

type C = CanvasRenderingContext2D;
const H = 168;

export function drawRoomArt(c: C, room: RoomKey, ox: number, n: number) {
  const r = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x + ox), y, w, h); };
  switch (room) {
    case 'under': under(r); break;
    case 'kitchen': kitchen(r); break;
    case 'garden': garden(r); break;
    case 'pier': pier(r); break;
    default: r(0, 0, ROOM_W, H, '#6b4a30');
  }
  // กลางคืน: มืดลงโทนคราม (ครัวมีตะเกียง)
  if (n > 0) {
    c.fillStyle = `rgba(20,24,60,${0.5 * n})`; c.fillRect(Math.round(ox), 0, ROOM_W, H);
    const lamp = room === 'kitchen' ? [176, 52] : room === 'under' ? [126, 40] : room === 'pier' ? [196, 92] : null;
    if (lamp) for (let i = 3; i >= 1; i--) { c.fillStyle = `rgba(255,205,120,${0.07 * n})`; c.fillRect(Math.round(lamp[0] + ox - i * 12), lamp[1] - i * 10, i * 24, i * 22); }
  }
}

type R = (x: number, y: number, w: number, h: number, col: string) => void;

function sky(r: R, top: string, bottom: string, y1: number) {
  r(0, 0, ROOM_W, y1, top);
  r(0, Math.round(y1 * 0.55), ROOM_W, Math.round(y1 * 0.45), bottom);
}
/** ไม้กระดาน: แนวตั้ง (ผนัง) หรือแนวนอน (พื้น) มีลายไม้ประปราย */
function planks(r: R, y: number, h: number, a: string, b: string, step = 18, floor = false) {
  r(0, y, ROOM_W, h, a);
  if (floor) {
    for (let yy = y + 5; yy < y + h; yy += 7) r(0, yy, ROOM_W, 1, b);
    for (let i = 0; i < 24; i++) r((i * 47) % ROOM_W, y + 1 + ((i * 7) % Math.max(1, h - 2)), 1, 4, b);
  } else {
    for (let x = 0; x < ROOM_W; x += step) r(x, y, 1, h, b);
    for (let i = 0; i < 30; i++) r((i * 29) % ROOM_W + 4, y + ((i * 37) % Math.max(1, h - 6)), 5, 1, b);
  }
}

/** ใต้ถุนเรือน: คานพื้นด้านบน เสาเรือน ลานดิน แคร่ไม้ไผ่ เปลญวน */
function under(r: R) {
  sky(r, '#bfe3d0', '#9fd0a8', 140);
  for (let x = 0; x < ROOM_W; x += 16) r(x, 84 + ((x * 7) % 11), 14, 56, '#6fa560'); // พุ่มไม้ด้านหลัง
  r(0, 34, ROOM_W, 4, '#3d2817');
  planks(r, 0, 34, '#7a5232', '#5a3b22', 22, true);                                        // พื้นเรือนด้านบน (มองจากใต้ถุน)
  for (let x = 6; x < ROOM_W; x += 30) r(x, 34, 4, 6, '#4e341f');                     // หัวตง
  r(0, 138, ROOM_W, 30, '#b48a5a'); r(0, 138, ROOM_W, 2, '#8e6a40');                 // ลานดิน
  for (let x = 4; x < ROOM_W; x += 13) r(x, 150 + (x % 9), 3, 1, '#9a7448');
  for (const x of [14, 84, 160, 232]) { r(x, 38, 9, 104, '#6b4528'); r(x + 2, 38, 2, 104, '#8a5c36'); r(x - 1, 140, 11, 3, '#4e341f'); } // เสา
  // แคร่ไม้ไผ่ (ที่สูง y 120)
  r(100, 120, 52, 4, '#d8b860'); for (let x = 101; x < 152; x += 5) r(x, 120, 1, 4, '#a8883c');
  for (const x of [102, 147]) r(x, 124, 3, 18, '#a8883c');
  // เปลญวน ระหว่างเสา 160–232 (ที่สูง y ~104)
  for (let x = 170; x <= 230; x++) { const t = (x - 170) / 60, y = 70 + Math.round(Math.sin(t * Math.PI) * 34); r(x, y, 1, 3, x % 4 < 2 ? '#d0605a' : '#f0d070'); }
  r(168, 64, 2, 8, '#8a6a40'); r(231, 64, 2, 8, '#8a6a40');
  // ตะเกียงแขวน
  r(125, 38, 1, 8, '#3d2817'); r(123, 46, 5, 6, '#e8b04a');
}

/** ครัวหลังบ้าน: ผนังไม้ ชั้นวางหม้อ หน้าต่าง เตาถ่าน โต๊ะ โอ่งน้ำ */
function kitchen(r: R) {
  planks(r, 0, 140, '#c29466', '#a87a4e', 16);
  r(0, 0, ROOM_W, 10, '#7a5232');
  // หน้าต่างบานเฟี้ยม
  r(148, 38, 54, 44, '#3d2817'); r(151, 41, 48, 38, '#bfe8f2'); r(151, 62, 48, 17, '#8fc87a'); r(174, 41, 2, 38, '#3d2817');
  r(140, 38, 8, 44, '#8e5a32'); r(202, 38, 8, 44, '#8e5a32'); r(146, 82, 58, 3, '#6b4528');
  // ชั้นวาง (ที่สูง y 70)
  r(28, 70, 54, 3, '#6b4528'); r(30, 73, 2, 6, '#4e341f'); r(78, 73, 2, 6, '#4e341f');
  r(34, 60, 10, 10, '#5a5a62'); r(35, 58, 8, 2, '#3d3d44');                          // หม้อ
  r(50, 62, 8, 8, '#c86a3a'); r(62, 56, 6, 14, '#e0d8c0'); r(63, 54, 4, 2, '#a83a2a'); // ไห ขวด
  r(70, 63, 9, 7, '#d8c070');
  // เตาถ่าน
  r(92, 124, 18, 18, '#8a4a2a'); r(94, 122, 14, 3, '#5a2e18'); r(97, 116, 8, 6, '#3d3d44');
  // โต๊ะ (ที่สูง y 112)
  r(120, 112, 50, 4, '#7a4a28'); r(122, 116, 3, 26, '#5a3a20'); r(165, 116, 3, 26, '#5a3a20');
  r(130, 106, 12, 6, '#f4f1ea'); r(150, 108, 10, 4, '#6e9b45');
  // โอ่งน้ำ (ที่สูง y 116)
  r(208, 118, 28, 24, '#7a3e22'); r(206, 116, 32, 4, '#5a2e18'); r(212, 124, 4, 12, '#9a5a32');
  r(0, 140, ROOM_W, 28, '#d8c4a0'); for (let x = 0; x < ROOM_W; x += 12) r(x, 140, 1, 28, '#b8a07c'); r(0, 154, ROOM_W, 1, '#b8a07c');
  r(174, 40, 4, 10, '#3d2817'); r(173, 50, 6, 5, '#e8b04a');                          // ตะเกียง
}

/** สวนกล้วยหลังบ้าน: ต้นกล้วย รั้วไม้ไผ่ ตอไม้ สนามหญ้า */
function garden(r: R) {
  sky(r, '#a8dcf0', '#d6f0f4', 120);
  for (let x = 0; x < ROOM_W; x += 22) r(x, 70 + ((x * 5) % 13), 22, 50, '#7cb86a');   // แนวไม้ไกล
  for (const x of [30, 118, 196]) {                                                   // ต้นกล้วย
    r(x, 52, 6, 88, '#8aa850'); r(x + 1, 52, 2, 88, '#a8c468');
    r(x - 22, 46, 24, 7, '#4f9a3a'); r(x + 6, 40, 26, 7, '#5aaa42'); r(x - 14, 34, 20, 6, '#6cbc4c'); r(x + 4, 56, 22, 6, '#4f9a3a');
    r(x + 5, 64, 6, 10, '#7a4a7a');
  }
  // รั้วไม้ไผ่ (ที่สูง y 100)
  for (let x = 2; x < ROOM_W; x += 7) r(x, 100, 5, 40, x % 14 ? '#d8c070' : '#c8b060');
  r(0, 108, ROOM_W, 2, '#a8883c'); r(0, 126, ROOM_W, 2, '#a8883c');
  r(0, 138, ROOM_W, 30, '#7cbc58'); for (let x = 3; x < ROOM_W; x += 9) r(x, 140 + (x % 7), 1, 3, '#5a9a3e');
  // ตอไม้ (ที่สูง y 128)
  r(88, 128, 24, 14, '#8a5a32'); r(88, 127, 24, 3, '#c89a62'); r(94, 128, 12, 1, '#a87a4a');
  for (const [x, col] of [[150, '#f2b6c0'], [60, '#f0d070'], [220, '#f4f1ea']] as const) r(x, 146, 3, 3, col); // ดอกไม้
}

/** ท่าน้ำ: ฝั่งตรงข้าม คลอง เรือพาย พื้นท่าไม้ เสาผูกเรือ */
function pier(r: R) {
  sky(r, '#f6c89a', '#fbe2c0', 80);
  for (let x = 0; x < ROOM_W; x += 18) r(x, 62 + ((x * 3) % 9), 18, 22, '#5e9a52');   // ฝั่งตรงข้าม
  r(0, 82, ROOM_W, 56, '#4f93a8');
  for (let y = 88; y < 136; y += 6) for (let x = (y * 5) % 23; x < ROOM_W; x += 23) r(x, y, 6, 1, '#7fb8d0');
  // เรือพาย (หัวเรือ ที่สูง y 122)
  r(60, 122, 80, 6, '#7a4a28'); r(56, 120, 8, 4, '#7a4a28'); r(136, 120, 8, 4, '#7a4a28'); r(64, 128, 72, 3, '#5a3a20');
  r(96, 118, 10, 4, '#d8b860');
  planks(r, 138, 30, '#a87a4e', '#7a5232', 20, true);                                      // พื้นท่า
  r(0, 136, ROOM_W, 3, '#6b4528');
  // บันไดลงคลอง
  r(206, 138, 30, 4, '#8e6a40'); r(212, 142, 24, 4, '#7a5a34'); r(218, 146, 18, 4, '#6b4a2a');
  // เสาผูกเรือ (ที่สูง y 108)
  r(178, 108, 8, 32, '#6b4528'); r(177, 106, 10, 3, '#4e341f'); r(180, 118, 4, 2, '#d8c070');
  r(186, 119, 1, 1, '#d8c070'); for (let x = 140; x < 178; x += 3) r(x, 119 + Math.round((x - 140) / 13), 2, 1, '#d8c070'); // เชือก
  r(194, 84, 2, 54, '#3d2817'); r(191, 88, 8, 6, '#e8b04a');                          // ตะเกียงเสา
}
