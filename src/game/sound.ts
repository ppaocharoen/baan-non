// เสียงทั้งหมดสังเคราะห์สดด้วย WebAudio (ไม่ใช้ไฟล์เสียง) — โทนชิปทูนเข้ากับฟีลเครื่องเกมพกพา
// เสียงน้องต่างกันตามชนิด/สายพันธุ์/วัย และแต่ละตัวมีระดับเสียงของตัวเองนิดหน่อย
import type { Breed } from '../engine/content';

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  volume = 1;

  /** ต้องเรียกจาก event ที่ผู้เล่นแตะ (นโยบาย autoplay ของเบราว์เซอร์) */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor(); // กันเสียงแตกตอนหลายเสียงซ้อนกัน
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }

  private ok() { return this.enabled && this.ctx && this.master && this.ctx.state === 'running'; }
  private get now() { return this.ctx!.currentTime; }

  /** เสียงโทน: ความถี่ไล่จาก f0 → (f1) → f2 · ซองเสียงเข้าเร็วออกนุ่ม */
  private tone(o: { wave: Wave; f: number[]; dur: number; vol: number; at?: number; attack?: number; filter?: { type: BiquadFilterType; f: number[]; q?: number }; vibrato?: number }) {
    if (!this.ok()) return;
    const c = this.ctx!, t0 = this.now + (o.at ?? 0), t1 = t0 + o.dur;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.wave;
    osc.frequency.setValueAtTime(o.f[0], t0);
    o.f.slice(1).forEach((f, i, a) => osc.frequency.linearRampToValueAtTime(f, t0 + (o.dur * (i + 1)) / a.length));
    if (o.vibrato) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 7; lg.gain.value = o.vibrato;
      lfo.connect(lg).connect(osc.frequency); lfo.start(t0); lfo.stop(t1);
    }
    const a = o.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol * 1.8, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    let node: AudioNode = osc;
    if (o.filter) {
      const bq = c.createBiquadFilter();
      bq.type = o.filter.type; bq.Q.value = o.filter.q ?? 1;
      bq.frequency.setValueAtTime(o.filter.f[0], t0);
      o.filter.f.slice(1).forEach((f, i, arr) => bq.frequency.linearRampToValueAtTime(f, t0 + (o.dur * (i + 1)) / arr.length));
      node.connect(bq); node = bq;
    }
    node.connect(g).connect(this.master!);
    osc.start(t0); osc.stop(t1 + 0.02);
  }

  /** เสียงซ่า (สัญญาณรบกวนกรองความถี่) — เห่า กรุบกรอบ น้ำ */
  private noise(o: { dur: number; vol: number; f: number; q?: number; at?: number; type?: BiquadFilterType }) {
    if (!this.ok() || !this.noiseBuf) return;
    const c = this.ctx!, t0 = this.now + (o.at ?? 0);
    const src = c.createBufferSource(), bq = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    bq.type = o.type ?? 'bandpass'; bq.frequency.value = o.f; bq.Q.value = o.q ?? 1.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol * 1.8, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(bq).connect(g).connect(this.master!);
    src.start(t0, Math.random() * 0.3); src.stop(t0 + o.dur + 0.02);
  }

  // ---------------- เสียงน้อง ----------------

  /** pitch: 1 = ปกติ · เด็ก ~1.5 · แก่ ~0.85 · mood: 'happy' | 'normal' | 'sad' */
  voice(breed: Breed, pitch: number, mood: 'happy' | 'normal' | 'sad' = 'normal', at = 0) {
    const p = pitch * (mood === 'sad' ? 0.82 : 1), slow = mood === 'sad' ? 1.5 : 1;
    if (breed.species === 'dog') {
      const bark = (t: number, k = 1) => {
        this.noise({ dur: 0.06, vol: 0.35, f: 900 * p, q: 2, at: t });
        this.tone({ wave: 'square', f: [260 * p * k, 330 * p * k, 170 * p * k], dur: 0.13 * slow, vol: 0.22, at: t, filter: { type: 'lowpass', f: [1400 * p, 700 * p] } });
      };
      if (mood === 'sad') this.tone({ wave: 'triangle', f: [620 * p, 700 * p, 420 * p], dur: 0.55, vol: 0.18, at, attack: 0.06, vibrato: 12 });
      else { bark(at); if (mood === 'happy') bark(at + 0.19, 1.08); }
    } else if (breed.species === 'cat') {
      // เมี๊ยว: ฟอร์แมนต์ไล่ "มี-ยาว"
      const d = (mood === 'happy' ? 0.38 : 0.48) * slow * (p > 1.2 ? 0.75 : 1);
      this.tone({ wave: 'sawtooth', f: [480 * p, 720 * p, 760 * p, 440 * p], dur: d, vol: 0.3, at, attack: 0.04, vibrato: 6,
        filter: { type: 'bandpass', f: [900, 1700, 1500, 800], q: 3 } });
      if (mood === 'happy') this.tone({ wave: 'triangle', f: [90, 95, 88], dur: 0.5, vol: 0.12, at: at + d, attack: 0.05, vibrato: 18 }); // คราง
    } else if (breed.key === 'nokkhao') {
      // นกเขา: ขันคู "ครู่-ครู"
      const coo = (t: number) => this.tone({ wave: 'sine', f: [520 * p, 470 * p, 440 * p], dur: 0.26 * slow, vol: 0.25, at: t, attack: 0.05, vibrato: 10 });
      coo(at); coo(at + 0.32); if (mood === 'happy') coo(at + 0.6);
    } else if (breed.key === 'myna') {
      // นกเอี้ยง: ผิวปากเลียนเสียง
      this.tone({ wave: 'sine', f: [1200 * p, 2200 * p, 1600 * p], dur: 0.2 * slow, vol: 0.2, at });
      this.tone({ wave: 'sine', f: [1800 * p, 1300 * p, 2400 * p], dur: 0.25 * slow, vol: 0.18, at: at + 0.24 });
    } else {
      // นกกรงหัวจุก: เสียงร้องใสเป็นชุด
      const n = mood === 'happy' ? 5 : mood === 'sad' ? 2 : 3;
      for (let i = 0; i < n; i++) this.tone({ wave: 'sine', f: [2600 * p, 3600 * p, 3000 * p], dur: 0.07 * slow, vol: 0.18, at: at + i * 0.1 * slow });
    }
  }

  // ---------------- เสียงเหตุการณ์ ----------------
  munch() { for (let i = 0; i < 4; i++) this.noise({ dur: 0.05, vol: 0.25, f: 2200 + Math.random() * 800, q: 1.2, at: i * 0.16 + Math.random() * 0.03 }); }
  bubbles() { for (let i = 0; i < 7; i++) { const f = 500 + Math.random() * 900; this.tone({ wave: 'sine', f: [f, f * 1.9], dur: 0.06, vol: 0.14, at: i * 0.07 + Math.random() * 0.04 }); } this.noise({ dur: 0.35, vol: 0.08, f: 3000, q: 0.7 }); }
  /** โน้ตร้องเพลง (มินิเกมนก) i = ขั้นเสียง 0–4 */
  note(i: number) { const f = [784, 880, 988, 1175, 1319][i % 5]; this.tone({ wave: 'sine', f: [f, f * 1.06, f], dur: 0.22, vol: 0.16, vibrato: 6 }); }
  /** กระโดด (มินิเกมหมา) */
  hop() { this.tone({ wave: 'square', f: [330, 660], dur: 0.1, vol: 0.07, filter: { type: 'lowpass', f: [1800] } }); }
  /** กระดิ่งนก */
  bell() { this.tone({ wave: 'triangle', f: [2093], dur: 0.25, vol: 0.12 }); this.tone({ wave: 'triangle', f: [2637], dur: 0.3, vol: 0.08, at: 0.12 }); }
  ding() { this.tone({ wave: 'triangle', f: [1319], dur: 0.12, vol: 0.2 }); this.tone({ wave: 'triangle', f: [1760], dur: 0.25, vol: 0.18, at: 0.08 }); }
  miss() { this.tone({ wave: 'square', f: [180, 120], dur: 0.16, vol: 0.12, filter: { type: 'lowpass', f: [800] } }); }
  coin() { this.tone({ wave: 'square', f: [988], dur: 0.07, vol: 0.1 }); this.tone({ wave: 'square', f: [1319], dur: 0.2, vol: 0.1, at: 0.07 }); }
  click() { this.tone({ wave: 'square', f: [700, 900], dur: 0.035, vol: 0.06, filter: { type: 'lowpass', f: [2500] } }); }
  open() { this.tone({ wave: 'triangle', f: [660, 990], dur: 0.08, vol: 0.12 }); }
  close() { this.tone({ wave: 'triangle', f: [880, 520], dur: 0.08, vol: 0.1 }); }
  syringe() { this.tone({ wave: 'sine', f: [1500, 1700], dur: 0.05, vol: 0.12 }); this.noise({ dur: 0.12, vol: 0.08, f: 5000, q: 2, at: 0.05 }); }
  alert() { this.tone({ wave: 'square', f: [784], dur: 0.12, vol: 0.1 }); this.tone({ wave: 'square', f: [587], dur: 0.22, vol: 0.1, at: 0.14 }); }
  /** ทำนองสั้นๆ แนวเพนทาโทนิกไทย */
  jingle(sad = false) {
    const notes = sad ? [659, 587, 523, 440, 392] : [523, 587, 659, 784, 880, 1047];
    notes.forEach((f, i) => this.tone({ wave: 'triangle', f: [f], dur: sad ? 0.38 : 0.16, vol: 0.13, at: i * (sad ? 0.3 : 0.11), attack: 0.02 }));
  }
  shutter() { this.noise({ dur: 0.04, vol: 0.3, f: 3500, q: 0.6 }); this.noise({ dur: 0.06, vol: 0.25, f: 2500, q: 0.6, at: 0.07 }); }
  plop() { this.tone({ wave: 'sine', f: [320, 140], dur: 0.12, vol: 0.18 }); }
  sweep() { this.noise({ dur: 0.18, vol: 0.18, f: 4000, q: 0.8 }); this.noise({ dur: 0.15, vol: 0.14, f: 3000, q: 0.8, at: 0.16 }); this.tone({ wave: 'triangle', f: [1568, 2093], dur: 0.12, vol: 0.08, at: 0.3 }); }
  buy() { this.coin(); this.tone({ wave: 'triangle', f: [784, 1047], dur: 0.15, vol: 0.1, at: 0.2 }); }
  grow() { [523, 659, 784, 1047].forEach((f, i) => this.tone({ wave: 'square', f: [f], dur: 0.12, vol: 0.08, at: i * 0.09 })); }
}

export const sfx = new Sfx();

/** ระดับเสียงประจำตัวน้อง: วัย × ความต่างเล็กน้อยตาม id */
export function petPitch(id: number, stage: 0 | 1 | 2) {
  const h = ((id * 2654435761) >>> 0) / 4294967296; // 0–1 คงที่ต่อตัว
  return (stage === 0 ? 1.45 : stage === 2 ? 0.86 : 1) * (0.92 + h * 0.16);
}
