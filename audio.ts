// ============================================================
// VANISKARA — Procedural audio engine
// Original score inspired by valiha / marovany plucked textures
// with light tropical percussion. All synthesised, zero assets.
// ============================================================

type Layer = 'plantation' | 'forest' | 'baobab' | 'mountain' | 'coast' | 'mystery' | 'boss';

// Pentatonic-flavoured scales (semitone offsets from root)
const SCALES: Record<Layer, number[]> = {
  plantation: [0, 2, 4, 7, 9],         // major pentatonic — warm, sunny
  forest: [0, 2, 3, 7, 9],             // dorian-ish — lush
  baobab: [0, 2, 4, 7, 9],             // major pentatonic, lower root
  mountain: [0, 3, 5, 7, 10],          // minor pentatonic — airy
  coast: [0, 2, 4, 7, 11],             // bright, open
  mystery: [0, 1, 5, 7, 8],            // exotic / mysterious
  boss: [0, 3, 5, 6, 10],              // tense
};

const ROOTS: Record<Layer, number> = {
  plantation: 261.63, // C4
  forest: 293.66,     // D4
  baobab: 220.0,      // A3
  mountain: 329.63,   // E4
  coast: 349.23,      // F4
  mystery: 233.08,    // Bb3
  boss: 196.0,        // G3
};

const TEMPO: Record<Layer, number> = {
  plantation: 132, forest: 138, baobab: 128, mountain: 142, coast: 136, mystery: 124, boss: 158,
};

function midiRatio(semitones: number) {
  return Math.pow(2, semitones / 12);
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  ambienceBus: GainNode | null = null;

  sfxOn = true;
  musicOn = true;

  private layer: Layer = 'plantation';
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private started = false;
  private ambienceNodes: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;

  // ---------------------------------------------------------
  init() {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 0.65 : 0;
      this.sfxBus.connect(this.master);

      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = this.musicOn ? 0.22 : 0;
      this.ambienceBus.connect(this.master);

      this.buildNoise();
      this.startAmbience();
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.65 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.1);
    if (this.ambienceBus && this.ctx) this.ambienceBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.1);
  }

  /** Dynamic audio ducking / sidechain: temporarily dips the music bed on big impacts for punchy production feel. */
  duck(duckFactor = 0.2, duration = 0.7) {
    if (!this.ctx || !this.musicBus || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const baseMusic = 0.5;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(baseMusic * duckFactor, t + 0.04);
    this.musicBus.gain.exponentialRampToValueAtTime(baseMusic, t + duration);
  }

  private buildNoise() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  // ---------------------------------------------------------
  // Ambience: filtered noise bed (wind / jungle) + random bird & insect calls
  // ---------------------------------------------------------
  private startAmbience() {
    if (!this.ctx || !this.noiseBuffer || !this.ambienceBus) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.6;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ambienceBus);
    src.start();
    lfo.start();
    this.ambienceNodes.push(src, lfo);
    this.scheduleCritters();
  }

  private scheduleCritters() {
    const tick = () => {
      if (this.ctx && this.musicOn) {
        const r = Math.random();
        if (this.layer === 'coast') this.wave();
        else if (this.layer === 'mystery') { if (r < 0.5) this.shimmer(); }
        else if (r < 0.45) this.bird();
        else if (r < 0.7) this.insect();
      }
      setTimeout(tick, 1600 + Math.random() * 3600);
    };
    setTimeout(tick, 1500);
  }

  private bird() {
    if (!this.ctx || !this.ambienceBus) return;
    const t = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 1800 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      const st = t + i * 0.09;
      o.frequency.setValueAtTime(base * (1 + i * 0.1), st);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + i * 0.1), st + 0.06);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.16, st + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.09);
      o.connect(g); g.connect(this.ambienceBus);
      o.start(st); o.stop(st + 0.12);
    }
  }

  private insect() {
    if (!this.ctx || !this.ambienceBus || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200 + Math.random() * 2500;
    bp.Q.value = 22;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // chirp train
    for (let i = 0; i < 7; i++) {
      const st = t + i * 0.055;
      g.gain.setValueAtTime(0.0, st);
      g.gain.linearRampToValueAtTime(0.1, st + 0.008);
      g.gain.linearRampToValueAtTime(0.0, st + 0.03);
    }
    src.connect(bp); bp.connect(g); g.connect(this.ambienceBus);
    src.start(t); src.stop(t + 0.5);
  }

  private wave() {
    if (!this.ctx || !this.ambienceBus || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1800, t + 0.9);
    lp.frequency.linearRampToValueAtTime(300, t + 2.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.9);
    g.gain.linearRampToValueAtTime(0, t + 2.4);
    src.connect(lp); lp.connect(g); g.connect(this.ambienceBus);
    src.start(t); src.stop(t + 2.5);
  }

  private shimmer() {
    if (!this.ctx || !this.ambienceBus) return;
    const t = this.ctx.currentTime;
    [1046, 1318, 1568].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const st = t + i * 0.18;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.07, st + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, st + 1.6);
      o.connect(g); g.connect(this.ambienceBus!);
      o.start(st); o.stop(st + 1.7);
    });
  }

  // ---------------------------------------------------------
  // Music sequencer
  // ---------------------------------------------------------
  setLayer(l: Layer) {
    if (this.layer === l) return;
    this.layer = l;
    this.step = 0;
  }

  startMusic() {
    this.init();
    if (!this.ctx || this.started) return;
    this.started = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    const scheduler = () => {
      if (!this.ctx) return;
      const secPerStep = 60 / TEMPO[this.layer] / 4; // 16ths
      while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
        this.playStep(this.step, this.nextNoteTime, secPerStep);
        this.nextNoteTime += secPerStep;
        this.step = (this.step + 1) % 64;
      }
      this.schedulerId = window.setTimeout(scheduler, 40);
    };
    scheduler();
  }

  stopMusic() {
    if (this.schedulerId !== null) {
      clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
    this.started = false;
  }

  private playStep(step: number, time: number, dur: number) {
    if (!this.ctx || !this.musicBus) return;
    if (!this.musicOn) return;
    const scale = SCALES[this.layer];
    const root = ROOTS[this.layer];
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const boss = this.layer === 'boss';

    // --- Plucked valiha-like ostinato (16ths, syncopated) ---
    const pluckPattern = boss
      ? [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1]
      : [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0];
    if (pluckPattern[s16]) {
      const degIdx = (s16 * 3 + bar * 2) % scale.length;
      const octave = s16 % 8 === 0 ? 1 : (s16 % 5 === 0 ? 2 : 1);
      const freq = root * midiRatio(scale[degIdx]) * octave;
      this.pluck(freq, time, dur * 3.2, boss ? 0.16 : 0.13);
    }

    // --- Counter melody every other bar, higher register ---
    if (!boss && bar % 2 === 1 && [0, 3, 6, 10, 12].includes(s16)) {
      const degIdx = (s16 + bar) % scale.length;
      const freq = root * midiRatio(scale[degIdx]) * 2;
      this.pluck(freq, time + 0.006, dur * 4, 0.085);
    }

    // --- Bass on strong beats ---
    if (s16 === 0 || s16 === 6 || s16 === 10) {
      const degIdx = bar % scale.length;
      const freq = root * midiRatio(scale[degIdx]) / 2;
      this.bass(freq, time, dur * 4, boss ? 0.3 : 0.22);
    }

    // --- Percussion: kabosy-ish woodblock + shaker ---
    const kick = [0, 6, 10];
    if (kick.includes(s16)) this.drum(time, 'kick', boss ? 0.5 : 0.36);
    if (s16 === 4 || s16 === 12) this.drum(time, 'snare', boss ? 0.26 : 0.18);
    if (s16 % 2 === 1) this.drum(time, 'shaker', 0.05 + (s16 % 4 === 3 ? 0.035 : 0));
    if (boss && s16 % 8 === 7) this.drum(time, 'tom', 0.3);
  }

  private pluck(freq: number, time: number, dur: number, vol: number) {
    if (!this.ctx || !this.musicBus) return;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = freq;
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(8000, freq * 7), time);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.6), time + dur);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.musicBus);
    o.start(time); o.stop(time + dur + 0.02);
    o2.start(time); o2.stop(time + dur + 0.02);
  }

  private bass(freq: number, time: number, dur: number, vol: number) {
    if (!this.ctx || !this.musicBus) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g); g.connect(this.musicBus);
    o.start(time); o.stop(time + dur + 0.02);
  }

  private drum(time: number, kind: 'kick' | 'snare' | 'shaker' | 'tom', vol: number) {
    if (!this.ctx || !this.musicBus || !this.noiseBuffer) return;
    if (kind === 'kick' || kind === 'tom') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      const f0 = kind === 'kick' ? 130 : 200;
      o.frequency.setValueAtTime(f0, time);
      o.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 42 : 80, time + 0.14);
      g.gain.setValueAtTime(vol, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      o.connect(g); g.connect(this.musicBus);
      o.start(time); o.stop(time + 0.22);
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      if (kind === 'snare') {
        f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 1.1;
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
        src.start(time); src.stop(time + 0.15);
      } else {
        f.type = 'highpass'; f.frequency.value = 6500;
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
        src.start(time); src.stop(time + 0.06);
      }
      src.connect(f); f.connect(g); g.connect(this.musicBus);
    }
  }

  // ---------------------------------------------------------
  // SFX
  // ---------------------------------------------------------
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.sfxBus || !this.sfxOn) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, freq: number, q: number, vol: number, delay = 0) {
    if (!this.ctx || !this.sfxBus || !this.sfxOn || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Collection: rising pitch with combo for that "streak" dopamine
  collect(comboIndex = 0) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const semi = steps[Math.min(steps.length - 1, comboIndex % steps.length)];
    const f = 660 * midiRatio(semi);
    this.tone(f, 0.11, 'triangle', 0.22, f * 1.35);
    this.tone(f * 2, 0.06, 'sine', 0.08);
  }
  collectGolden() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, f * 1.1, i * 0.045));
    this.noiseBurst(0.3, 5200, 3, 0.1);
  }
  collectFlower() {
    [1047, 1319, 1760].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.14, f * 1.05, i * 0.05));
  }
  collectCrystal() {
    this.tone(523, 0.35, 'sawtooth', 0.12, 1568);
    this.tone(1047, 0.35, 'sine', 0.1, 2093);
  }
  jump() {
    this.tone(330, 0.16, 'square', 0.12, 640);
    this.noiseBurst(0.08, 900, 1, 0.05);
  }
  slide() {
    this.noiseBurst(0.3, 1400, 0.8, 0.16);
    this.tone(220, 0.22, 'sawtooth', 0.07, 90);
  }
  hit() {
    this.duck(0.15, 0.8);
    this.tone(180, 0.35, 'sawtooth', 0.3, 55);
    this.noiseBurst(0.3, 300, 0.6, 0.3);
  }
  shieldBreak() {
    this.duck(0.2, 0.6);
    this.tone(880, 0.25, 'sine', 0.2, 300);
    this.noiseBurst(0.25, 2400, 2, 0.18);
  }
  whoosh() {
    this.noiseBurst(0.18, 1800, 1.2, 0.18);
    this.tone(480, 0.12, 'sine', 0.08, 120);
  }
  splash() {
    this.noiseBurst(0.25, 800, 0.9, 0.22);
    this.tone(320, 0.2, 'sine', 0.12, 140);
  }
  rumble() {
    this.tone(80, 0.45, 'triangle', 0.25, 45);
    this.noiseBurst(0.4, 250, 0.7, 0.15);
  }
  wingFlutter() {
    this.noiseBurst(0.15, 2200, 3.5, 0.12);
  }
  treeCrack() {
    this.tone(240, 0.15, 'sawtooth', 0.28, 80);
    this.noiseBurst(0.25, 600, 1.1, 0.25);
  }
  powerup() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.18, undefined, i * 0.05));
  }
  comboTier(tier: number) {
    const base = 660 * midiRatio(tier * 3);
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * midiRatio(s), 0.3, 'triangle', 0.18, undefined, i * 0.06));
  }
  dashReady() {
    [880, 1175].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.16, undefined, i * 0.08));
  }
  dash() {
    this.duck(0.18, 1.2);
    this.tone(200, 0.5, 'sawtooth', 0.22, 1400);
    this.noiseBurst(0.45, 2600, 0.7, 0.2);
    [659, 880, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, undefined, 0.05 + i * 0.05));
  }
  bossAppear() {
    this.duck(0.1, 1.8);
    this.tone(98, 1.1, 'sawtooth', 0.25, 62);
    this.tone(147, 1.1, 'triangle', 0.15, 98);
    this.noiseBurst(0.9, 220, 0.5, 0.2);
  }
  bossHit() {
    this.tone(320, 0.3, 'square', 0.2, 120);
    this.noiseBurst(0.3, 800, 1, 0.16);
  }
  bossDefeated() {
    [392, 494, 587, 784, 988, 1175].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.2, undefined, i * 0.1));
    this.noiseBurst(0.8, 3200, 1.2, 0.14, 0.2);
  }
  achievement() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.2, undefined, i * 0.09));
  }
  gameOver() {
    [523, 440, 349, 262].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.2, undefined, i * 0.16));
  }
  uiClick() {
    this.tone(660, 0.07, 'triangle', 0.14, 880);
  }
  purchase() {
    [659, 880, 1319].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.18, undefined, i * 0.07));
  }
  newRecord() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.18, undefined, i * 0.1));
  }
}

export const audio = new AudioEngine();
