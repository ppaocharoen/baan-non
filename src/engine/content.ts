// เนื้อหาเกมจาก data/*.json — ทั้งเกมและ tools (sim/validate) อ่านผ่านไฟล์นี้
import breedsJson from '../../data/breeds.json';

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
}

export const BREEDS = breedsJson as Breed[];
export const breedOf = (k: string): Breed => {
  const b = BREEDS.find(x => x.key === k);
  if (!b) throw new Error(`ไม่รู้จักสายพันธุ์ ${k}`);
  return b;
};
