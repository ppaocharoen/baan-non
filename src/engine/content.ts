// เนื้อหาเกมจาก data/*.json — ทั้งเกมและ tools (sim/validate) อ่านผ่านไฟล์นี้
import breedsJson from '../../data/breeds.json';
import foodsJson from '../../data/foods.json';

export type Species = 'dog' | 'cat' | 'bird';

export interface Breed {
  key: string;
  species: Species;
  name: string;
  desc: string;
  /** ช่วงอายุขัย (วันในเกม) สุ่มไว้ตอนได้สัตว์มา */
  life: [number, number];
  /** อายุที่เปลี่ยนวัย (วันในเกม): เด็กถึง · โตถึง (เกินนั้น = แก่) */
  stages: [number, number];
  /** ชื่อไฟล์ชีต 4×3 ใน public/art/ (ไม่มีนามสกุล) */
  art: string;
  /** ขนาดภาพในฉาก (พิกเซลเกมต่อพิกเซลภาพ) */
  scale: number;
  /** ตัวคูณขนาดของชีตท่าเพิ่ม `<art>_x.png` (2×3: กิน · ท่าเฉพาะชนิด) ให้ตัวเท่าชีตหลัก */
  xScale: number;
}

export const BREEDS = breedsJson as Breed[];
export const breedOf = (k: string): Breed => {
  const b = BREEDS.find(x => x.key === k);
  if (!b) throw new Error(`ไม่รู้จักสายพันธุ์ ${k}`);
  return b;
};

export interface Food {
  key: string;
  name: string;
  price: number;
  /** ตัวคูณความผูกพันที่ได้ตอนให้อาหาร */
  bondMult: number;
  /** ตัวคูณโอกาสป่วย (ยิ่งต่ำยิ่งป่วยยาก) */
  sickMult: number;
  /** ช่องในชีต items.png */
  icon: number;
}
export const FOODS = foodsJson as Food[];
export const foodOf = (k: string): Food => {
  const f = FOODS.find(x => x.key === k);
  if (!f) throw new Error(`ไม่รู้จักอาหาร ${k}`);
  return f;
};
