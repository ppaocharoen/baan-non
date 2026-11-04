# บ้านน้อน · Baan Non: Klong Life

เกมเลี้ยงน้องหมา แมว และนกไทย ในเรือนไทยริมคลองยุคปัจจุบัน เล่นบนเว็บและมือถือ (PWA)

เล่นได้ที่ https://ppaocharoen.github.io/baan-non

## คำสั่ง
| คำสั่ง | ทำอะไร |
|---|---|
| `npm install` | ติดตั้งครั้งแรก |
| `npm run dev` | เปิดเกมในเครื่องเพื่อพัฒนา |
| `npm test` | ทดสอบเครื่องยนต์ |
| `npm run sim` | จำลองเล่นเช็กสมดุล |
| `npm run validate` | ตรวจข้อมูลใน `data/` |
| `npm run build` | validate + ตรวจ type + build ลง `dist/` |

push ขึ้น `main` แล้ว GitHub Actions จะรัน test → sim → build → deploy ขึ้น GitHub Pages ให้เอง

## โครงสร้าง
- `data/` เนื้อหาเกม (สายพันธุ์ ฯลฯ)
- `src/engine/` เครื่องยนต์เกม ไม่แตะ DOM — sim เรียกใช้ตรงๆ ได้
- `src/game/` หน้าจอ ฉาก และการวาด
- `tools/` test · sim · validate · `art/` สคริปต์ตัดภาพ Python
- `public/art/` ภาพที่ใช้ในเกม · `art/raw/` ภาพดิบจาก Gemini

เอกสารออกแบบอยู่ในโปรเจกต์ claude.ai "เกมสัตว์เลี้ยง" (`pet-game-design.md`)
