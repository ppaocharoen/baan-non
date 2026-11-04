// เวลาในเกม: แปลงเวลาจริง → วันในเกม และปฏิทิน (ฤดู · ชั่วโมง)
import { BALANCE as B } from './balance';

/** วันในเกมที่ผ่านไป เมื่อเปิดเกมอยู่ dt วินาที */
export const onlineDays = (seconds: number) => seconds / B.secondsPerGameDay;

/** วันในเกมที่ผ่านไปตอนปิดเกม (ช้าลง และมีเพดาน) */
export function offlineDays(seconds: number): number {
  if (!(seconds > 0)) return 0;
  return Math.min(B.offlineMaxDays, (seconds * B.offlineSpeed) / B.secondsPerGameDay);
}

/** ชั่วโมงจริงที่ต้องปิดเกม เพื่อให้เวลาในเกมผ่านไป days วัน (ใช้ใน sim/รายงาน) */
export const realHoursOffline = (days: number) => (days * B.secondsPerGameDay) / B.offlineSpeed / 3600;

export const SEASONS = ['ร้อน', 'ฝน', 'หนาว', 'ลมว่าว'] as const;

export interface Calendar {
  year: number;      // เริ่มที่ 1
  season: number;    // 0–3
  dayOfSeason: number; // เริ่มที่ 1
  hour: number;      // 0–23.99
}
export function calendar(day: number): Calendar {
  const d = Math.floor(day), perYear = B.daysPerSeason * B.seasonsPerYear;
  return {
    year: Math.floor(d / perYear) + 1,
    season: Math.floor((d % perYear) / B.daysPerSeason),
    dayOfSeason: (d % B.daysPerSeason) + 1,
    hour: (day - d) * 24,
  };
}

/** ความมืด 0 (กลางวัน) → 1 (กลางคืน) ไล่ช่วงเช้ามืดและหัวค่ำ */
export function nightness(day: number): number {
  const h = (day - Math.floor(day)) * 24;
  if (h >= 7 && h < 17.5) return 0;
  if (h >= 19 || h < 5) return 1;
  if (h < 7) return 1 - (h - 5) / 2;       // 5–7 โมง สว่างขึ้น
  return (h - 17.5) / 1.5;                 // 17:30–19:00 มืดลง
}
