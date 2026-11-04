// มินิเกมฝึก: แถบมีเครื่องหมายวิ่งไปมา แตะให้ตรงโซนเขียว 5 ครั้ง ทำครบก็จบ
import { BALANCE as B } from '../engine/balance';

export function runTraining(host: HTMLElement, petName: string, onDone: (hits: number) => void) {
  host.innerHTML = `
    <h3>ฝึก ${petName}<span></span></h3>
    <p>แตะให้ตรงโซนเขียว ${B.trainTaps} ครั้ง</p>
    <div class="trainbar"><div class="zone"></div><div class="mark"></div></div>
    <div class="taps"></div>
    <button class="cta" id="tap">แตะ!</button>`;
  const bar = host.querySelector<HTMLElement>('.trainbar')!;
  const zone = host.querySelector<HTMLElement>('.zone')!;
  const mark = host.querySelector<HTMLElement>('.mark')!;
  const taps = host.querySelector<HTMLElement>('.taps')!;
  const btn = host.querySelector<HTMLButtonElement>('#tap')!;
  let hits = 0, n = 0, pos = 0, dir = 1, z0 = 0, z1 = 0, raf = 0, last = performance.now(), done = false;
  const newZone = () => {
    const w = 0.22 - n * 0.025;              // แคบลงทีละนิด
    z0 = 0.1 + Math.random() * (0.8 - w); z1 = z0 + w;
    zone.style.left = `${z0 * 100}%`; zone.style.width = `${w * 100}%`;
  };
  const marks: boolean[] = [];
  const render = () => { taps.textContent = Array.from({ length: B.trainTaps }, (_, i) => (i < marks.length ? (marks[i] ? '★' : '✕') : '○')).join(' '); };
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    pos += dir * dt * (0.9 + n * 0.15);
    if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
    mark.style.left = `${pos * 100}%`;
    if (!done && bar.isConnected) raf = requestAnimationFrame(loop);
  };
  const tap = () => {
    if (done) return;
    const ok = pos >= z0 && pos <= z1;
    marks.push(ok); if (ok) hits++; n++;
    render();
    if (n >= B.trainTaps) {
      done = true; cancelAnimationFrame(raf);
      btn.textContent = `เสร็จ! ได้ ${hits}/${B.trainTaps}`;
      setTimeout(() => onDone(hits), 700);
    } else newZone();
  };
  btn.addEventListener('click', tap);
  bar.addEventListener('pointerdown', tap);
  newZone(); render();
  raf = requestAnimationFrame(loop);
}
