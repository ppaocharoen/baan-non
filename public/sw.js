// บ้านน้อน: เปิดเล่นออฟไลน์ได้หลังเปิดครั้งแรก
// หน้าเว็บ: ลองเน็ตก่อน (ได้เวอร์ชันใหม่) ถ้าไม่มีเน็ตใช้ที่เก็บไว้ · ไฟล์อื่น (ภาพ สคริปต์): ใช้ที่เก็บไว้ก่อนแล้วอัปเดตเบื้องหลัง
const CACHE = 'baan-non-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./'))));
    return;
  }
  // ใช้ที่เก็บไว้ก่อน แล้วอัปเดตเบื้องหลัง (ภาพที่แก้ใหม่จะมาในการเปิดครั้งถัดไป)
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
      return res;
    });
    return hit || net;
  }));
});
