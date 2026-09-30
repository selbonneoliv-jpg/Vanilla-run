import * as THREE from 'three';
import { audio } from './audio';
import {
  loadSave, writeSave, OUTFITS, ACHIEVEMENTS, MISSIONS, todayKey, weekKeyOf, yesterdayKey,
  challengeForToday, dailyRewardFor, levelFromXp,
  type SaveData, type RunSummary,
} from './save';
import { decodeRun } from './share';

// ---------- Types ----------
export type GameState = 'menu' | 'intro' | 'playing' | 'paused' | 'dying' | 'gameover';

export interface GameStats {
  score: number;
  vanilla: number;
  goldenVanilla: number;
  distance: number;
  combo: number;
  maxCombo: number;
  multiplier: number;
  speed: number;
  bestScore: number;
  coins: number;
}

export interface PowerUpState {
  type: 'magnet' | 'goldenRush' | 'shield' | 'speed' | 'invincibility' | 'storm' | null;
  timeLeft: number;
}

export interface DashState {
  charge: number;   // 0..1
  ready: boolean;
  active: boolean;
  timeLeft: number;
}

export interface BossState {
  active: boolean;
  name: string;
  timeLeft: number;
  maxTime: number;
  hp: number;       // 0..1 — drains as you collect energy motes
  phase: number;
}

export interface Toast {
  id: number;
  kind: 'achievement' | 'info' | 'boss' | 'record';
  icon: string;
  title: string;
  subtitle?: string;
}

interface BossRuntime {
  group: THREE.Group;
  def: BossDef;
  timer: number;
  attackTimer: number;
  hp: number;
  phase: number;
  bob: number;
  parts: { head: THREE.Object3D; arms: THREE.Object3D[]; eyes: THREE.Mesh[]; core: THREE.Mesh };
}

interface BossDef {
  id: string;
  name: string;
  subtitle: string;
  color: number;
  accent: number;
  duration: number;
  attackInterval: number;
  reward: number;
}

export const POWERUP_COLORS: Record<string, number> = {
  magnet: 0xe74c3c, goldenRush: 0xffd97a, shield: 0x3498db,
  speed: 0x2ecc71, invincibility: 0x9b59b6, storm: 0xffb347,
};

const BOSSES: BossDef[] = [
  { id: 'forest', name: 'Gardien de la Forêt', subtitle: 'Protecteur des vignes anciennes', color: 0x2d6b3d, accent: 0x8fe08f, duration: 22, attackInterval: 1.5, reward: 2500 },
  { id: 'baobab', name: 'Colosse Baobab', subtitle: 'Géant de la vallée rouge', color: 0x8b4513, accent: 0xffb060, duration: 25, attackInterval: 1.3, reward: 3500 },
  { id: 'fossa', name: 'Fossa Dorée', subtitle: 'Gardienne de la vanille rare', color: 0xd4a050, accent: 0xffd97a, duration: 28, attackInterval: 1.05, reward: 5000 },
];

// ---------- Constants ----------
const LANE_X = [-2.2, 0, 2.2];
const BASE_SPEED = 20;
const MAX_SPEED = 58;
const SPAWN_DISTANCE = 88;
const GRAVITY = -80;
const JUMP_VELOCITY = 22;
const SLIDE_DURATION = 0.7;
const LANE_CHANGE_SPEED = 14;
// Lane pitch is 2.2 — anything inside this band that you did not hit was a genuine shave.
const NEAR_MISS_BAND = 2.55;

export interface Biome {
  name: string; sky: number; fog: number; ground: number; accent: number; water: number | null;
  skyTop: number; skyHaze: number; sun: number; sunY: number; sunX: number;
  far: number; near: number; path: number; pathEdge: number;
  motes: { color: number; size: number; rise: number; sway: number; mode: 'float' | 'rain' | 'firefly' | 'sand' };
}

const ENVIRONMENTS: Biome[] = [
  {
    name: 'Plantation de Vanille', sky: 0xffd4a3, fog: 0xecd0a6, ground: 0x6b8e3d, accent: 0x4a6b2a, water: null,
    skyTop: 0x7fb2d8, skyHaze: 0xffe6bd, sun: 0xfff2cc, sunY: 24, sunX: -42,
    far: 0xa9b98c, near: 0x7d9a63, path: 0xa8875a, pathEdge: 0x6b4020,
    motes: { color: 0xffe9a8, size: 0.14, rise: 0.7, sway: 1.1, mode: 'float' },
  },
  {
    name: 'Forê Tropicale', sky: 0x9fd8c8, fog: 0x9ed3bb, ground: 0x3d6b3d, accent: 0x2d502d, water: null,
    skyTop: 0x74bfe0, skyHaze: 0xcdeedd, sun: 0xf4ffd8, sunY: 34, sunX: 30,
    far: 0x4e7f63, near: 0x2f5c43, path: 0x6d5a3a, pathEdge: 0x3d2a18,
    motes: { color: 0xd9ffcf, size: 0.13, rise: 1.2, sway: 1.7, mode: 'float' },
  },
  {
    name: 'Vallé des Baobabs', sky: 0xff9c56, fog: 0xe08a55, ground: 0x9c4f22, accent: 0x5c2e0c, water: null,
    skyTop: 0x5a4a8f, skyHaze: 0xffb066, sun: 0xffd08a, sunY: 13, sunX: 52,
    far: 0x8a5a55, near: 0x6b3f35, path: 0xb9703c, pathEdge: 0x7a3a18,
    motes: { color: 0xffcf9a, size: 0.12, rise: 0.4, sway: 2.4, mode: 'sand' },
  },
  {
    name: 'R\\233gion Montagneuse', sky: 0xbcccd8, fog: 0xa9bcc9, ground: 0x6b5d4f, accent: 0x4a3f35, water: null,
    skyTop: 0x6f8fae, skyHaze: 0xdbe7ee, sun: 0xf0f6ff, sunY: 40, sunX: -20,
    far: 0x7288a0, near: 0x50627a, path: 0x7d7161, pathEdge: 0x4a4038,
    motes: { color: 0xe4f1ff, size: 0.09, rise: -17, sway: 0.3, mode: 'rain' },
  },
  {
    name: 'C\\244ote de Madagascar', sky: 0x8fd8e8, fog: 0xa8e3ec, ground: 0xf0e0b8, accent: 0x228b8b, water: 0x3fbcd4,
    skyTop: 0x5cb8e0, skyHaze: 0xdff6fb, sun: 0xffffe0, sunY: 38, sunX: -56,
    far: 0x8fb9a8, near: 0x6f9d8c, path: 0xf5e7c4, pathEdge: 0xd9bf8a,
    motes: { color: 0xffffff, size: 0.11, rise: 1.9, sway: 2.8, mode: 'sand' },
  },
  {
    name: 'Île Mystère', sky: 0x8f5bb8, fog: 0x5e2f7d, ground: 0x33203f, accent: 0x1a0f24, water: 0x4ec5d9,
    skyTop: 0x1b0c2e, skyHaze: 0x8f5bc0, sun: 0xd9b8ff, sunY: 28, sunX: 18,
    far: 0x4a2c66, near: 0x2f1a45, path: 0x4a3560, pathEdge: 0x7a5aa0,
    motes: { color: 0xb6ff8f, size: 0.2, rise: 0.5, sway: 1.0, mode: 'firefly' },
  },
];

// ---------- Game Class ----------
export class Game {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private _prevTime = 0;
  container: HTMLElement;

  // Player
  player!: THREE.Group;
  playerLane = 1;
  targetX = 0;
  playerY = 0;
  playerVY = 0;
  isJumping = false;
  isSliding = false;
  slideTimer = 0;
  isInvincibleHit = false;
  hitTimer = 0;
  playerMixer: any = null;
  playerParts: { body: THREE.Mesh; head: THREE.Mesh; basket: THREE.Mesh; leftArm: THREE.Mesh; rightArm: THREE.Mesh; leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; hat: THREE.Mesh; } = {} as any;
  runTime = 0;

  // World
  groundSegments: THREE.Mesh[] = [];
  sideScenery: THREE.Object3D[] = [];
  collectibles: THREE.Object3D[] = [];
  obstacles: THREE.Object3D[] = [];
  enemies: THREE.Object3D[] = [];
  particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number }[] = [];

  // Stats
  stats: GameStats = {
    score: 0, vanilla: 0, goldenVanilla: 0, distance: 0, combo: 0, maxCombo: 0,
    multiplier: 1, speed: BASE_SPEED, bestScore: 0, coins: 0,
  };
  powerUp: PowerUpState = { type: null, timeLeft: 0 };
  currentEnv = 0;
  envTimer = 0;
  gameState: GameState = 'menu';
  screenShake = 0;
  flashColor: number | null = null;
  flashAmount = 0;

  // Special ability (Élan de Vanille)
  dash: DashState = { charge: 0, ready: false, active: false, timeLeft: 0 };
  dashDuration = 4.5;

  // Boss
  boss: BossRuntime | null = null;
  bossState: BossState = { active: false, name: '', timeLeft: 0, maxTime: 0, hp: 1, phase: 0 };
  bossesBeaten = 0;
  nextBossAt = 700;
  bossProjectiles: THREE.Object3D[] = [];

  trailTimer = 0;
  stormTimer = 0;

  // Atmosphere
  private sky: THREE.Mesh | null = null;
  private sunDisc: THREE.Mesh | null = null;
  private sunHalo: THREE.Mesh | null = null;
  private clouds = new THREE.Group();
  private farGroups: { group: THREE.Group; factor: number }[] = [];
  private ambient: THREE.Points | null = null;
  private ambientVel: Float32Array | null = null;
  private pathMats: { strip: THREE.MeshStandardMaterial; edge: THREE.MeshStandardMaterial } | null = null;
  private dashMarks: THREE.Mesh[] = [];
  private animatedProps: THREE.Mesh[] = [];
  private showroom = new THREE.Group();
  showroomActive = false;
  private showroomAngle = 0;

  // Feel
  hitStop = 0;
  deathTimer = 0;
  invulnAfterRevive = 0;
  nearMisses = 0;
  everHit = false;
  maxSpeedSeen = 0;
  revives = 0;
  comboTiers: [number, number, number] = [10, 25, 50];
  pendingAttack: { lanes: number[]; high: boolean; t: number } | null = null;
  telegraphs: THREE.Mesh[] = [];

  // Run tracking
  shieldCharges = 0;
  tookHit = false;
  maxEnvReached = 0;

  // Input
  swipeStart = { x: 0, y: 0, time: 0 };
  keys: Record<string, boolean> = {};
  touchId: number | null = null;
  hasTapped = false;
  lastTapTime = 0;

  // Persistence
  save: SaveData = loadSave();

  // Callbacks
  onStatsUpdate: (s: GameStats) => void = () => {};
  onStateChange: (s: GameState) => void = () => {};
  onPowerUpUpdate: (p: PowerUpState) => void = () => {};
  onEnvironmentChange: (name: string) => void = () => {};
  onDashUpdate: (d: DashState) => void = () => {};
  onBossUpdate: (b: BossState) => void = () => {};
  onToast: (t: Toast) => void = () => {};
  onPopup: (text: string, color: string, screen: { x: number; y: number }, big: boolean) => void = () => {};
  onFlash: (color: number, amount: number) => void = () => {};
  onSaveUpdate: (s: SaveData) => void = () => {};
  onRunComplete: (r: RunSummary & {
    coinsEarned: number; isRecord: boolean; xpGain: number; levelUp: boolean; newLevel: number; challengeDone: boolean;
  }) => void = () => {};

  sound = audio;
  rafId: number | null = null;
  lastTime = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 300);
    this.camera.position.set(0, 5.5, -9);
    this.camera.lookAt(0, 2, 10);

    this._prevTime = performance.now();

    this.syncFromSave();
    this.setupScene();
    this.setupPlayer();
    this.setupLighting(0);
    this.setupInitialChunks();
    this.bindInputs();
    this.applyOutfit(this.save.outfit);
    this.applyAccessibility();
    if (this.save.settings.quality === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    }

    window.addEventListener('resize', this.handleResize);
  }

  syncFromSave() {
    this.stats.bestScore = this.save.bestScore;
    this.stats.coins = this.save.coins;
    this.sound.sfxOn = this.save.settings.sfx;
    this.sound.musicOn = this.save.settings.music;
    this.refreshDaily();
  }

  setQuality(q: 'low' | 'high') {
    this.save.settings.quality = q;
    if (q === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
    }
    this.scene.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.persist();
  }

  setOutfit(id: string) {
    this.save.outfit = id;
    this.applyOutfit(id);
    this.persist();
  }

  buyOutfit(id: string, price: number): boolean {
    if (this.save.outfits.includes(id)) { this.setOutfit(id); return true; }
    if (this.save.coins < price) return false;
    this.save.coins -= price;
    this.save.outfits.push(id);
    this.save.outfit = id;
    this.stats.coins = this.save.coins;
    this.applyOutfit(id);
    this.sound.purchase();
    this.persist();
    this.onStatsUpdate({ ...this.stats });
    return true;
  }

  buyUpgrade(id: keyof SaveData['upgrades'], price: number): boolean {
    if (this.save.coins < price) return false;
    this.save.coins -= price;
    this.save.upgrades[id] += 1;
    this.stats.coins = this.save.coins;
    this.sound.purchase();
    this.persist();
    this.onStatsUpdate({ ...this.stats });
    return true;
  }

  setSetting<K extends keyof SaveData['settings']>(key: K, value: SaveData['settings'][K]) {
    this.save.settings[key] = value;
    if (key === 'sfx') this.sound.setSfx(value as boolean);
    if (key === 'music') this.sound.setMusic(value as boolean);
    if (key === 'quality') { this.setQuality(value as 'low' | 'high'); return; }
    this.applyAccessibility();
    this.persist();
  }

  applyAccessibility() {
    const high = this.save.settings.highContrast;
    // Make runway guides and collectibles easier to separate from the ground.
    this.dashMarks.forEach(m => {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = high ? 0.82 : 0.42;
      mat.color.setHex(high ? 0xffffff : 0xfff4d6);
    });
    if (this.ambient) {
      (this.ambient.material as THREE.PointsMaterial).opacity =
        this.save.settings.reducedMotion ? 0.28 : 0.7;
    }
    if (this.save.settings.reducedMotion) this.screenShake = 0;
  }

  resetProgress() {
    const settings = { ...this.save.settings };
    const fresh = loadSave();
    this.save = {
      ...fresh,
      bestScore: 0, scores: [], coins: 0, xp: 0, totalVanilla: 0, totalGolden: 0, totalDistance: 0,
      totalRuns: 0, bestCombo: 0, totalBosses: 0, perfectRuns: 0, bestDistance: 0, reviveCount: 0,
      achievements: [], upgrades: { magnet: 0, shield: 0, dash: 0, coinBonus: 0, headStart: 0 },
      settings, outfit: 'classic', outfits: ['classic'], seenIntro: true, envReached: 0,
      dailyDate: todayKey(), dailyVanilla: 0, dailyRuns: 0, weeklyDistance: 0, weekGolden: 0,
      rivals: [], playerName: this.save?.playerName || '',
      streak: 0, lastDaily: '', claimedMissions: [], weekKey: weekKeyOf(),
    };
    this.syncFromSave();
    this.applyOutfit('classic');
    this.persist();
    this.onStatsUpdate({ ...this.stats });
  }

  setupScene() {
    this.scene.fog = new THREE.Fog(ENVIRONMENTS[0].fog, 30, 90);
    this.scene.background = new THREE.Color(ENVIRONMENTS[0].sky);
    this.setupAtmosphere();
    this.setupPath();
  }

  /** Gradient sky dome + low sun + drifting clouds + parallax ridges + ambient motes. */
  private setupAtmosphere() {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        cTop: { value: new THREE.Color(0x7fb2d8) },
        cBot: { value: new THREE.Color(0xffd4a3) },
        cHaze: { value: new THREE.Color(0xffe6bd) },
      },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 cTop; uniform vec3 cBot; uniform vec3 cHaze;
        void main() {
          float h = clamp(normalize(vPos).y, -1.0, 1.0);
          vec3 col = mix(cBot, cTop, pow(clamp(h, 0.0, 1.0), 0.62));
          col = mix(col, cHaze, pow(1.0 - abs(h), 7.0) * 0.8);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 20, 14), skyMat);
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;

    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(8.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, fog: false, transparent: true, opacity: 0.95, depthWrite: false })
    );
    this.sunHalo = new THREE.Mesh(
      new THREE.CircleGeometry(22, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc256, fog: false, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.scene.add(this.sunHalo);
    this.scene.add(this.sunDisc);

    // Cloud puffs
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const cl = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < puffs; j++) {
        const r = 3.4 + Math.random() * 3.6;
        const p = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), cloudMat);
        p.position.set((j - puffs / 2) * r * 1.05, Math.random() * r * 0.3, Math.random() * r * 0.5);
        p.scale.y = 0.48;
        cl.add(p);
      }
      cl.position.set(-140 + Math.random() * 280, 28 + Math.random() * 28, 90 + Math.random() * 80);
      cl.userData.drift = 0.5 + Math.random() * 1.4;
      this.clouds.add(cl);
    }
    this.scene.add(this.clouds);
    (this.clouds as any).cloudMat = cloudMat;

    // Two parallax silhouette ridges (stylised low-poly skyline)
    [{ dist: 128, h: 40, n: 11, f: 0.05, op: 0.55 }, { dist: 86, h: 26, n: 13, f: 0.12, op: 0.72 }].forEach(cfg => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x4e7f63, fog: false, transparent: true, opacity: cfg.op, depthWrite: false });
      const group = new THREE.Group();
      for (let i = 0; i < cfg.n; i++) {
        for (const side of [-1, 1]) {
          const size = 12 + Math.random() * 12;
          const m = new THREE.Mesh(new THREE.ConeGeometry(size, cfg.h * (0.5 + Math.random() * 0.9), 4), mat);
          m.position.set(side * (26 + Math.random() * 58), cfg.h * 0.18, i * (260 / cfg.n) - 110);
          m.rotation.y = Math.random();
          group.add(m);
        }
      }
      this.scene.add(group);
      this.farGroups.push({ group, factor: cfg.f });
      (group as any).mat = mat;
    });

    // Ambient motes (pollen / rain / sand / fireflies)
    const COUNT = 240;
    const pos = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 46;
      pos[i * 3 + 1] = Math.random() * 13 + 0.2;
      pos[i * 3 + 2] = -14 + Math.random() * 86;
      vel[i * 3] = (Math.random() - 0.5) * 0.8;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pmat = new THREE.PointsMaterial({
      size: 0.14, color: 0xffe9a8, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, pmat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.ambient = pts;
    this.ambientVel = vel;
    this.applyAtmosphere(0);
  }

  /** Piste / runway: reads as a trodden vanilla trail and sells the speed. */
  private setupPath() {
    const stripMat = new THREE.MeshStandardMaterial({ color: 0xa8875a, roughness: 1 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x6b4020, roughness: 0.95 });
    this.pathMats = { strip: stripMat, edge: edgeMat };

    const strip = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 250), stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.02, 95);
    strip.receiveShadow = true;
    this.scene.add(strip);

    for (const dx of [-3.85, 3.85]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 250), edgeMat);
      e.position.set(dx, 0.09, 95);
      e.castShadow = true;
      this.scene.add(e);
    }
    // Lane dividers, kept very faint so lanes stay readable
    for (const dx of [-1.1, 1.1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 250),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 }));
      d.rotation.x = -Math.PI / 2;
      d.position.set(dx, 0.03, 95);
      this.scene.add(d);
    }
    // Scrolling dash marks — the cheapest, strongest speed cue there is
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.42 });
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2.1), dashMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(i % 2 ? 3.85 : -3.85, 0.05, i * 12 - 12);
      this.scene.add(m);
      this.dashMarks.push(m);
    }
  }

  applyAtmosphere(idx: number) {
    const b = ENVIRONMENTS[idx];
    if (!b) return;
    if (this.sky) {
      const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
      u.cBot.value.setHex(b.sky);
      u.cTop.value.setHex(b.skyTop);
      u.cHaze.value.setHex(b.skyHaze);
    }
    if (this.sunDisc) {
      const sd = this.sunDisc.material as THREE.MeshBasicMaterial;
      const hd = (this.sunHalo?.material as THREE.MeshBasicMaterial) || null;
      sd.color.setHex(b.sun);
      this.sunDisc.position.set(b.sunX, b.sunY, 150);
      if (hd) { hd.color.setHex(b.sky); }
      this.sunHalo?.position.set(b.sunX, b.sunY, 148);
      // No visible sun under the mist or on the mystery island — mood over literalism
      const hiddenSun = b.motes.mode === 'firefly';
      this.sunDisc.visible = !hiddenSun;
      if (this.sunHalo) this.sunHalo.visible = !hiddenSun;
      sd.opacity = b.motes.mode === 'rain' ? 0.45 : 0.95;
    }
    const cm = (this.clouds as any).cloudMat as THREE.MeshBasicMaterial;
    if (cm) {
      cm.color.setHex(idx === 5 ? 0xc9a8e8 : idx === 3 ? 0xdfe9f2 : 0xffffff);
      cm.opacity = idx === 3 ? 0.7 : 0.5;
    }
    this.farGroups.forEach((l, i) => {
      const mat = (l.group as any).mat as THREE.MeshBasicMaterial;
      mat.color.setHex(i === 0 ? b.far : b.near);
    });
    if (this.ambient) {
      const pm = this.ambient.material as THREE.PointsMaterial;
      pm.color.setHex(b.motes.color);
      pm.size = b.motes.size;
      pm.opacity = b.motes.mode === 'firefly' ? 1 : 0.7;
    }
    if (this.pathMats) {
      this.pathMats.strip.color.setHex(b.path);
      this.pathMats.edge.color.setHex(b.pathEdge);
    }
  }

  updateAtmosphere(dt: number, speed: number) {
    const ambientDt = this.save.settings.reducedMotion ? dt * 0.16 : dt;
    // Sky rides with the camera so the gradient never slides sideways
    if (this.sky) this.sky.position.set(this.camera.position.x, 0, 60);
    if (this.sunDisc) {
      this.sunDisc.position.x = ENVIRONMENTS[this.currentEnv].sunX + this.camera.position.x * 0.4;
      if (this.sunHalo) this.sunHalo.position.x = this.sunDisc.position.x;
    }

    // Clouds drift
    this.clouds.children.forEach(c => {
      c.position.x += (c.userData.drift || 1) * ambientDt * 1.4;
      if (c.position.x > 150) c.position.x = -150;
      if (c.position.x < -150) c.position.x = 150;
    });

    // Parallax ridges scroll slowly and wrap
    this.farGroups.forEach(({ group, factor }) => {
      group.children.forEach(m => {
        m.position.z -= speed * factor * dt;
        if (m.position.z < -120) m.position.z += 260;
        if (m.position.z > 145) m.position.z -= 260;
      });
    });

    // Ambient motes
    if (this.ambient && this.ambientVel) {
      const b = ENVIRONMENTS[this.currentEnv];
      const arr = this.ambient.geometry.getAttribute('position') as THREE.BufferAttribute;
      const mode = b.motes.mode;
      const t = performance.now() * 0.001;
      for (let i = 0; i < arr.count; i++) {
        let x = arr.getX(i), y = arr.getY(i), z = arr.getZ(i);
        z -= speed * (mode === 'rain' ? 0.32 : 0.55) * dt;
        if (mode === 'rain') y -= 17 * ambientDt;
        else if (mode === 'sand') y += b.motes.rise * ambientDt * 0.6;
        else y += b.motes.rise * ambientDt * (0.45 + (i % 5) * 0.12);
        x += Math.sin(t * 1.4 + i) * b.motes.sway * ambientDt;
        if (mode === 'firefly') {
          y += Math.sin(t * 2.2 + i * 0.7) * 0.5 * ambientDt;
        }
        if (z < -14) z += 88;
        if (z > 78) z -= 88;
        if (y > 14) y = 0.2;
        if (y < 0.1) y = mode === 'rain' ? 14 : 0.2;
        if (x > 24) x = -24;
        if (x < -24) x = 24;
        arr.setXYZ(i, x, y, z);
      }
      arr.needsUpdate = true;
    }

    // Dash marks
    for (const m of this.dashMarks) {
      m.position.z -= speed * dt;
      if (m.position.z < -14) m.position.z += 240;
    }

    // Flowing water sheets (waterfalls): a vertical roll reads as continuous flow
    const flowT = performance.now() * 0.0022;
    for (const w of this.animatedProps) {
      w.position.y = (w.userData.baseY ??= w.position.y) - ((flowT * 1.4) % 0.9);
      (w.material as THREE.MeshStandardMaterial).opacity = 0.72 + Math.sin(flowT * 4 + w.id) * 0.1;
    }
  }

  setupLighting(envIdx: number) {
    // Clear existing lights
    this.scene.children.filter(c => c instanceof THREE.Light).forEach(l => this.scene.remove(l));
    const env = ENVIRONMENTS[envIdx];
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.1);
    sun.position.set(10, 20, -15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    this.scene.add(sun);
    // Warm fill
    const fill = new THREE.HemisphereLight(env.sky, env.ground, 0.4);
    this.scene.add(fill);
  }

  createMaterial(color: number, roughness = 0.7) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1 });
  }

  setupPlayer() {
    this.player = new THREE.Group();

    const skinMat = this.createMaterial(0xf4c38a, 0.8);
    const shirtMat = this.createMaterial(0xe8a050, 0.6);
    const pantsMat = this.createMaterial(0x6b4d2b, 0.8);
    const basketMat = this.createMaterial(0x8b5a2b, 0.9);
    const hatMat = this.createMaterial(0xd4a050, 0.7);

    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.45, 0.7, 4, 8);
    const body = new THREE.Mesh(bodyGeo, shirtMat);
    body.position.y = 1.1;
    body.castShadow = true;
    this.player.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.38, 12, 10);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.95;
    head.castShadow = true;
    this.player.add(head);

    // Hat (vanilla farmer hat)
    const hatBrimGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16);
    const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
    hatBrim.position.y = 2.25;
    hatBrim.castShadow = true;
    this.player.add(hatBrim);
    const hatTopGeo = new THREE.ConeGeometry(0.32, 0.25, 12);
    const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
    hatTop.position.y = 2.4;
    hatTop.castShadow = true;
    this.player.add(hatTop);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2d1810, roughness: 0.2 });
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, 2.0, 0.32);
    this.player.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, 2.0, 0.32);
    this.player.add(rightEye);
    // Smile
    const smileGeo = new THREE.TorusGeometry(0.08, 0.02, 4, 8, Math.PI);
    const smile = new THREE.Mesh(smileGeo, new THREE.MeshStandardMaterial({ color: 0x5c2e0c }));
    smile.position.set(0, 1.85, 0.35);
    smile.rotation.x = Math.PI;
    this.player.add(smile);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.13, 0.55, 4, 6);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.55, 1.2, 0);
    leftArm.castShadow = true;
    this.player.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.55, 1.2, 0);
    rightArm.castShadow = true;
    this.player.add(rightArm);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.16, 0.5, 4, 6);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.22, 0.4, 0);
    leftLeg.castShadow = true;
    this.player.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.22, 0.4, 0);
    rightLeg.castShadow = true;
    this.player.add(rightLeg);

    // Basket on back
    const basketGeo = new THREE.CylinderGeometry(0.28, 0.22, 0.4, 8);
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.set(-0.35, 1.3, -0.25);
    basket.rotation.z = 0.2;
    basket.castShadow = true;
    this.player.add(basket);
    // Basket top opening
    const basketRimGeo = new THREE.TorusGeometry(0.25, 0.03, 4, 8);
    const basketRim = new THREE.Mesh(basketRimGeo, this.createMaterial(0x6b4020));
    basketRim.position.set(-0.35, 1.5, -0.25);
    basketRim.rotation.x = Math.PI / 2;
    this.player.add(basketRim);

    // Shield effect (hidden by default)
    const shieldGeo = new THREE.SphereGeometry(1.1, 16, 12);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x3498db, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.position.y = 1.1;
    this.player.add(shieldMesh);
    (this.player as any).shieldMesh = shieldMesh;

    // Magnet ring
    const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe74c3c, transparent: true, opacity: 0.0,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.1;
    this.player.add(ringMesh);
    (this.player as any).ringMesh = ringMesh;

    // Invincibility aura
    const auraGeo = new THREE.SphereGeometry(1.0, 12, 10);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffd97a, transparent: true, opacity: 0.0,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.position.y = 1.1;
    this.player.add(auraMesh);
    (this.player as any).auraMesh = auraMesh;

    this.playerParts = { body, head, basket, leftArm, rightArm, leftLeg, rightLeg, hat: hatTop };
    this.player.position.set(0, 0, 0);
    this.scene.add(this.player);
    this.setupShowroom();
  }

  /** Premium outfit pedestal rendered in the same live Three.js scene. */
  private setupShowroom() {
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3a2011, roughness: 0.45, metalness: 0.28,
      emissive: 0x5c2e0c, emissiveIntensity: 0.18,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffc256, roughness: 0.22, metalness: 0.72,
      emissive: 0xff9500, emissiveIntensity: 0.22,
    });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.65, 0.42, 28), baseMat);
    plinth.position.y = 0.21;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.showroom.add(plinth);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.43, 0.08, 8, 32), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.43;
    this.showroom.add(rim);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1.16, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd97a, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.445;
    this.showroom.add(innerRing);

    // Three vanilla-flower lights around the base make the silhouette read clearly.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const flower = new THREE.Group();
      const petalMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.78 });
      for (let j = 0; j < 5; j++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), petalMat);
        const pa = (j / 5) * Math.PI * 2;
        p.position.set(Math.cos(pa) * 0.1, 0, Math.sin(pa) * 0.1);
        p.scale.set(1.6, 0.35, 0.8);
        flower.add(p);
      }
      flower.position.set(Math.cos(a) * 1.22, 0.5, Math.sin(a) * 1.22);
      this.showroom.add(flower);
    }

    this.showroom.position.set(0, 0, 0.15);
    this.showroom.visible = false;
    this.scene.add(this.showroom);
  }

  showCharacterPreview(show: boolean) {
    this.showroomActive = show && this.gameState === 'menu';
    this.showroom.visible = this.showroomActive;
    this.showroomAngle = 0;
    if (this.showroomActive) {
      this.player.position.set(0, 0.44, 0.15);
      this.player.rotation.set(0, 0, 0);
      this.player.scale.setScalar(1.12);
    } else if (this.gameState === 'menu') {
      this.player.position.set(0, 0, 0);
      this.player.rotation.set(0, 0, 0);
      this.player.scale.setScalar(1);
    }
  }

  rotateCharacterPreview(direction: number) {
    if (!this.showroomActive) return;
    this.showroomAngle += direction * Math.PI / 3;
    this.sound.uiClick();
  }

  createGroundSegment(z: number) {
    const env = ENVIRONMENTS[this.currentEnv];
    const geo = new THREE.PlaneGeometry(30, 20);
    const mat = new THREE.MeshStandardMaterial({ color: env.ground, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.groundSegments.push(mesh);
    return mesh;
  }

  createScenery(z: number) {
    const env = ENVIRONMENTS[this.currentEnv];
    const group = new THREE.Group();
    // Random side decor on both sides
    for (let side of [-1, 1]) {
      const numItems = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < numItems; i++) {
        const obj = this.createEnvProp(env);
        obj.position.set(side * (8 + Math.random() * 8), 0, z - 8 + Math.random() * 16);
        obj.rotation.y = Math.random() * Math.PI * 2;
        obj.scale.setScalar(0.8 + Math.random() * 0.6);
        group.add(obj);
      }
    }
    // Add center decor further out that doesn't block lanes
    if (Math.random() < 0.3) {
      const deco = this.createEnvProp(env);
      const xSide = Math.random() < 0.5 ? -12 : 12;
      deco.position.set(xSide, 0, z - 5 + Math.random() * 10);
      group.add(deco);
    }
    this.scene.add(group);
    this.sideScenery.push(group);
    return group;
  }

  createEnvProp(env: typeof ENVIRONMENTS[0]): THREE.Object3D {
    const g = new THREE.Group();
    const r = Math.random();
    if (this.currentEnv === 0) {
      // Vanilla plantation - vanilla trellises, small plants
      if (r < 0.4) {
        // Vanilla vine post
        const postMat = this.createMaterial(0x6b4020);
        const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6);
        for (let dx of [-0.4, 0.4]) {
          const p = new THREE.Mesh(postGeo, postMat);
          p.position.set(dx, 1.1, 0);
          p.castShadow = true;
          g.add(p);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.06), postMat);
        beam.position.y = 2.2;
        g.add(beam);
        // vine leaves
        const leafMat = this.createMaterial(0x3d6b2d);
        for (let i = 0; i < 3; i++) {
          const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), leafMat);
          leaf.position.set(-0.3 + i * 0.3, 1.3 + Math.random() * 0.5, 0);
          leaf.rotation.y = Math.random() * Math.PI;
          g.add(leaf);
        }
      } else {
        this.addTree(g, 0.9, env.accent);
      }
    } else if (this.currentEnv === 1) {
      // Tropical forest — dense canopy, ferns and a waterfall on the slopes
      if (r < 0.55) this.addTree(g, 1.8, env.accent);
      else if (r < 0.78) this.addBush(g, env.accent);
      else if (r < 0.9) this.addFernCluster(g);
      else this.addWaterfall(g);
    } else if (this.currentEnv === 2) {
      // Baobab valley — baobabs, red rocks and village huts
      if (r < 0.5) this.addBaobab(g);
      else if (r < 0.75) this.addRock(g);
      else this.addVillageHut(g);
    } else if (this.currentEnv === 3) {
      // Mountain — rocks, pines and rope-bridge towers
      if (r < 0.4) this.addRock(g);
      else if (r < 0.72) this.addTree(g, 1.2, 0x2d3f2d);
      else if (r < 0.88) this.addPineCluster(g);
      else this.addRopeTower(g);
    } else if (this.currentEnv === 4) {
      // Coast — palms, sand, turquoise water and moored pirogues
      if (r < 0.45) this.addPalm(g);
      else if (r < 0.65) this.addRock(g);
      else if (r < 0.8) this.addBeachShells(g);
      else if (r < 0.92) this.addPirogue(g);
      else this.addVillageHut(g);
    } else {
      // Mystery - glowing trees, crystals
      if (r < 0.5) {
        this.addTree(g, 1.5, 0x6c3483);
        // Glow orb
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffd97a })
        );
        glow.position.y = 2;
        g.add(glow);
      } else {
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x9b59b6, emissive: 0x6c3483, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3,
        });
        const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 5), crystalMat);
        crystal.position.y = 0.6;
        crystal.castShadow = true;
        g.add(crystal);
      }
    }
    return g;
  }

  /** Lush tropical ferns — fanning fronds along the forest floor. */
  addFernCluster(g: THREE.Group) {
    const frondMat = this.createMaterial(0x2f7a3c, 0.9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.5), frondMat);
      frond.position.set(Math.cos(a) * 0.22, 0.7, Math.sin(a) * 0.22);
      frond.rotation.y = a;
      frond.rotation.x = -0.45;
      frond.castShadow = true;
      g.add(frond);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 6), this.createMaterial(0x1e5026, 0.9));
    center.position.y = 0.15;
    g.add(center);
    return g;
  }

  /** Waterfall on the rainforest slope — animated foam sheet (see updateAtmosphere). */
  addWaterfall(g: THREE.Group) {
    const rockMat = this.createMaterial(0x4a4440, 0.95);
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5, 2.4), rockMat);
    cliff.position.set(0, 2.5, 1.2);
    cliff.castShadow = true;
    g.add(cliff);
    // Ledge
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 1), rockMat);
    ledge.position.set(0, 4.6, 0.2);
    g.add(ledge);
    // Water sheet (translucent, animated with a gentle vertical flow)
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x9fe4f2, emissive: 0x4ec5d9, emissiveIntensity: 0.32,
      roughness: 0.15, transparent: true, opacity: 0.82, side: THREE.DoubleSide,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5.4, 1, 6), waterMat);
    sheet.position.set(0, 2.7, -0.05);
    sheet.userData.flow = true;
    g.add(sheet);
    // Foam pool
    const foam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.3, 14),
      new THREE.MeshStandardMaterial({ color: 0xdff7ff, roughness: 0.4, transparent: true, opacity: 0.85 })
    );
    foam.position.set(0, 0.15, -0.1);
    g.add(foam);
    g.userData.animated = sheet;
    (g.userData.flow = true);
    this.animatedProps.push(sheet);
    return g;
  }

  /**
   * Malagasy village hut (trano gasy inspired): plastered cylindrical walls,
   * steep thatched cone roof, raised wooden door. A quiet cultural nod — the
   * brief asks for village architecture without caricature.
   */
  addVillageHut(g: THREE.Group) {
    const wallMat = this.createMaterial(0xe4d3ac, 0.95);
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.9, 14), wallMat);
    walls.position.y = 0.95;
    walls.castShadow = true;
    g.add(walls);
    // Thatched roof — tall cone with a small apex
    const thatchMat = this.createMaterial(0x8a6234, 0.98);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.9, 14), thatchMat);
    roof.position.y = 2.75;
    roof.castShadow = true;
    g.add(roof);
    const apex = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 7), this.createMaterial(0x5c3d1e));
    apex.position.y = 3.9;
    g.add(apex);
    // Door with decorative lintel
    const doorMat = this.createMaterial(0x5c3218, 0.9);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.12), doorMat);
    door.position.set(0, 0.58, 1.58);
    g.add(door);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.16), this.createMaterial(0xb3853f, 0.8));
    lintel.position.set(0, 1.22, 1.58);
    g.add(lintel);
    // Small stacked firewood beside the hut
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6),
        this.createMaterial(0x6b4020, 0.95)
      );
      log.rotation.z = Math.PI / 2;
      log.position.set(1.7, 0.1 + i * 0.18, 0.4);
      g.add(log);
    }
    return g;
  }

  addPineCluster(g: THREE.Group) {
    for (let i = 0; i < 3; i++) {
      const s = 0.7 + Math.random() * 0.5;
      const tree = new THREE.Group();
      this.addTree(tree, s, 0x2d3f2d);
      tree.position.set((i - 1) * 1.4 + Math.random() * 0.4, 0, Math.random() * 0.6);
      g.add(tree);
    }
    return g;
  }

  /** Mountain rope-bridge tower on stilts — foreshadows the cliff crossings. */
  addRopeTower(g: THREE.Group) {
    const woodMat = this.createMaterial(0x7a5230, 0.95);
    for (const dx of [-0.9, 0.9]) {
      for (const dz of [-0.6, 0.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.4, 7), woodMat);
        post.position.set(dx, 1.7, dz);
        post.castShadow = true;
        g.add(post);
      }
    }
    // Platform
    const platform = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 1.7), this.createMaterial(0x9a7040, 0.95));
    platform.position.y = 3.4;
    platform.castShadow = true;
    g.add(platform);
    // Railings
    for (const dz of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), woodMat);
      rail.position.set(0, 4.1, dz);
      g.add(rail);
      for (const dx of [-1.05, -0.35, 0.35, 1.05]) {
        const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 5), woodMat);
        bal.position.set(dx, 3.77, dz);
        g.add(bal);
      }
    }
    // Draped rope
    const rope = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.035, 5, 18, Math.PI), this.createMaterial(0xc9a86a, 0.98));
    rope.position.set(0, 3.05, 0.85);
    rope.rotation.set(0, 0, Math.PI);
    g.add(rope);
    return g;
  }

  /** Beach shells and a starfish, drawn straight from the sand. */
  addBeachShells(g: THREE.Group) {
    const shellMat = this.createMaterial(0xfff6e6, 0.7);
    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        i === 0 ? this.createMaterial(0xffd8b0, 0.7) : shellMat
      );
      shell.position.set((Math.random() - 0.5) * 2.2, 0.02, (Math.random() - 0.5) * 1.4);
      shell.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
      g.add(shell);
    }
    // Starfish
    const starMat = this.createMaterial(0xff9550, 0.85);
    const star = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 4), starMat);
      const a = (i / 5) * Math.PI * 2;
      arm.position.set(Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.z = -a + Math.PI / 2;
      star.add(arm);
    }
    star.position.set(0.7, 0.04, 0.5);
    g.add(star);
    return g;
  }

  /** Moored pirogue — Malagasy outrigger canoe with a bamboo mast. */
  addPirogue(g: THREE.Group) {
    const hullMat = this.createMaterial(0xc4762c, 0.85);
    // Curved hull
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 2.4, 5, 9), hullMat);
    hull.rotation.z = Math.PI / 2;
    hull.position.y = 0.34;
    hull.scale.set(1, 0.62, 1);
    hull.castShadow = true;
    g.add(hull);
    // Raised pointed prow + stern
    for (const side of [-1, 1]) {
      const prow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 7), hullMat);
      prow.position.set(side * 1.72, 0.62, 0);
      prow.rotation.z = -side * Math.PI / 2.6;
      g.add(prow);
    }
    // Outrigger float + two bamboo struts
    const floatMat = this.createMaterial(0x8a6234, 0.95);
    const outrigger = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 2.1, 4, 7), floatMat);
    outrigger.rotation.z = Math.PI / 2;
    outrigger.position.set(0, 0.2, 1.15);
    outrigger.castShadow = true;
    g.add(outrigger);
    for (const x of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.35, 5), floatMat);
      strut.position.set(x, 0.5, 0.58);
      strut.rotation.x = Math.PI / 2.6;
      g.add(strut);
    }
    // Bamboo mast with a folded cream sail
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 6), floatMat);
    mast.position.set(0.2, 1.7, 0);
    mast.castShadow = true;
    g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xfff4d6, roughness: 0.9, side: THREE.DoubleSide }));
    sail.position.set(0.78, 1.85, 0);
    sail.rotation.y = 0.35;
    g.add(sail);
    return g;
  }

  addTree(g: THREE.Group, scale: number, leafColor: number) {
    const trunkMat = this.createMaterial(0x6b4020);
    const trunkGeo = new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 1.5 * scale, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = (1.5 * scale) / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const leafMat = this.createMaterial(leafColor, 0.8);
    // Layered cone leaves
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry((0.9 - i * 0.2) * scale, 0.8 * scale, 8),
        leafMat
      );
      leaf.position.y = 1.2 * scale + i * 0.4 * scale;
      leaf.castShadow = true;
      g.add(leaf);
    }
    return g;
  }
  addPalm(g: THREE.Group) {
    const trunkMat = this.createMaterial(0x8b5a2b);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.5, 8), trunkMat);
    trunk.position.y = 1.75;
    trunk.castShadow = true;
    g.add(trunk);
    const leafMat = this.createMaterial(0x4a6b2a);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.35), leafMat);
      leaf.position.y = 3.5;
      leaf.rotation.y = (i / 7) * Math.PI * 2;
      leaf.rotation.z = -0.3;
      leaf.position.x = Math.cos((i / 7) * Math.PI * 2) * 0.6;
      leaf.position.z = Math.sin((i / 7) * Math.PI * 2) * 0.6;
      leaf.castShadow = true;
      g.add(leaf);
    }
    return g;
  }
  addBaobab(g: THREE.Group) {
    const trunkMat = this.createMaterial(0x8b5a2b);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 4, 8), trunkMat);
    trunk.position.y = 2;
    trunk.castShadow = true;
    g.add(trunk);
    // Thick top
    const topMat = this.createMaterial(0x5c2e0c);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), topMat);
    top.position.y = 4.5;
    top.scale.y = 0.7;
    top.castShadow = true;
    g.add(top);
    // Branches
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 1.2, 5), trunkMat);
      branch.position.set(Math.cos(angle) * 0.8, 4.2, Math.sin(angle) * 0.8);
      branch.rotation.z = Math.PI / 4;
      branch.rotation.y = angle;
      g.add(branch);
    }
    return g;
  }
  addRock(g: THREE.Group) {
    const rockMat = this.createMaterial(this.currentEnv === 4 ? 0xe8d4a8 : 0x6b5d4f, 0.9);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.4, 0), rockMat);
    rock.position.y = 0.3;
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    g.add(rock);
    return g;
  }
  addBush(g: THREE.Group, color: number) {
    const bushMat = this.createMaterial(color, 0.9);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.15, 8, 6), bushMat);
      b.position.set(-0.3 + i * 0.25, 0.2, 0);
      b.castShadow = true;
      g.add(b);
    }
    return g;
  }

  setupInitialChunks() {
    for (let i = 0; i < 7; i++) {
      this.createGroundSegment(i * 20);
      this.createScenery(i * 20);
    }
    // Spawn initial objects
    for (let i = 0; i < 5; i++) {
      this.spawnWave(48 + i * 18);
    }
    this.seedOpeningRun();
  }

  /**
   * The opening ten seconds are the whole pitch — hand the player a dense, safe,
   * unmissable grab line that teaches lane-swiping and pays out immediately.
   */
  private seedOpeningRun() {
    for (let i = 0; i < 18; i++) {
      const z = 5 + i * 2.3;
      const lane = i < 7 ? 1 : i < 12 ? (i % 2 === 0 ? 0 : 1) : (i % 2 === 0 ? 2 : 1);
      this.spawnCollectible(LANE_X[lane], z, i === 3 || i === 14 ? 'golden' : 'normal');
    }
    this.spawnPowerUp(LANE_X[1], 24);
  }

  spawnCollectible(x: number, z: number, forceType?: string) {
    const r = Math.random();
    let type: string;
    let color: number;
    let points: number;
    if (forceType) {
      type = forceType;
      points = forceType === 'golden' ? 100 : forceType === 'bossEnergy' ? 150
        : forceType === 'flower' ? 50 : forceType === 'crystal' ? 75 : forceType === 'rare' ? 25 : 10;
      color = forceType === 'golden' ? 0xffd97a : forceType === 'bossEnergy' ? 0xfff0b0
        : forceType === 'flower' ? 0xfff0f0 : forceType === 'crystal' ? 0x9b59b6
        : forceType === 'rare' ? 0x4a2810 : 0x8b5a2b;
    } else {
      const goldBoost = this.save.outfit === 'farmer' ? 0.055 : 0;
      const c1 = 0.65 - goldBoost, c2 = c1 + 0.17, c3 = c2 + 0.10 + goldBoost, c4 = c3 + 0.05;
      if (r < c1) { type = 'normal'; color = 0x8b5a2b; points = 10; }
      else if (r < c2) { type = 'rare'; color = 0x4a2810; points = 25; }
      else if (r < c3) { type = 'golden'; color = 0xffd97a; points = 100; }
      else if (r < c4) { type = 'flower'; color = 0xfff0f0; points = 50; }
      else { type = 'crystal'; color = 0x9b59b6; points = 75; }
    }

    const group = new THREE.Group();
    group.userData = { type: 'collectible', subtype: type, points, collected: false };

    if (type === 'bossEnergy') {
      // Radiant mote of guardian energy
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xfff0b0, emissive: 0xffd97a, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.4,
      });
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), coreMat);
      group.add(core);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.3 })
      );
      group.add(halo);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.04, 6, 18),
        new THREE.MeshBasicMaterial({ color: 0xfff8e7, transparent: true, opacity: 0.7 })
      );
      ring.rotation.x = Math.PI / 2.4;
      group.add(ring);
    } else if (type === 'flower') {
      const petalMat = new THREE.MeshStandardMaterial({ color: 0xfff8e7, emissive: 0xfff0c0, emissiveIntensity: 0.35 });
      const centerMat = new THREE.MeshStandardMaterial({ color: 0xffd97a, emissive: 0xffd97a, emissiveIntensity: 0.5 });
      for (let i = 0; i < 5; i++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), petalMat);
        const a = (i / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.1, Math.sin(a) * 0.2);
        petal.scale.y = 0.3;
        group.add(petal);
      }
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), centerMat);
      group.add(center);
    } else if (type === 'crystal') {
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.2,
      });
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat);
      group.add(m);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 })
      );
      group.add(halo);
    } else {
      const isGolden = type === 'golden';
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: isGolden ? 0xffaa00 : 0x000000,
        emissiveIntensity: isGolden ? 0.5 : 0,
        roughness: isGolden ? 0.2 : 0.7,
        metalness: isGolden ? 0.6 : 0.1,
      });
      // Vanilla pod — slender, slightly curved capsule with a stem
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.52, 4, 8), mat);
      pod.rotation.z = Math.PI / 9;
      pod.castShadow = true;
      group.add(pod);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.16, 5),
        new THREE.MeshStandardMaterial({ color: isGolden ? 0xffe9a8 : 0x3d6b2d, roughness: 0.8 })
      );
      stem.position.set(-0.06, 0.37, 0);
      stem.rotation.z = Math.PI / 9;
      group.add(stem);

      if (isGolden) {
        const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.25 });
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 8), haloMat);
        group.add(halo);
        // Sparkle cross
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff8e7, transparent: true, opacity: 0.9 });
        for (const rot of [0, Math.PI / 2]) {
          const spark = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.025), sparkMat);
          spark.rotation.z = rot;
          group.add(spark);
        }
      }
      if (type === 'rare') {
        const shine = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 })
        );
        shine.position.set(0.075, 0.18, 0.06);
        group.add(shine);
      }
    }

    group.position.set(x, 1.2, z);
    this.scene.add(group);
    this.collectibles.push(group);
    return group;
  }

  spawnObstacle(lane: number, z: number, type?: string) {
    const types = ['log', 'rock', 'barrier', 'thorns', 'mud', 'lowbranch', 'rollingstone', 'chasm', 'falling_branch', 'river'];
    const t = type || types[Math.floor(Math.random() * types.length)];
    const group = new THREE.Group();
    group.userData = { type: 'obstacle', subtype: t, credit: false };
    const x = LANE_X[lane];
    let collider: { width: number; height: number; y: number; requireJump?: boolean; isWater?: boolean } = { width: 1, height: 1, y: 0.5 };

    if (t === 'log') {
      const mat = this.createMaterial(0x6b4020, 0.9);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.5, 8), mat);
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.35;
      log.castShadow = true;
      group.add(log);
      collider = { width: 0.7, height: 0.7, y: 0.35 };
    } else if (t === 'rock') {
      const mat = this.createMaterial(0x6b6b6b, 0.9);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), mat);
      rock.position.y = 0.5;
      rock.castShadow = true;
      group.add(rock);
      collider = { width: 1.0, height: 1.0, y: 0.5 };
    } else if (t === 'barrier') {
      const woodMat = this.createMaterial(0x8b5a2b);
      const postGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1);
      for (let dx of [-0.9, 0.9]) {
        const p = new THREE.Mesh(postGeo, woodMat);
        p.position.set(dx, 0.6, 0);
        p.castShadow = true;
        group.add(p);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.1), this.createMaterial(0x5c2e0c));
      bar.position.y = 0.8;
      bar.castShadow = true;
      group.add(bar);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.1), this.createMaterial(0x5c2e0c));
      bar2.position.y = 0.4;
      bar2.castShadow = true;
      group.add(bar2);
      collider = { width: 1.9, height: 1.2, y: 0.6 };
    } else if (t === 'thorns') {
      const mat = this.createMaterial(0x4a2010, 0.9);
      for (let i = 0; i < 5; i++) {
        const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), mat);
        thorn.position.set(-0.6 + i * 0.3, 0.25, 0);
        thorn.castShadow = true;
        group.add(thorn);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.3), this.createMaterial(0x3d1808));
      base.position.y = 0.04;
      group.add(base);
      collider = { width: 1.8, height: 0.5, y: 0.25 };
    } else if (t === 'mud') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a2810, roughness: 1 });
      const mud = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 2), mat);
      mud.position.y = 0.025;
      mud.receiveShadow = true;
      group.add(mud);
      collider = { width: 2, height: 0.05, y: 0.03 };
    } else if (t === 'lowbranch') {
      // must slide under
      const mat = this.createMaterial(0x6b4020, 0.9);
      const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
      for (let dx of [-1, 1]) {
        const p = new THREE.Mesh(postGeo, mat);
        p.position.set(dx, 0.6, 0);
        p.castShadow = true;
        group.add(p);
      }
      const branch = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 0.3), mat);
      branch.position.y = 1.2;
      branch.castShadow = true;
      group.add(branch);
      // leaves
      const leafMat = this.createMaterial(0x3d6b2d);
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), leafMat);
        leaf.position.set(-0.7 + i * 0.45, 1.3, 0);
        leaf.castShadow = true;
        group.add(leaf);
      }
      collider = { width: 2.2, height: 0.5, y: 1.2 }; // need to slide
    } else if (t === 'rollingstone') {
      // Rolling mossy boulder
      const mat = this.createMaterial(0x736d65, 0.85);
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 1), mat);
      boulder.position.y = 0.68;
      boulder.castShadow = true;
      group.add(boulder);
      // moss patch
      const mossMat = this.createMaterial(0x426829, 0.9);
      const moss = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), mossMat);
      moss.position.set(0.2, 0.85, 0.2);
      boulder.add(moss);
      collider = { width: 1.3, height: 1.3, y: 0.68 };
    } else if (t === 'chasm') {
      // Broken wooden bridge chasm / hole in the track (MUST JUMP)
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x120a06 });
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), holeMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.015;
      group.add(hole);
      // jagged broken planks
      const plankMat = this.createMaterial(0x5c2e0c, 0.95);
      for (let i = 0; i < 4; i++) {
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.6 + Math.random() * 0.4), plankMat);
        p1.position.set(-0.8 + i * 0.52, 0.05, -1.3);
        group.add(p1);
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.6 + Math.random() * 0.4), plankMat);
        p2.position.set(-0.8 + i * 0.52, 0.05, 1.3);
        group.add(p2);
      }
      collider = { width: 2.1, height: 1.4, y: 0.2, requireJump: true };
    } else if (t === 'falling_branch') {
      // Branch suspended up high that drops down when player approaches
      const mat = this.createMaterial(0x6b4020, 0.9);
      const branch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 0.35), mat);
      branch.position.y = 3.6;
      branch.castShadow = true;
      group.add(branch);
      // foliage
      const leafMat = this.createMaterial(0x2f6022, 0.8);
      for (let i = 0; i < 5; i++) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), leafMat);
        lf.position.set(-0.9 + i * 0.45, 3.6, 0);
        group.add(lf);
      }
      // Shadow hint on the ground
      const shMat = new THREE.MeshBasicMaterial({ color: 0x1f140c, transparent: true, opacity: 0.45 });
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.6), shMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.03;
      group.add(sh);
      group.userData.falling = true;
      group.userData.fallen = false;
      collider = { width: 2.2, height: 0.8, y: 0.45 };
    } else if (t === 'river') {
      // Shallow tropical water crossing (dynamic splash terrain)
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x4ec5d9, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85,
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.03;
      group.add(water);
      // Floating waterlily
      const lilyMat = this.createMaterial(0x386b22, 0.9);
      const lily = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 8), lilyMat);
      lily.position.set(0.35, 0.045, -0.3);
      group.add(lily);
      collider = { width: 2.2, height: 0.05, y: 0.03, isWater: true };
    }

    group.position.set(x, 0, z);
    this.scene.add(group);
    this.obstacles.push(group);
    (group as any).collider = collider;
    return group;
  }

  spawnEnemy(lane: number, z: number, forcedType?: string) {
    const types = ['lemur', 'chameleon', 'fossa', 'giant_moth', 'crested_ibis'];
    const t = forcedType || types[Math.floor(Math.random() * types.length)];
    const group = new THREE.Group();
    group.userData = { type: 'enemy', subtype: t, bobPhase: Math.random() * Math.PI * 2 };

    if (t === 'lemur') {
      // Cute ring-tailed lemur
      const bodyMat = this.createMaterial(0xd4d4d4, 0.8);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), bodyMat);
      body.position.y = 0.45;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bodyMat);
      head.position.set(0, 0.7, 0.2);
      head.castShadow = true;
      group.add(head);
      // Ears
      const earGeo = new THREE.SphereGeometry(0.1, 6, 6);
      const earMat = this.createMaterial(0xf5f5f5);
      const earL = new THREE.Mesh(earGeo, earMat);
      earL.position.set(-0.22, 0.9, 0.15);
      group.add(earL);
      const earR = new THREE.Mesh(earGeo, earMat);
      earR.position.set(0.22, 0.9, 0.15);
      group.add(earR);
      // Eyes
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.4 });
      const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
      const el = new THREE.Mesh(eyeGeo, eyeMat);
      el.position.set(-0.1, 0.72, 0.43);
      group.add(el);
      const er = new THREE.Mesh(eyeGeo, eyeMat);
      er.position.set(0.1, 0.72, 0.43);
      group.add(er);
      // Ringed tail
      const tailMat = this.createMaterial(0x3a3a3a);
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.01, 6, 6), i % 2 === 0 ? bodyMat : tailMat);
        seg.position.set(0, 0.4 + i * 0.1, -0.3 - i * 0.12);
        group.add(seg);
      }
    } else if (t === 'chameleon') {
      const bodyMat = this.createMaterial(0x4a9b4a, 0.7);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bodyMat);
      body.scale.set(1, 0.7, 1.6);
      body.position.y = 0.3;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat);
      head.scale.set(1, 0.8, 1.3);
      head.position.set(0, 0.35, 0.45);
      group.add(head);
      // curled tail
      const tailGeo = new THREE.ConeGeometry(0.1, 0.7, 6);
      const tail = new THREE.Mesh(tailGeo, bodyMat);
      tail.position.set(0, 0.35, -0.5);
      tail.rotation.x = Math.PI / 3;
      group.add(tail);
      // eye turrets
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffdd00 });
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
      eyeL.position.set(-0.18, 0.45, 0.5);
      group.add(eyeL);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
      eyeR.position.set(0.18, 0.45, 0.5);
      group.add(eyeR);
      // dorsal crest
      for (let i = 0; i < 4; i++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 4), this.createMaterial(0x2d5c2d));
        spine.position.set(0, 0.55, -0.2 + i * 0.2);
        group.add(spine);
      }
    } else if (t === 'fossa') {
      // sleek cat-like creature
      const bodyMat = this.createMaterial(0x8b5a2b, 0.7);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.6, 4, 8), bodyMat);
      body.position.y = 0.4;
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat);
      head.position.set(0, 0.45, 0.45);
      group.add(head);
      // ears
      const earGeo = new THREE.ConeGeometry(0.08, 0.14, 4);
      const earL = new THREE.Mesh(earGeo, bodyMat);
      earL.position.set(-0.12, 0.62, 0.38);
      group.add(earL);
      const earR = new THREE.Mesh(earGeo, bodyMat);
      earR.position.set(0.12, 0.62, 0.38);
      group.add(earR);
      // Glowing eyes
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff3300, emissiveIntensity: 0.8 });
      const el = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
      el.position.set(-0.08, 0.48, 0.62);
      group.add(el);
      const er = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
      er.position.set(0.08, 0.48, 0.62);
      group.add(er);
      // tail
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.8, 6), bodyMat);
      tail.position.set(0, 0.5, -0.6);
      tail.rotation.x = Math.PI / 3;
      group.add(tail);
    } else if (t === 'giant_moth') {
      // Madagascar Comet Moth (Argema mittrei) — giant golden silk moth hovering in upper air
      const bodyMat = this.createMaterial(0x5a2d12, 0.85);
      const mothBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.55, 4, 8), bodyMat);
      mothBody.rotation.x = Math.PI / 2;
      group.add(mothBody);
      // Wing material with subtle gold emissive
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0xf5cf47, emissive: 0xffbe26, emissiveIntensity: 0.28, roughness: 0.4, side: THREE.DoubleSide,
      });
      const spotMat = new THREE.MeshBasicMaterial({ color: 0x5a2d12 });
      // Left wing
      const leftWing = new THREE.Group();
      const lwMain = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), wingMat);
      lwMain.position.set(-0.48, 0, 0.05);
      lwMain.rotation.x = -Math.PI / 2;
      leftWing.add(lwMain);
      const lwSpot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), spotMat);
      lwSpot.position.set(-0.48, 0.01, 0.05);
      lwSpot.rotation.x = -Math.PI / 2;
      leftWing.add(lwSpot);
      // Tail streamer
      const lwTail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.9, 4), wingMat);
      lwTail.position.set(-0.55, 0, -0.5);
      lwTail.rotation.x = Math.PI / 2;
      leftWing.add(lwTail);
      group.add(leftWing);
      (group as any).leftWing = leftWing;

      // Right wing
      const rightWing = new THREE.Group();
      const rwMain = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), wingMat);
      rwMain.position.set(0.48, 0, 0.05);
      rwMain.rotation.x = -Math.PI / 2;
      rightWing.add(rwMain);
      const rwSpot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), spotMat);
      rwSpot.position.set(0.48, 0.01, 0.05);
      rwSpot.rotation.x = -Math.PI / 2;
      rightWing.add(rwSpot);
      const rwTail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.9, 4), wingMat);
      rwTail.position.set(0.55, 0, -0.5);
      rwTail.rotation.x = Math.PI / 2;
      rightWing.add(rwTail);
      group.add(rightWing);
      (group as any).rightWing = rightWing;

      group.position.y = 1.35;
      (group as any).collider = { width: 1.8, height: 0.7, y: 1.35, requiresSlide: true };
    } else if (t === 'crested_ibis') {
      // Madagascar Crested Ibis (Lophotibis cristata) — elegant tropical bird
      const bodyMat = this.createMaterial(0xf4f0e6, 0.8);
      const birdBody = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), bodyMat);
      birdBody.scale.set(0.9, 0.9, 1.3);
      birdBody.position.y = 0.42;
      group.add(birdBody);
      // Head with crimson crest
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), bodyMat);
      head.position.set(0, 0.62, 0.28);
      group.add(head);
      const crestMat = this.createMaterial(0xb3281c, 0.8);
      for (let i = 0; i < 4; i++) {
        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), crestMat);
        feather.position.set(0, 0.74 + i * 0.03, 0.22 - i * 0.06);
        feather.rotation.x = -0.4;
        group.add(feather);
      }
      // Curved beak
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 5), this.createMaterial(0x22150c));
      beak.position.set(0, 0.56, 0.44);
      beak.rotation.x = Math.PI / 2.3;
      group.add(beak);
      // Wings
      const wingMat = this.createMaterial(0x3d6647, 0.8);
      const wL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.45), wingMat);
      wL.position.set(-0.22, 0.45, 0);
      group.add(wL);
      const wR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.45), wingMat);
      wR.position.set(0.22, 0.45, 0);
      group.add(wR);
      (group as any).collider = { width: 0.8, height: 0.8, y: 0.5 };
    }

    group.position.set(LANE_X[lane], group.position.y || 0, z);
    this.scene.add(group);
    this.enemies.push(group);
    if (!(group as any).collider) {
      (group as any).collider = { width: 0.7, height: 0.8, y: 0.5 };
    }
    return group;
  }

  spawnPowerUp(x: number, z: number) {
    const types = ['magnet', 'goldenRush', 'shield', 'speed', 'invincibility', 'storm'] as const;
    const t = types[Math.floor(Math.random() * types.length)];
    const group = new THREE.Group();
    group.userData = { type: 'powerup', subtype: t };
    const col = POWERUP_COLORS[t];
    const mat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.25,
    });
    // Core crystal
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat);
    group.add(mesh);
    // Orbiting vanilla pod motif
    const podMat = new THREE.MeshStandardMaterial({ color: 0x4a2810, roughness: 0.5 });
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 3, 6), podMat);
    pod.position.set(0.55, 0, 0);
    pod.rotation.z = 0.4;
    group.add(pod);
    (group as any).orbitPod = pod;
    // Outer glow
    const glowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.26 });
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 0), glowMat);
    group.add(glow);
    (group as any).glow = glow;
    // Ground halo
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 20),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -1.42;
    group.add(halo);

    group.position.set(x, 1.5, z);
    this.scene.add(group);
    this.collectibles.push(group);
    (group as any).rotSpeed = 2;
    return group;
  }

  spawnWave(z: number) {
    const difficulty = Math.min(1, this.stats.distance / 2500);
    const inBoss = !!this.boss;
    const spawnCollectibleRow = Math.random() < (inBoss ? 0.45 : 0.88);
    // Ease the player in: almost no hazards for the first ~150 m
    const warmup = this.stats.distance < 150 ? 0 : 1;
    const hasObstacle = !inBoss && warmup === 1 && Math.random() < 0.38 + difficulty * 0.4;
    const hasEnemy = !inBoss && warmup === 1 && this.stats.distance > 320 && Math.random() < 0.12 + difficulty * 0.2;
    const hasPowerUp = !inBoss && Math.random() < 0.075;

    // Decide obstacle pattern
    const blockedLanes = new Set<number>();
    if (hasObstacle) {
      // Sometimes block one, sometimes two (leave one free)
      const numBlocked = Math.random() < 0.3 + difficulty * 0.3 ? 2 : 1;
      if (numBlocked === 2) {
        // two lanes blocked
        const open = Math.floor(Math.random() * 3);
        for (let i = 0; i < 3; i++) if (i !== open) blockedLanes.add(i);
      } else {
        blockedLanes.add(Math.floor(Math.random() * 3));
      }
      blockedLanes.forEach(l => {
        let subType: string | undefined;
        const r = Math.random();
        if (this.currentEnv === 0) { // Plantation
          subType = r < 0.28 ? 'falling_branch' : r < 0.55 ? 'lowbranch' : r < 0.8 ? 'log' : 'barrier';
        } else if (this.currentEnv === 1) { // Tropical Forest
          subType = r < 0.25 ? 'river' : r < 0.5 ? 'falling_branch' : r < 0.75 ? 'lowbranch' : 'thorns';
        } else if (this.currentEnv === 2) { // Baobab Valley
          subType = r < 0.35 ? 'rollingstone' : r < 0.65 ? 'mud' : r < 0.85 ? 'rock' : 'barrier';
        } else if (this.currentEnv === 3) { // Mountain
          subType = r < 0.35 ? 'chasm' : r < 0.7 ? 'rollingstone' : 'rock';
        } else if (this.currentEnv === 4) { // Coast
          subType = r < 0.35 ? 'river' : r < 0.65 ? 'chasm' : 'log';
        } else { // Mystery Island
          subType = r < 0.3 ? 'rollingstone' : r < 0.6 ? 'chasm' : 'lowbranch';
        }
        this.spawnObstacle(l, z, subType);
      });
    }

    if (hasEnemy) {
      let lane = Math.floor(Math.random() * 3);
      let enemyType: string | undefined;
      const eroll = Math.random();
      if (this.currentEnv === 0 || this.currentEnv === 1) {
        enemyType = eroll < 0.45 ? 'lemur' : eroll < 0.75 ? 'giant_moth' : 'chameleon';
      } else if (this.currentEnv === 2) {
        enemyType = eroll < 0.55 ? 'fossa' : 'lemur';
      } else if (this.currentEnv === 3) {
        enemyType = eroll < 0.6 ? 'crested_ibis' : 'chameleon';
      } else if (this.currentEnv === 4) {
        enemyType = eroll < 0.55 ? 'crested_ibis' : 'lemur';
      } else {
        enemyType = eroll < 0.5 ? 'giant_moth' : 'fossa';
      }
      this.spawnEnemy(lane, z - 2 - Math.random() * 3, enemyType);
    }

    if (spawnCollectibleRow) {
      // Spawn a pattern of collectibles
      const pattern = Math.floor(Math.random() * 4);
      if (pattern === 0) {
        // Single lane line
        const lane = Math.floor(Math.random() * 3);
        for (let i = 0; i < 5; i++) {
          if (!blockedLanes.has(lane)) {
            this.spawnCollectible(LANE_X[lane], z - i * 1.8);
          }
        }
      } else if (pattern === 1) {
        // zig-zag across open lanes
        const open = [0, 1, 2].filter(l => !blockedLanes.has(l));
        for (let i = 0; i < 6; i++) {
          const lane = open[i % open.length];
          this.spawnCollectible(LANE_X[lane], z - i * 1.8);
        }
      } else if (pattern === 2) {
        // All three lanes, arcs
        for (let i = 0; i < 4; i++) {
          for (let l = 0; l < 3; l++) {
            if (!blockedLanes.has(l)) {
              this.spawnCollectible(LANE_X[l], z - i * 1.8);
            }
          }
        }
      } else {
        // Single golden
        const open = [0, 1, 2].filter(l => !blockedLanes.has(l));
        const lane = open[Math.floor(Math.random() * open.length)] || 1;
        // Normal arc with golden in middle
        for (let i = 0; i < 7; i++) {
          this.spawnCollectible(LANE_X[lane], z - i * 1.6);
        }
      }
    }

    if (hasPowerUp) {
      const open = [0, 1, 2].filter(l => !blockedLanes.has(l));
      const lane = open[Math.floor(Math.random() * open.length)] ?? 1;
      this.spawnPowerUp(LANE_X[lane], z - 3);
    }
  }

  spawnParticles(x: number, y: number, z: number, color: number, count = 12, size = 0.12) {
    if (this.save.settings.reducedMotion) count = Math.max(2, Math.ceil(count * 0.32));
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(size * (0.6 + Math.random() * 0.8), 5, 4);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.scene.add(m);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 6 + 2,
        (Math.random() - 0.5) * 4
      );
      this.particles.push({ mesh: m, velocity: vel, life: 0.6, maxLife: 0.6 });
    }
  }

  /** World-space label, projected to screen once and handed to the DOM for crisp type. */
  projectToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) return null;
    const size = this.renderer.getSize(new THREE.Vector2());
    return { x: (v.x * 0.5 + 0.5) * size.x, y: (-v.y * 0.5 + 0.5) * size.y };
  }

  /** Short haptic feedback (mobile only) — guarded by the accessibility setting. */
  haptic(pattern: number | number[]) {
    if (!this.save.settings.haptics) return;
    try { navigator.vibrate?.(pattern); } catch {}
  }

  popup(text: string, color: string, big = false, at?: THREE.Vector3) {
    const p = at || new THREE.Vector3(this.player.position.x, this.playerY + 2.6, this.player.position.z + 1.4);
    const scr = this.projectToScreen(p.x, p.y, p.z);
    if (scr) this.onPopup(text, color, scr, big);
  }

  spawnTextParticle(_text: string, x: number, y: number, z: number, color: string) {
    // Just use a particle with bright color; full text handled in UI floating numbers
    this.spawnParticles(x, y, z, color === 'gold' ? 0xffd97a : 0xffffff, 6, 0.08);
  }

  // ---------- Input ----------
  bindInputs() {
    const canvas = this.renderer.domElement;

    // ---- Keyboard ----
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (this.keys[k]) return; // ignore auto-repeat
      this.keys[k] = true;
      if (this.gameState !== 'playing') return;
      if (k === 'arrowleft' || k === 'a' || k === 'q') { e.preventDefault(); this.moveLane(-1); }
      else if (k === 'arrowright' || k === 'd') { e.preventDefault(); this.moveLane(1); }
      else if (k === 'arrowup' || k === 'w' || k === 'z' || k === ' ') { e.preventDefault(); this.jump(); }
      else if (k === 'arrowdown' || k === 's') { e.preventDefault(); this.slide(); }
      else if (k === 'enter' || k === 'shift' || k === 'e') { e.preventDefault(); this.activateDash(); }
      else if (k === 'escape' || k === 'p') { e.preventDefault(); this.togglePause(); }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    // ---- Touch: gestures resolve during the move for minimum latency ----
    const MIN_SWIPE = 26;
    let gestureHandled = false;

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.sound.resume();
      if (this.gameState !== 'playing') return;
      const t = e.changedTouches[0];
      this.swipeStart = { x: t.clientX, y: t.clientY, time: performance.now() };
      this.touchId = t.identifier;
      gestureHandled = false;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (this.gameState !== 'playing' || gestureHandled) return;
      const t = Array.from(e.changedTouches).find(tt => tt.identifier === this.touchId);
      if (!t) return;
      e.preventDefault();
      const dx = t.clientX - this.swipeStart.x;
      const dy = t.clientY - this.swipeStart.y;
      const absX = Math.abs(dx), absY = Math.abs(dy);
      if (absX < MIN_SWIPE && absY < MIN_SWIPE) return;
      gestureHandled = true;              // fire as soon as the threshold is crossed
      if (absX > absY) this.moveLane(dx > 0 ? 1 : -1);
      else if (dy < 0) this.jump();
      else this.slide();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.gameState !== 'playing') return;
      const t = Array.from(e.changedTouches).find(tt => tt.identifier === this.touchId);
      this.touchId = null;
      if (!t || gestureHandled) return;
      const dt = performance.now() - this.swipeStart.time;
      const dx = t.clientX - this.swipeStart.x;
      const dy = t.clientY - this.swipeStart.y;
      if (dt < 300 && Math.abs(dx) < MIN_SWIPE && Math.abs(dy) < MIN_SWIPE) {
        // Tap = special ability, or a jump when it isn't charged yet
        if (this.dash.ready) this.activateDash();
        else this.jump();
      }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => { this.touchId = null; });

    // ---- Mouse (desktop testing) ----
    let mouseDown = false;
    let mouseStart = { x: 0, y: 0 };
    let mouseHandled = false;
    canvas.addEventListener('mousedown', (e) => {
      this.sound.resume();
      mouseDown = true;
      mouseHandled = false;
      mouseStart = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!mouseDown || mouseHandled || this.gameState !== 'playing') return;
      const dx = e.clientX - mouseStart.x;
      const dy = e.clientY - mouseStart.y;
      const absX = Math.abs(dx), absY = Math.abs(dy);
      if (absX < 30 && absY < 30) return;
      mouseHandled = true;
      if (absX > absY) this.moveLane(dx > 0 ? 1 : -1);
      else if (dy < 0) this.jump();
      else this.slide();
    });
    canvas.addEventListener('mouseup', () => {
      if (mouseDown && !mouseHandled && this.gameState === 'playing') {
        if (this.dash.ready) this.activateDash();
        else this.jump();
      }
      mouseDown = false;
    });
    canvas.addEventListener('mouseleave', () => { mouseDown = false; });
  }

  moveLane(dir: number) {
    if (this.gameState !== 'playing') return;
    const newLane = Math.max(0, Math.min(2, this.playerLane + dir));
    if (newLane !== this.playerLane) {
      this.playerLane = newLane;
      this.player.rotation.y = dir * 0.42;   // lean into the turn
      this.sound.uiClick();
      this.spawnParticles(this.player.position.x, 0.15, this.player.position.z, 0xf5e6c8, 3, 0.07);
    }
  }

  jump() {
    if (this.gameState !== 'playing') return;
    if (this.isJumping || this.isSliding) return;
    this.isJumping = true;
    this.playerVY = JUMP_VELOCITY;
    this.sound.jump();
    this.haptic(8);
    this.spawnParticles(this.player.position.x, 0.1, this.player.position.z, 0xf5e6c8, 7, 0.09);
  }

  slide() {
    if (this.gameState !== 'playing') return;
    if (this.isSliding) return;
    if (this.isJumping) {
      this.playerVY = -34;      // fast-fall to land and slide sooner
      return;
    }
    this.isSliding = true;
    this.slideTimer = SLIDE_DURATION;
    this.sound.slide();
    this.spawnParticles(this.player.position.x, 0.15, this.player.position.z, 0xe8d4a8, 10, 0.1);
  }

  togglePause() {
    if (this.gameState === 'playing') this.pause();
    else if (this.gameState === 'paused') this.resume();
  }
  pause() {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';
    this.sound.setMusic(false);
    this.onStateChange('paused');
  }
  resume() {
    if (this.gameState !== 'paused') return;
    this.gameState = 'playing';
    this.sound.setMusic(this.save.settings.music);
    this.getDelta(); // discard the paused interval
    this.onStateChange('playing');
    this.lastTime = performance.now();
  }

  goToMenu() {
    this.clearBoss();
    this.gameState = 'menu';
    this.resetGame();
    this.showCharacterPreview(false);
    this.applyOutfit(this.save.outfit);
    this.sound.setLayer('plantation');
    this.sound.setMusic(this.save.settings.music);
    this.onStateChange('menu');
  }

  resetGame() {
    // Clear dynamic objects
    [...this.collectibles, ...this.obstacles, ...this.enemies].forEach(o => {
      this.scene.remove(o);
    });
    this.collectibles = [];
    this.obstacles = [];
    this.enemies = [];
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    // Reset stats
    this.stats = {
      ...this.stats,
      score: 0, vanilla: 0, goldenVanilla: 0, distance: 0, combo: 0, maxCombo: 0,
      multiplier: 1, speed: BASE_SPEED,
    };
    this.powerUp = { type: null, timeLeft: 0 };
    this.currentEnv = 0;
    this.envTimer = 0;
    // Reset boss / ability / run tracking
    this.clearBoss();
    this.bossesBeaten = 0;
    this.nextBossAt = 700;
    this.dash = { charge: 0, ready: false, active: false, timeLeft: 0 };
    this.trailTimer = 0;
    this.stormTimer = 0;
    this.hitStop = 0;
    this.deathTimer = 0;
    this.invulnAfterRevive = 0;
    this.nearMisses = 0;
    this.everHit = false;
    this.maxSpeedSeen = 0;
    this.revives = 0;
    this.comboTiers = [10, 25, 50];
    this.tookHit = false;
    this.maxEnvReached = 0;
    this.flashAmount = 0;
    this.shieldCharges = 0;
    // Reset player
    this.playerLane = 1;
    this.targetX = 0;
    this.playerY = 0;
    this.playerVY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.isInvincibleHit = false;
    this.hitTimer = 0;
    this.player.position.set(0, 0, 0);
    this.player.rotation.set(0, 0, 0);
    this.player.scale.set(1, 1, 1);
    this.player.visible = true;
    // Reset power-up visuals
    const shieldMesh = (this.player as any).shieldMesh as THREE.Mesh;
    const ringMesh = (this.player as any).ringMesh as THREE.Mesh;
    const auraMesh = (this.player as any).auraMesh as THREE.Mesh;
    if (shieldMesh) (shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    if (ringMesh) (ringMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    if (auraMesh) (auraMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    // Reset body emissive
    (this.playerParts.body.material as THREE.MeshStandardMaterial).emissive?.setHex(0x000000);
    (this.playerParts.body.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    this.setupLighting(0);
    this.scene.background = new THREE.Color(ENVIRONMENTS[0].sky);
    this.scene.fog = new THREE.Fog(ENVIRONMENTS[0].fog, 30, 90);
    this.applyAtmosphere(0);
    // Reset ground/scenery
    this.groundSegments.forEach(g => this.scene.remove(g));
    this.sideScenery.forEach(s => this.scene.remove(s));
    this.groundSegments = [];
    this.sideScenery = [];
    this.animatedProps = [];
    this.setupInitialChunks();
    this.onStatsUpdate({ ...this.stats });
    this.onPowerUpUpdate({ ...this.powerUp });
    this.onDashUpdate({ ...this.dash });
    this.onEnvironmentChange(ENVIRONMENTS[0].name);
  }

  startGame() {
    this.sound.init();
    this.sound.resume();
    this.sound.setSfx(this.save.settings.sfx);
    this.sound.setMusic(this.save.settings.music);
    this.showCharacterPreview(false);
    this.resetGame();
    this.applyOutfit(this.save.outfit);

    // --- Apply purchased upgrades ---
    const up = this.save.upgrades;
    if (up.headStart > 0) {
      this.stats.distance = up.headStart * 400;
      this.stats.speed = Math.min(MAX_SPEED, BASE_SPEED + this.stats.distance * 0.0062);
      // Skip ahead through environments so the head start feels real
      const envSkip = Math.min(ENVIRONMENTS.length - 1, Math.floor(up.headStart));
      if (envSkip > 0) this.switchEnvironment(envSkip);
    }
    this.nextBossAt = 700 + this.stats.distance;

    // --- Daily challenge rules ---
    this.comboTiers = [10, 25, 50];
    const ch = challengeForToday();
    if (ch.id === 'combo') this.comboTiers = [5, 12, 25];
    if (ch.id === 'golden') {
      this.powerUp = { type: 'goldenRush', timeLeft: 14 };
      this.onPowerUpUpdate({ ...this.powerUp });
    }
    if (ch.id === 'guard') {
      this.shieldCharges = Math.max(1, this.shieldCharges);
      this.powerUp = { type: 'shield', timeLeft: 999 };
      this.onPowerUpUpdate({ ...this.powerUp });
    }
    if (ch.id === 'boss') this.nextBossAt = 420 + this.stats.distance;
    if (ch.id === 'distance') this.stats.distance += 300;
    if (this.save.outfit === 'guardian') up.shield = Math.max(up.shield, 1);
    if (up.shield > 0) {
      this.shieldCharges = up.shield;
      this.powerUp = { type: 'shield', timeLeft: 999 };
      this.onPowerUpUpdate({ ...this.powerUp });
    }

    this.sound.setLayer(this.musicLayerForEnv());
    this.sound.startMusic();

    this.gameState = 'playing';
    this.onStateChange('playing');
    this.lastTime = performance.now();
    if (!this.rafId) this.loop();
  }

  endGame() {
    if (this.gameState !== 'playing') return;
    this.gameState = 'dying';
    this.deathTimer = 0.6;
    this.player.rotation.z = 0;
    this.clearBoss();
  }

  private finalizeDeath() {
    if (this.gameState === 'gameover') return;
    this.gameState = 'gameover';
    this.sound.gameOver();
    this.sound.setLayer('plantation');
    this.recordRun();
    this.onStateChange('gameover');
    this.onStatsUpdate({ ...this.stats });
  }

  /** Coin continue — keeps the run (and its combo potential) alive. */
  get canRevive() { return this.revives < 2; }
  get reviveCost() { return 200 * (this.revives + 1); }

  reviveRun(): boolean {
    if (!this.canRevive || this.gameState !== 'gameover') return false;
    const cost = this.reviveCost;
    if (this.save.coins < cost) return false;

    this.save.coins -= cost;
    this.save.reviveCount += 1;
    this.stats.coins = this.save.coins;
    this.revives += 1;
    this.persist();

    // Scrub the road ahead so the player lands in a fair moment
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      if (this.obstacles[i].position.z > -6) { this.scene.remove(this.obstacles[i]); this.obstacles.splice(i, 1); }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].position.z > -6) { this.scene.remove(this.enemies[i]); this.enemies.splice(i, 1); }
    }
    this.tookHit = false;
    this.deathTimer = 0;
    this.player.rotation.set(0, 0, 0);
    this.player.visible = true;
    this.isInvincibleHit = true;
    this.invulnAfterRevive = 2.4;
    this.hitTimer = 2.4;
    this.stats.combo = 0;
    this.stats.multiplier = 1;
    this.stats.speed = BASE_SPEED;
    this.nextBossAt = Math.max(this.nextBossAt, this.stats.distance + 500);
    this.sound.powerup();
    this.sound.setMusic(this.save.settings.music);
    this.flash(0xffd97a, 0.5);
    this.screenShake = 0.35;
    this.spawnParticles(this.player.position.x, 1.4, this.player.position.z, 0xffd97a, 30, 0.18);
    this.onToast({ id: Date.now(), kind: 'info', icon: '🌿', title: 'Récolte reprise !', subtitle: "2 s d'invuln\u00e9rabilit\u00e9" });
    this.gameState = 'playing';
    this.onStateChange('playing');
    this.onStatsUpdate({ ...this.stats });
    return true;
  }

  getDelta(): number {
    const now = performance.now();
    const dt = (now - this._prevTime) / 1000;
    this._prevTime = now;
    return dt > 0 ? dt : 0;
  }

  handleResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  takeDamage() {
    if (this.gameState !== 'playing') return;
    if (this.isInvincibleHit) return;
    if (this.dash.active) return;
    if (this.powerUp.type === 'invincibility') return;

    // Shield absorbs the hit and grants a moment of mercy invulnerability
    if (this.powerUp.type === 'shield') {
      this.shieldCharges = Math.max(0, this.shieldCharges - 1);
      if (this.shieldCharges <= 0) {
        this.powerUp.type = null;
        this.powerUp.timeLeft = 0;
      }
      this.sound.shieldBreak();
      this.spawnParticles(this.player.position.x, 1.5, this.player.position.z, 0x3498db, 24, 0.16);
      this.screenShake = 0.45;
      this.flash(0x3498db, 0.3);
      this.isInvincibleHit = true;
      this.hitTimer = 1.1;
      this.stats.combo = 0;
      this.stats.multiplier = 1;
      this.onPowerUpUpdate({ ...this.powerUp });
      this.onStatsUpdate({ ...this.stats });
      this.onToast({ id: Date.now(), kind: 'info', icon: '🛡️', title: 'Bouclier absorbé !' });
      return;
    }

    this.tookHit = true;
    this.everHit = true;
    this.sound.hit();
    this.haptic([50, 45, 70]);
    this.screenShake = 1.0;
    this.hitStop = 0.1;
    this.flash(0xff5533, 0.5);
    this.stats.combo = 0;
    this.stats.multiplier = 1;
    this.spawnParticles(this.player.position.x, 1.2, this.player.position.z, 0xff6633, 26, 0.17);
    this.onStatsUpdate({ ...this.stats });
    this.endGame();
  }

  updatePlayer(dt: number) {
    // Lane movement
    const targetX = LANE_X[this.playerLane];
    const agility = LANE_CHANGE_SPEED * (this.save.outfit === 'ocean' ? 1.28 : 1);
    this.player.position.x += (targetX - this.player.position.x) * Math.min(1, agility * dt);

    // Gravity / jump
    if (this.isJumping) {
      this.playerVY += GRAVITY * dt;
      this.playerY += this.playerVY * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVY = 0;
        this.isJumping = false;
      }
    }
    this.player.position.y = this.playerY;

    // Slide
    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.isSliding = false;
    }

    // Hit invulnerability (after shield break)
    if (this.isInvincibleHit) {
      this.hitTimer -= dt;
      // flashing
      const vis = Math.floor(this.hitTimer * 12) % 2 === 0;
      this.player.visible = vis;
      if (this.hitTimer <= 0) {
        this.isInvincibleHit = false;
        this.player.visible = true;
      }
    } else {
      this.player.visible = true;
    }

    // Player visual scale/rotation for slide
    const slideT = this.isSliding ? 1 : 0;
    this.player.scale.y = 1 - slideT * 0.5;
    this.player.scale.z = 1 + slideT * 0.3;
    const targetRotX = this.isSliding ? 0.2 : 0;
    this.player.rotation.x += (targetRotX - this.player.rotation.x) * Math.min(1, dt * 12);
    this.player.rotation.y += (0 - this.player.rotation.y) * Math.min(1, dt * 7);
    this.player.rotation.z = -this.player.rotation.y * 0.35;

    // Running animation - swing arms/legs
    this.runTime += dt * (this.stats.speed / BASE_SPEED) * 12;
    const run = Math.sin(this.runTime);
    const inAirFactor = this.isJumping ? 0.2 : (this.isSliding ? 0 : 1);
    const arms = this.playerParts;
    arms.leftLeg.rotation.x = run * 0.8 * inAirFactor;
    arms.rightLeg.rotation.x = -run * 0.8 * inAirFactor;
    arms.leftArm.rotation.x = -run * 0.7 * inAirFactor;
    arms.rightArm.rotation.x = run * 0.7 * inAirFactor;
    if (this.isSliding) {
      arms.leftArm.rotation.x = -0.5;
      arms.rightArm.rotation.x = -0.5;
      arms.leftLeg.rotation.x = -0.3;
      arms.rightLeg.rotation.x = -0.3;
    }

    // Bob head slightly
    arms.head.position.y = 1.95 + Math.abs(run) * 0.05 * inAirFactor;

    // Hit flash color
    if (this.powerUp.type === 'invincibility') {
      (this.playerParts.body.material as THREE.MeshStandardMaterial).emissive?.setHex(0xffd97a);
      (this.playerParts.body.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.sin(this.runTime * 2) * 0.2;
    } else {
      (this.playerParts.body.material as THREE.MeshStandardMaterial).emissive?.setHex(0x000000);
      (this.playerParts.body.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    }

    // Power-up visuals
    const shieldMesh = (this.player as any).shieldMesh as THREE.Mesh;
    const ringMesh = (this.player as any).ringMesh as THREE.Mesh;
    const auraMesh = (this.player as any).auraMesh as THREE.Mesh;
    const shieldMat = shieldMesh.material as THREE.MeshBasicMaterial;
    const ringMat = ringMesh.material as THREE.MeshBasicMaterial;
    const auraMat = auraMesh.material as THREE.MeshBasicMaterial;
    shieldMat.opacity += ((this.powerUp.type === 'shield' ? 0.35 : 0) - shieldMat.opacity) * Math.min(1, dt * 6);
    ringMat.opacity += ((this.powerUp.type === 'magnet' ? 0.7 : 0) - ringMat.opacity) * Math.min(1, dt * 6);
    auraMat.opacity += ((this.powerUp.type === 'invincibility' ? 0.3 : this.powerUp.type === 'speed' ? 0.25 : 0) - auraMat.opacity) * Math.min(1, dt * 6);
    const auraColor = this.powerUp.type === 'speed' ? 0x2ecc71 : 0xffd97a;
    auraMat.color.setHex(auraColor);
    shieldMesh.rotation.y += dt * 1.5;
    ringMesh.rotation.z += dt * 3;
    auraMesh.rotation.y += dt * 4;
    auraMesh.scale.setScalar(1 + Math.sin(this.runTime * 2) * 0.1);

    // Running dust
    if (!this.isJumping && this.gameState === 'playing' && Math.random() < 0.3) {
      const dustGeo = new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 4, 3);
      const dustMat = new THREE.MeshBasicMaterial({
        color: ENVIRONMENTS[this.currentEnv].ground, transparent: true, opacity: 0.6,
      });
      const dust = new THREE.Mesh(dustGeo, dustMat);
      const legX = Math.random() < 0.5 ? -0.22 : 0.22;
      dust.position.set(this.player.position.x + legX, 0.1, this.player.position.z + 0.2);
      this.scene.add(dust);
      this.particles.push({
        mesh: dust,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 0.8,
          1 + Math.random() * 1.5
        ),
        life: 0.5, maxLife: 0.5
      });
    }
  }

  updateCollectiblesAndEnemies(dt: number, speed: number = this.stats.speed) {
    const playerPos = this.player.position;
    const live = this.gameState === 'playing';   // no pickups/damage on menu backdrop

    // Magnet range (the special ability vacuums everything too)
    const magnetRange = this.dash.active ? 14 : (this.powerUp.type === 'magnet' ? 8 + this.save.upgrades.magnet * 0.6 : 0);

    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const c = this.collectibles[i];
      c.position.z -= speed * dt;
      // rotate
      c.rotation.y += dt * 2;
      if ((c as any).rotSpeed) c.rotation.y += dt * (c as any).rotSpeed;
      const bobT = performance.now() * 0.004 + c.position.x;
      if (c.userData.type !== 'powerup') {
        c.position.y = 1.2 + Math.sin(bobT) * 0.1;
      } else {
        c.position.y = 1.5 + Math.sin(bobT) * 0.16;
        const g = (c as any).glow as THREE.Mesh | undefined;
        if (g) g.scale.setScalar(1 + Math.sin(bobT * 2.2) * 0.14);
      }
      if (c.userData.subtype === 'bossEnergy') {
        c.rotation.x += dt * 2.4;
        c.position.y = 1.3 + Math.sin(bobT * 2) * 0.25;
      }

      // Magnet
      if (magnetRange > 0 && c.userData.type === 'collectible') {
        const dx = playerPos.x - c.position.x;
        const dy = 1.2 - c.position.y;
        const dz = playerPos.z - c.position.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < magnetRange) {
          const pull = (1 - dist / magnetRange) * (this.dash.active ? 11 : 6);
          c.position.x += dx * pull * dt;
          c.position.z += dz * pull * dt;
          c.position.y += dy * pull * dt;
        }
      }

      // Collision check with player
      const dx = c.position.x - playerPos.x;
      const dz = c.position.z - playerPos.z;
      const dy = c.position.y - (this.playerY + 1);
      const dist = Math.sqrt(dx*dx + dz*dz + dy*dy);
      if (live && dist < 0.95 && !c.userData.collected) {
        this.collectItem(c);
        this.scene.remove(c);
        this.collectibles.splice(i, 1);
        continue;
      }

      if (c.position.z < -10) {
        // Missed a collectible - reset combo ONLY for normal pods? Actually no, missing should NOT break combo in a runner. Only hitting obstacles breaks combo.
        this.scene.remove(c);
        this.collectibles.splice(i, 1);
      }
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.position.z -= speed * dt;
      const coll = (o as any).collider as { width: number; height: number; y: number; requireJump?: boolean; isWater?: boolean };

      // Dynamic obstacle behaviors
      if (o.userData.subtype === 'rollingstone') {
        if (o.children[0]) o.children[0].rotation.x -= speed * dt * 2.6;
      } else if (o.userData.subtype === 'falling_branch' && !o.userData.fallen && o.position.z < 28) {
        o.position.y += (0.45 - o.position.y) * Math.min(1, dt * 12);
        if (o.position.y <= 0.48) {
          o.position.y = 0.45;
          o.userData.fallen = true;
          this.sound.treeCrack();
          this.screenShake = 0.22;
          this.spawnParticles(o.position.x, 0.45, o.position.z, 0x3d6b2d, 12, 0.12);
        }
      }

      // Collision
      const dx = o.position.x - playerPos.x;
      const dz = o.position.z - playerPos.z;
      const halfW = coll.width / 2 + 0.3;
      if (live && Math.abs(dz) < 0.9) {
        const inside = Math.abs(dx) < halfW;
        const requiresSlide = coll.y >= 1.0;
        const isWater = coll.isWater === true;
        const isSoft = coll.height < 0.2 && coll.y < 0.2 && !coll.requireJump && !isWater;

        if (inside && isWater && !o.userData.credit) {
          o.userData.credit = true;
          this.sound.splash();
          this.spawnParticles(this.player.position.x, 0.3, this.player.position.z, 0x7fe8f5, 14, 0.14);
          this.stats.score += Math.round(15 * this.stats.multiplier);
          this.popup('SPLASH ! +15', '#7fe8f5', false, new THREE.Vector3(this.player.position.x, 1.8, this.player.position.z));
        } else if (inside && !isSoft && !isWater) {
          const dodged = coll.requireJump ? (this.playerY >= 0.45) : (requiresSlide ? this.isSliding : this.playerY >= 0.4);
          if (!dodged) {
            this.takeDamage();
          } else if (!o.userData.credit) {
            o.userData.credit = true;
            this.stats.score += Math.round(45 * this.stats.multiplier);
            this.addDashCharge(0.04);
            this.spawnParticles(o.position.x, 1, o.position.z, 0x8ee8f5, 7, 0.1);
            const label = coll.requireJump ? 'SAUT DE GOUFFRE !' : (requiresSlide ? 'GLISSADE !' : 'SAUT PARFAIT !');
            this.popup(label, '#8ee8f5', false, new THREE.Vector3(o.position.x, 2.1, o.position.z));
          }
        } else if (!inside && Math.abs(dx) < NEAR_MISS_BAND && !o.userData.credit && this.stats.speed > 24 && !isWater) {
          o.userData.credit = true;
          this.nearMisses += 1;
          this.stats.score += Math.round(20 * this.stats.multiplier);
          this.addDashCharge(0.02);
          this.sound.whoosh();
          this.spawnParticles(o.position.x, 0.6, o.position.z, 0xf5e6c8, 5, 0.08);
          this.popup('FRÔLEMENT !', '#ffd97a', false, new THREE.Vector3(o.position.x, 1.9, o.position.z));
        }
      }
      if (o.position.z < -10) {
        this.scene.remove(o);
        this.obstacles.splice(i, 1);
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.position.z -= speed * dt;
      e.userData.bobPhase += dt * 3.5;
      const subtype = e.userData.subtype;
      if (subtype === 'giant_moth') {
        e.position.y = 1.35 + Math.sin(e.userData.bobPhase * 0.8) * 0.12;
        if ((e as any).leftWing && (e as any).rightWing) {
          const flap = Math.sin(e.userData.bobPhase * 3.2) * 0.55;
          (e as any).leftWing.rotation.y = flap;
          (e as any).rightWing.rotation.y = -flap;
        }
      } else if (subtype === 'crested_ibis') {
        e.position.y = 0.5 + Math.abs(Math.sin(e.userData.bobPhase * 1.5)) * 0.14;
      } else {
        e.position.y = Math.abs(Math.sin(e.userData.bobPhase)) * 0.1;
      }
      const coll = (e as any).collider;
      const dx = e.position.x - playerPos.x;
      const dz = e.position.z - playerPos.z;
      if (live && Math.abs(dz) < 0.85 && Math.abs(dx) < coll.width / 2 + 0.3) {
        const requiresSlide = coll.requiresSlide === true;
        const dodged = requiresSlide ? this.isSliding : (this.playerY >= 0.45);
        if (!dodged) {
          this.takeDamage();
        } else if (!e.userData.credit) {
          e.userData.credit = true;
          this.stats.score += Math.round(50 * this.stats.multiplier);
          this.addDashCharge(0.04);
          this.sound.whoosh();
          this.spawnParticles(e.position.x, e.position.y, e.position.z, 0xffd97a, 10, 0.12);
          this.popup(requiresSlide ? 'GLISSADE PARFAITE !' : 'ESQUIVE CRÉATURE !', '#ffd97a', false,
            new THREE.Vector3(e.position.x, 2.3, e.position.z));
        }
      }
      if (e.position.z < -10) {
        this.scene.remove(e);
        this.enemies.splice(i, 1);
      }
    }
  }

  collectItem(c: THREE.Object3D) {
    const data = c.userData;
    let points = data.points || 10;
    let isGoldenRush = this.powerUp.type === 'goldenRush';
    let isPowerUp = data.type === 'powerup';

    if (isPowerUp) {
      this.activatePowerUp(data.subtype);
      this.sound.powerup();
      this.spawnParticles(c.position.x, c.position.y, c.position.z, 0xffffff, 20, 0.15);
      return;
    }

    // Update combo
    this.stats.combo += 1;
    if (this.stats.combo > this.stats.maxCombo) this.stats.maxCombo = this.stats.combo;

    // Determine multiplier based on combo
    const [t1, t2, t3] = this.comboTiers;
    let newMult = 1;
    if (this.stats.combo >= t3) newMult = 5;
    else if (this.stats.combo >= t2) newMult = 3;
    else if (this.stats.combo >= t1) newMult = 2;
    if (newMult > this.stats.multiplier && newMult > 1) {
      this.stats.multiplier = newMult;
      this.sound.comboTier(newMult);
      this.haptic([14, 40, 18]);
      this.hitStop = 0.05;
      this.flash(0xffd97a, 0.24);
      this.popup(`COMBO x${newMult} !`, '#ffd97a', true,
        new THREE.Vector3(this.player.position.x, this.playerY + 3.1, this.player.position.z));
    }

    let collectType = data.subtype;
    if (isGoldenRush && (collectType === 'normal' || collectType === 'rare')) {
      collectType = 'golden';
      points = 100;
    }

    const speedBonus = this.powerUp.type === 'speed' ? 2 : 1;
    const dashBonus = this.dash.active ? 1.5 : 1;
    const finalPoints = Math.floor(points * this.stats.multiplier * speedBonus * dashBonus);
    this.stats.score += finalPoints;

    if (collectType === 'bossEnergy') {
      this.popup(`+${finalPoints}`, '#fff3cf', false, c.position);
      // Feeding the guardian's core calms it down
      this.sound.collectCrystal();
      this.spawnParticles(c.position.x, c.position.y, c.position.z, 0xffd97a, 16, 0.16);
      this.damageBoss(0.085);
      this.addDashCharge(0.05);
    } else if (collectType === 'golden') {
      this.stats.goldenVanilla += 1;
      this.sound.collectGolden();
      this.haptic(10);
      this.hitStop = Math.max(this.hitStop, 0.035);
      this.flash(0xffd97a, 0.16);
      this.spawnParticles(c.position.x, c.position.y, c.position.z, 0xffd97a, 20, 0.15);
      this.popup(`+${finalPoints}`, '#ffd97a', false, c.position);
      if (!this.dash.active) this.addDashCharge(0.04);
    } else if (collectType === 'flower') {
      this.popup(`FLEUR +${finalPoints}`, '#fff8e7', false, c.position);
      this.sound.collectFlower();
      this.spawnParticles(c.position.x, c.position.y, c.position.z, 0xfff8e7, 16, 0.12);
      this.addDashCharge(0.07);
    } else if (collectType === 'crystal') {
      this.sound.collectCrystal();
      this.spawnParticles(c.position.x, c.position.y, c.position.z, 0x9b59b6, 18, 0.14);
      const crystalBonus = this.save.outfit === 'mystic' ? 2 : 1;
      this.stats.score += Math.round(200 * this.stats.multiplier * crystalBonus);
      this.popup(this.save.outfit === 'mystic' ? 'CRISTAL x2 !' : `CRISTAL +${finalPoints}`, '#c99bff', true, c.position);
      this.addDashCharge(0.16);
      this.flash(0x9b59b6, 0.22);
    } else {
      this.sound.collect(this.stats.combo);
      this.spawnParticles(c.position.x, c.position.y, c.position.z, 0xf5e6c8, 8, 0.1);
      if (collectType === 'rare') this.popup(`RARE +${finalPoints}`, '#e8c39a', false, c.position);
      this.addDashCharge(0.019);
    }
    this.stats.vanilla += 1;
    this.onStatsUpdate({ ...this.stats });
  }

  activatePowerUp(type: PowerUpState['type']) {
    if (!type) return;
    this.powerUp.type = type;
    const durations: Record<string, number> = {
      magnet: 8 + this.save.upgrades.magnet * 2,
      goldenRush: 8, shield: 999, speed: 6, invincibility: 6, storm: 7,
    };
    this.powerUp.timeLeft = durations[type] || 0;
    if (type === 'shield') this.shieldCharges = Math.max(1, this.shieldCharges + 1);
    this.onPowerUpUpdate({ ...this.powerUp });
    const col = POWERUP_COLORS[type];
    this.spawnParticles(this.player.position.x, 1.5, this.player.position.z, col, 26, 0.17);
    this.flash(col, 0.28);
    this.screenShake = Math.max(this.screenShake, 0.22);
  }

  updatePowerUps(dt: number) {
    if (!this.powerUp.type) return;

    // Vanilla Storm lays down a swirling trail of collectible pods
    if (this.powerUp.type === 'storm') {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        this.stormTimer = 0.14;
        const lane = Math.floor(Math.random() * 3);
        this.spawnCollectible(LANE_X[lane], 50 + Math.random() * 22, Math.random() < 0.3 ? 'rare' : 'normal');
      }
    }

    if (this.powerUp.type !== 'shield') {
      this.powerUp.timeLeft -= dt;
      if (this.powerUp.timeLeft <= 0) {
        this.powerUp.type = null;
        this.powerUp.timeLeft = 0;
      }
    }
    this.onPowerUpUpdate({ ...this.powerUp });
  }

  switchEnvironment(idx: number) {
    this.currentEnv = ((idx % ENVIRONMENTS.length) + ENVIRONMENTS.length) % ENVIRONMENTS.length;
    const env = ENVIRONMENTS[this.currentEnv];
    this.maxEnvReached = Math.max(this.maxEnvReached, this.currentEnv);
    this.setupLighting(this.currentEnv);
    this.scene.background = new THREE.Color(env.sky);
    this.scene.fog = new THREE.Fog(env.fog, 30, 90);
    this.groundSegments.forEach(seg => {
      (seg.material as THREE.MeshStandardMaterial).color.setHex(env.ground);
    });
    // Re-dress the roadside with the new biome's props
    this.sideScenery.forEach(s => {
      s.children.slice().forEach(child => s.remove(child));
      for (const side of [-1, 1]) {
        const numItems = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < numItems; j++) {
          const obj = this.createEnvProp(env);
          obj.position.set(side * (8 + Math.random() * 8), 0, -8 + Math.random() * 16);
          obj.rotation.y = Math.random() * Math.PI * 2;
          obj.scale.setScalar(0.8 + Math.random() * 0.6);
          s.add(obj);
        }
      }
    });
    this.applyAtmosphere(this.currentEnv);
    if (!this.boss) this.sound.setLayer(this.musicLayerForEnv());
    this.onEnvironmentChange(env.name);
  }

  updateEnvironment(dt: number) {
    if (this.boss) return; // hold the biome steady during a guardian fight
    this.envTimer += dt;
    if (this.envTimer > 38) {
      this.envTimer = 0;
      const next = this.currentEnv + 1;
      this.switchEnvironment(next);
      const env = ENVIRONMENTS[this.currentEnv];
      this.flash(env.sky, 0.35);
      this.onToast({ id: Date.now(), kind: 'info', icon: '📍', title: env.name, subtitle: 'Nouvelle région' });
      // Reward for reaching a new region
      this.stats.score += 500;
      this.addDashCharge(0.25);
    }
  }

  updateParticles(dt: number, worldSpeed: number = 0) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y += GRAVITY * dt * 0.5;
      p.mesh.position.addScaledVector(p.velocity, dt);
      // Scroll with world
      p.mesh.position.z -= worldSpeed * dt;
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t);
      p.mesh.scale.setScalar(Math.max(0.1, t));
      if (p.life <= 0 || p.mesh.position.z < -15) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  updateWorldScroll(dt: number) {
    // Move ground segments TOWARD the player (decrease z)
    for (let i = this.groundSegments.length - 1; i >= 0; i--) {
      const g = this.groundSegments[i];
      g.position.z -= this.stats.speed * dt;
      if (g.position.z < -25) {
        // Recycle to front (most positive z + segment length)
        let maxZ = -Infinity;
        this.groundSegments.forEach(gg => maxZ = Math.max(maxZ, gg.position.z));
        g.position.z = maxZ + 20;
      }
    }
    for (let i = this.sideScenery.length - 1; i >= 0; i--) {
      const s = this.sideScenery[i];
      s.position.z -= this.stats.speed * dt;
      if (s.position.z < -25) {
        let maxZ = -Infinity;
        this.sideScenery.forEach(ss => maxZ = Math.max(maxZ, ss.position.z));
        s.position.z = maxZ + 20;
        // Randomize props
        s.children.forEach(child => s.remove(child));
        const env = ENVIRONMENTS[this.currentEnv];
        for (let side of [-1, 1]) {
          const numItems = 2 + Math.floor(Math.random() * 3);
          for (let j = 0; j < numItems; j++) {
            const obj = this.createEnvProp(env);
            obj.position.set(side * (8 + Math.random() * 8), 0, -8 + Math.random() * 16);
            obj.rotation.y = Math.random() * Math.PI * 2;
            obj.scale.setScalar(0.8 + Math.random() * 0.6);
            s.add(obj);
          }
        }
      }
    }
    // Spawn new waves ahead of the player (positive z)
    // Find the most positive (furthest ahead) z among existing dynamic objects
    let frontZ = -Infinity;
    this.collectibles.forEach(c => { if (c.position.z > frontZ) frontZ = c.position.z; });
    this.obstacles.forEach(o => { if (o.position.z > frontZ) frontZ = o.position.z; });
    this.enemies.forEach(e => { if (e.position.z > frontZ) frontZ = e.position.z; });
    if (!isFinite(frontZ)) frontZ = 0;
    // Wave spacing scales with speed so the time between hazards stays constant:
    // faster must mean harder, never unreadable.
    const stride = 10 + this.stats.speed * 0.38;
    while (frontZ < SPAWN_DISTANCE) {
      const nextZ = frontZ + stride;
      this.spawnWave(nextZ);
      frontZ = nextZ;
    }
  }

  // =========================================================
  // SPECIAL ABILITY — Élan de Vanille
  // =========================================================
  addDashCharge(amount: number) {
    if (this.dash.active) return;
    const bonus = (1 + this.save.upgrades.dash * 0.2) * (this.save.outfit === 'explorer' ? 1.1 : 1);
    const before = this.dash.ready;
    this.dash.charge = Math.min(1, this.dash.charge + amount * bonus);
    if (this.dash.charge >= 1) {
      this.dash.ready = true;
      if (!before) {
        this.sound.dashReady();
        this.onToast({ id: Date.now(), kind: 'info', icon: '💫', title: 'Élan prêt !', subtitle: 'Touchez l\'écran / Entrée' });
      }
    }
    this.onDashUpdate({ ...this.dash });
  }

  activateDash() {
    if (!this.dash.ready || this.dash.active) return;
    this.dash.ready = false;
    this.dash.active = true;
    this.dash.timeLeft = this.dashDuration;
    this.dash.charge = 0;
    this.sound.dash();
    this.haptic([18, 30, 18]);
    this.screenShake = 0.7;
    this.flash(0xffd97a, 0.55);
    // Burst of golden particles around the player
    this.spawnParticles(this.player.position.x, 1.2, this.player.position.z, 0xffd97a, 34, 0.2);
    this.spawnParticles(this.player.position.x, 1.8, this.player.position.z, 0xfff8e7, 22, 0.14);
    // Instantly vacuum every collectible in front of the player
    this.onDashUpdate({ ...this.dash });
  }

  updateDash(dt: number) {
    if (this.dash.active) {
      this.dash.timeLeft -= dt;
      // Trail of golden vanilla ahead of the runner (time-based, not per-frame)
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.26;
        const lane = Math.floor(Math.random() * 3);
        this.spawnCollectible(LANE_X[lane], 55 + Math.random() * 18, Math.random() < 0.25 ? 'golden' : 'rare');
      }
      if (this.dash.timeLeft <= 0) {
        this.dash.active = false;
        this.dash.timeLeft = 0;
        this.flash(0xfff8e7, 0.25);
      }
      this.onDashUpdate({ ...this.dash });
    }
  }

  flash(color: number, amount: number) {
    if (this.save.settings.reducedFlashes) amount = Math.min(0.08, amount * 0.18);
    this.flashColor = color;
    this.flashAmount = amount;
    this.onFlash(color, amount);
  }

  // =========================================================
  // BOSS ENCOUNTERS
  // =========================================================
  spawnBoss() {
    if (this.boss) return;
    const def = BOSSES[this.bossesBeaten % BOSSES.length];
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: def.color, roughness: 0.55, metalness: 0.2,
      emissive: def.accent, emissiveIntensity: 0.12,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: def.accent, emissive: def.accent, emissiveIntensity: 0.9, roughness: 0.25,
    });

    // Distinct 3D models for each of the 3 Madagascar Guardians
    const head = new THREE.Group();
    const eyes: THREE.Mesh[] = [];
    const arms: THREE.Object3D[] = [];
    let core: THREE.Mesh;

    if (def.id === 'forest') {
      // 1. LE GARDIEN DE LA FORÊT: Ancient moss-bark wood spirit with blooming vanilla orchids
      const torso = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 14), bodyMat);
      torso.position.y = 4.2;
      torso.scale.set(1.15, 1.25, 0.95);
      torso.castShadow = true;
      group.add(torso);

      // Vanilla vines wrapped around torso
      const vineMat = this.createMaterial(0x1e5026, 0.85);
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 20), vineMat);
        ring.rotation.x = Math.PI / 2.2 + (i - 2) * 0.15;
        ring.position.y = 3.4 + i * 0.6;
        group.add(ring);
      }

      // Blooming vanilla orchids on shoulders
      const petalMat = new THREE.MeshStandardMaterial({ color: 0xfffcf0, emissive: 0xfff3cf, emissiveIntensity: 0.35 });
      const flowerCenter = new THREE.MeshStandardMaterial({ color: 0xffd97a, emissive: 0xffaa00, emissiveIntensity: 0.6 });
      for (const side of [-1, 1]) {
        for (let j = 0; j < 5; j++) {
          const pt = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), petalMat);
          const pa = (j / 5) * Math.PI * 2;
          pt.position.set(side * 2.6 + Math.cos(pa) * 0.3, 5.6 + Math.sin(pa) * 0.25, 0.4);
          pt.scale.set(1.4, 0.4, 1);
          group.add(pt);
        }
        const fc = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), flowerCenter);
        fc.position.set(side * 2.6, 5.6, 0.5);
        group.add(fc);
      }

      // Wooden mask skull
      const skull = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), bodyMat);
      skull.castShadow = true;
      head.add(skull);
      // Branch antlers
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), glowMat);
        horn.position.set(Math.cos(a) * 1.0, 1.1, Math.sin(a) * 1.0);
        horn.rotation.z = -Math.cos(a) * 0.5;
        horn.rotation.x = Math.sin(a) * 0.5;
        head.add(horn);
      }
      for (const dx of [-0.55, 0.55]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), glowMat);
        eye.position.set(dx, 0.2, 1.3);
        head.add(eye);
        eyes.push(eye);
      }
      head.position.y = 7.2;
      group.add(head);

      // Branch arms
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.2, 4, 8), bodyMat);
        upper.position.y = -1.2;
        upper.castShadow = true;
        arm.add(upper);
        const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), bodyMat);
        fist.position.y = -2.7;
        fist.castShadow = true;
        arm.add(fist);
        arm.position.set(side * 3.1, 5.4, 0);
        arm.rotation.z = side * 0.25;
        group.add(arm);
        arms.push(arm);
      }
      core = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), glowMat);
      core.position.set(0, 4.4, 1.9);
      group.add(core);

    } else if (def.id === 'baobab') {
      // 2. LE COLOSSE BAOBAB: Gigantic monumental baobab trunk with reddish earth tones and boulder fists
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.4, 4.8, 16), bodyMat);
      torso.position.y = 4.2;
      torso.castShadow = true;
      group.add(torso);
      // Baobab root base
      for (let i = 0; i < 6; i++) {
        const ra = (i / 6) * Math.PI * 2;
        const root = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 6), bodyMat);
        root.position.set(Math.cos(ra) * 3.2, 1.4, Math.sin(ra) * 3.2);
        root.rotation.z = Math.cos(ra) * 0.45;
        root.rotation.x = Math.sin(ra) * 0.45;
        group.add(root);
      }

      // Wide crown skull
      const skull = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.4, 1.8, 12), bodyMat);
      skull.castShadow = true;
      head.add(skull);
      // Fiery sunset leaf canopy crown
      const leafMat = this.createMaterial(0xd9682b, 0.8);
      for (let i = 0; i < 7; i++) {
        const la = (i / 7) * Math.PI * 2;
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.7, 7, 6), leafMat);
        bush.position.set(Math.cos(la) * 1.6, 1.2, Math.sin(la) * 1.6);
        head.add(bush);
      }
      // Glowing solar eyes
      for (const dx of [-0.65, 0.65]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), glowMat);
        eye.position.set(dx, 0.1, 1.4);
        head.add(eye);
        eyes.push(eye);
      }
      head.position.y = 7.4;
      group.add(head);

      // Crushing boulder arms
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 2.5, 8), bodyMat);
        upper.position.y = -1.2;
        upper.castShadow = true;
        arm.add(upper);
        // Heavy clay stone fist
        const fistMat = this.createMaterial(0x5c2e0c, 0.9);
        const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), fistMat);
        fist.position.y = -2.9;
        fist.castShadow = true;
        arm.add(fist);
        arm.position.set(side * 3.6, 5.6, 0);
        arm.rotation.z = side * 0.3;
        group.add(arm);
        arms.push(arm);
      }
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), glowMat);
      core.position.set(0, 4.4, 2.3);
      group.add(core);

    } else {
      // 3. LA FOSSA DORÉE: Fast mythical feline beast of Madagascar with golden fur and twin whip-tails
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 3.2, 8, 12), bodyMat);
      torso.rotation.x = Math.PI / 2.3;
      torso.position.y = 4.2;
      torso.castShadow = true;
      group.add(torso);
      // Golden mane
      const maneMat = new THREE.MeshStandardMaterial({ color: 0xffd97a, emissive: 0xffaa00, emissiveIntensity: 0.45, roughness: 0.35 });
      for (let i = 0; i < 8; i++) {
        const ma = (i / 8) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 4), maneMat);
        spike.position.set(Math.cos(ma) * 1.5, 4.8 + Math.sin(ma) * 0.8, 1.2);
        spike.rotation.z = -Math.cos(ma) * 0.5;
        group.add(spike);
      }

      // Sleek feline skull
      const skull = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), bodyMat);
      skull.scale.set(1, 0.9, 1.4);
      skull.castShadow = true;
      head.add(skull);
      // Feline pointed ears
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.85, 4), maneMat);
        ear.position.set(side * 0.85, 0.9, 0.1);
        ear.rotation.z = side * -0.3;
        head.add(ear);
      }
      // Glowing ruby eyes
      const rubyMat = new THREE.MeshStandardMaterial({ color: 0xff1100, emissive: 0xff2200, emissiveIntensity: 1.2 });
      for (const dx of [-0.5, 0.5]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), rubyMat);
        eye.position.set(dx, 0.22, 1.25);
        head.add(eye);
        eyes.push(eye);
      }
      head.position.y = 6.8;
      group.add(head);

      // Prowling claw arms
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.2, 4, 8), bodyMat);
        upper.position.y = -1.2;
        upper.castShadow = true;
        arm.add(upper);
        // Golden claws
        const paw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.1), maneMat);
        paw.position.set(0, -2.5, 0.3);
        paw.castShadow = true;
        arm.add(paw);
        arm.position.set(side * 3.2, 5.2, 0.5);
        arm.rotation.z = side * 0.25;
        group.add(arm);
        arms.push(arm);
      }

      // Twin crystal tails
      for (const side of [-0.6, 0.6]) {
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.05, 3.2, 6), bodyMat);
        tail.position.set(side, 3.8, -2.2);
        tail.rotation.x = -Math.PI / 3;
        tail.rotation.z = side * 0.35;
        group.add(tail);
        // Crystal tip
        const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glowMat);
        tip.position.set(side * 1.8, 5.4, -3.2);
        group.add(tip);
      }

      core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), glowMat);
      core.position.set(0, 4.3, 1.8);
      group.add(core);
    }

    // Aura ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.16, 8, 32),
      new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    group.add(ring);
    (group as any).ring = ring;

    group.position.set(0, 0, 46);
    this.scene.add(group);

    this.boss = {
      group, def, timer: def.duration, attackTimer: 1.4,
      hp: 1, phase: 0, bob: 0,
      parts: { head, arms, eyes, core },
    };
    this.bossState = { active: true, name: def.name, timeLeft: def.duration, maxTime: def.duration, hp: 1, phase: 0 };
    this.onBossUpdate({ ...this.bossState });
    this.onToast({ id: Date.now(), kind: 'boss', icon: '⚠️', title: def.name, subtitle: def.subtitle });
    this.sound.bossAppear();
    this.sound.setLayer('boss');
    this.screenShake = 1.0;
    this.flash(def.accent, 0.4);
  }

  /** Telegraph first, strike second — a fair dodge game reads in under a second. */
  bossAttack() {
    if (!this.boss || this.pendingAttack) return;
    const lanes = [0, 1, 2];
    const attackCount = this.boss.phase >= 1 ? 2 : 1;
    const shuffled = lanes.slice().sort(() => Math.random() - 0.5).slice(0, attackCount);
    this.pendingAttack = { lanes: shuffled, high: Math.random() < 0.4, t: 0.85 };

    const ringMat = new THREE.MeshBasicMaterial({
      color: this.boss.def.accent, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
    });
    for (const lane of shuffled) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.35, 24), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(LANE_X[lane], 0.07, 46);
      this.scene.add(ring);
      this.telegraphs.push(ring);
    }
    this.boss.parts.arms.forEach(a => { a.rotation.x = -1.0; });
    this.sound.bossHit();
  }

  fireBossAttack(spawnZ: number) {
    if (!this.boss) return;
    const def = this.boss.def;
    const { lanes: shuffled, high: highAttack } = this.pendingAttack || { lanes: [0, 1], high: false };
    this.pendingAttack = null;

    for (const lane of shuffled) {
      const proj = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: def.accent, emissive: def.accent, emissiveIntensity: 0.8, roughness: 0.3,
      });
      if (highAttack) {
        // Horizontal sweeping vine — slide under it
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 8), mat);
        bar.rotation.z = Math.PI / 2;
        proj.add(bar);
        for (const dx of [-1, 1]) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 6), mat);
          leaf.position.set(dx * 1.3, 0, 0);
          leaf.rotation.z = dx * Math.PI / 2;
          proj.add(leaf);
        }
        proj.position.set(LANE_X[lane], 1.35, spawnZ);
        proj.userData = { kind: 'high' };
      } else {
        // Rolling boulder / seed pod — jump over it
        const ball = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 0), mat);
        proj.add(ball);
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(1.05, 10, 8),
          new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.22 })
        );
        proj.add(glow);
        proj.position.set(LANE_X[lane], 0.72, spawnZ);
        proj.userData = { kind: 'low' };
      }
      this.scene.add(proj);
      this.bossProjectiles.push(proj);
    }

    // Energy motes open up in a safe lane: the reward for reading the attack
    const safe = [0, 1, 2].filter(l => !shuffled.includes(l));
    if (safe.length) {
      const lane = safe[Math.floor(Math.random() * safe.length)];
      for (let i = 0; i < 3; i++) {
        this.spawnCollectible(LANE_X[lane], Math.max(20, spawnZ - 4) - i * 2.2, 'bossEnergy');
      }
    }
    this.screenShake = Math.max(this.screenShake, 0.2);
    this.flash(def.accent, 0.14);
  }

  damageBoss(amount: number) {
    if (!this.boss || this.gameState !== 'playing') return;
    this.boss.hp = Math.max(0, this.boss.hp - amount);
    this.bossState.hp = this.boss.hp;
    const newPhase = this.boss.hp < 0.4 ? 2 : this.boss.hp < 0.7 ? 1 : 0;
    if (newPhase !== this.boss.phase) {
      this.boss.phase = newPhase;
      this.bossState.phase = newPhase;
      this.flash(this.boss.def.accent, 0.3);
    }
    this.spawnParticles(this.boss.group.position.x, 4.4, this.boss.group.position.z - 1, this.boss.def.accent, 14, 0.18);
    this.onBossUpdate({ ...this.bossState });
    if (this.boss.hp <= 0) this.defeatBoss();
  }

  defeatBoss() {
    if (!this.boss) return;
    const def = this.boss.def;
    const bonus = Math.round(def.reward * this.stats.multiplier);
    this.stats.score += bonus;
    this.bossesBeaten += 1;
    this.sound.bossDefeated();
    this.haptic([30, 50, 30, 50, 90]);
    this.screenShake = 1.2;
    this.flash(0xffd97a, 0.7);
    // Explosion of golden vanilla
    for (let i = 0; i < 4; i++) {
      this.spawnParticles(
        this.boss.group.position.x + (Math.random() - 0.5) * 4,
        2 + Math.random() * 6,
        this.boss.group.position.z,
        i % 2 ? 0xffd97a : def.accent, 18, 0.22
      );
    }
    // Shower of golden pods as loot
    for (let i = 0; i < 9; i++) {
      this.spawnCollectible(LANE_X[i % 3], 34 + Math.floor(i / 3) * 3, 'golden');
    }
    this.onToast({ id: Date.now(), kind: 'boss', icon: '🏆', title: `${def.name} apaisé !`, subtitle: `+${bonus.toLocaleString()} points` });
    this.clearBoss();
    this.nextBossAt = this.stats.distance + 1100 + this.bossesBeaten * 350;
    this.sound.setLayer(this.musicLayerForEnv());
    this.addDashCharge(0.5);
  }

  clearBoss() {
    if (this.boss) {
      this.scene.remove(this.boss.group);
      this.boss = null;
    }
    this.pendingAttack = null;
    this.telegraphs.forEach(r => this.scene.remove(r));
    this.telegraphs = [];
    this.bossProjectiles.forEach(p => this.scene.remove(p));
    this.bossProjectiles = [];
    this.bossState = { active: false, name: '', timeLeft: 0, maxTime: 0, hp: 1, phase: 0 };
    this.onBossUpdate({ ...this.bossState });
  }

  updateBoss(dt: number, speed: number) {
    if (!this.boss) {
      // Trigger condition
      if (this.gameState === 'playing' && this.stats.distance >= this.nextBossAt) {
        // Clear the road ahead so the encounter reads cleanly
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
          if (this.obstacles[i].position.z > 8) {
            this.scene.remove(this.obstacles[i]);
            this.obstacles.splice(i, 1);
          }
        }
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          if (this.enemies[i].position.z > 8) {
            this.scene.remove(this.enemies[i]);
            this.enemies.splice(i, 1);
          }
        }
        this.spawnBoss();
      }
      return;
    }
    const b = this.boss;
    b.bob += dt * 2;
    b.timer -= dt;

    // Hover just ahead of the player, weaving side to side
    const targetZ = 34 + Math.sin(b.bob * 0.6) * 4;
    b.group.position.z += (targetZ - b.group.position.z) * Math.min(1, dt * 2);
    const sway = Math.sin(b.bob * 0.85) * (1.2 + b.phase * 0.7);
    b.group.position.x += (sway - b.group.position.x) * Math.min(1, dt * 3);
    b.group.position.y = Math.sin(b.bob * 1.6) * 0.35;
    b.parts.head.rotation.y = Math.sin(b.bob * 0.7) * 0.35;
    b.parts.head.position.y = 7.2 + Math.sin(b.bob * 2.2) * 0.2;
    b.parts.core.rotation.y += dt * 2.5;
    b.parts.core.rotation.x += dt * 1.4;
    b.parts.core.scale.setScalar(1 + Math.sin(b.bob * 4) * 0.12);
    b.parts.arms.forEach((a, i) => {
      a.rotation.x += (0 - a.rotation.x) * Math.min(1, dt * 4);
      a.rotation.z = (i === 0 ? -1 : 1) * (0.25 + Math.sin(b.bob * 1.3 + i) * 0.15);
    });
    const ring = (b.group as any).ring as THREE.Mesh;
    if (ring) {
      ring.rotation.z += dt * 1.2;
      ring.scale.setScalar(1 + Math.sin(b.bob * 3) * 0.08);
    }
    b.parts.eyes.forEach(e => {
      (e.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + Math.sin(b.bob * 6) * 0.35;
    });

    // Attacks (telegraph rings pulse on the ground, then the strike lands)
    b.attackTimer -= dt;
    const interval = b.def.attackInterval * (1 - b.phase * 0.14);
    if (b.attackTimer <= 0) {
      b.attackTimer = interval;
      this.bossAttack();
    }
    if (this.pendingAttack) {
      this.pendingAttack.t -= dt;
      let nearest = 46;
      for (let i = this.telegraphs.length - 1; i >= 0; i--) {
        const r = this.telegraphs[i];
        r.position.z -= speed * dt;
        const k = Math.max(0, this.pendingAttack.t / 0.85);
        r.scale.setScalar(0.55 + (1 - k) * 0.9);
        (r.material as THREE.MeshBasicMaterial).opacity = 0.25 + (1 - k) * 0.6;
        nearest = Math.min(nearest, r.position.z);
        if (r.position.z < -6) { this.scene.remove(r); this.telegraphs.splice(i, 1); }
      }
      if (this.pendingAttack.t <= 0) {
        this.telegraphs.forEach(r => this.scene.remove(r));
        this.telegraphs = [];
        this.fireBossAttack(Math.max(22, Math.min(46, nearest)));
      }
    }

    // Projectiles move toward the player
    for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
      // takeDamage()/defeatBoss() can clear this array mid-iteration
      if (!this.boss) return;
      const p = this.bossProjectiles[i];
      if (!p) continue;
      p.position.z -= (speed + 6) * dt;
      p.rotation.x -= dt * 6;
      const dx = p.position.x - this.player.position.x;
      const dz = p.position.z - this.player.position.z;
      if (Math.abs(dz) < 0.9 && Math.abs(dx) < 1.25) {
        const high = p.userData.kind === 'high';
        const dodged = high ? this.isSliding : this.playerY > 0.9;
        if (!dodged) {
          this.takeDamage();
        } else {
          this.stats.score += Math.round(60 * this.stats.multiplier);
          this.spawnParticles(p.position.x, p.position.y, p.position.z, b.def.accent, 8, 0.1);
          this.addDashCharge(0.05);
        }
        this.scene.remove(p);
        this.bossProjectiles.splice(i, 1);
        continue;
      }
      if (p.position.z < -10) {
        this.scene.remove(p);
        this.bossProjectiles.splice(i, 1);
      }
    }

    if (!this.boss) return;

    // Timeout — the guardian retreats (still counts as survived)
    this.bossState.timeLeft = Math.max(0, b.timer);
    if (b.timer <= 0) {
      this.damageBoss(1);
      return;
    }
    this.onBossUpdate({ ...this.bossState });
  }

  musicLayerForEnv(): 'plantation' | 'forest' | 'baobab' | 'mountain' | 'coast' | 'mystery' {
    return (['plantation', 'forest', 'baobab', 'mountain', 'coast', 'mystery'] as const)[this.currentEnv] || 'plantation';
  }

  // =========================================================
  // PROGRESSION
  // =========================================================
  applyOutfit(id: string) {
    const outfit = OUTFITS.find(o => o.id === id) || OUTFITS[0];
    const p = this.playerParts;
    if (!p.body) return;
    (p.body.material as THREE.MeshStandardMaterial).color.setHex(outfit.colors.shirt);
    (p.head.material as THREE.MeshStandardMaterial).color.setHex(outfit.colors.skin);
    (p.leftArm.material as THREE.MeshStandardMaterial).color.setHex(outfit.colors.skin);
    (p.leftLeg.material as THREE.MeshStandardMaterial).color.setHex(outfit.colors.pants);
    (p.hat.material as THREE.MeshStandardMaterial).color.setHex(outfit.colors.hat);
    (p.basket.material as THREE.MeshStandardMaterial).color.setHex(outfit.colors.basket);
  }

  persist() {
    writeSave(this.save);
    this.onSaveUpdate({ ...this.save });
  }

  /** Daily + weekly rollovers. Called on boot and before every run is banked. */
  refreshDaily() {
    const key = todayKey();
    if (this.save.dailyDate !== key) {
      this.save.dailyDate = key;
      this.save.dailyVanilla = 0;
      this.save.dailyRuns = 0;
      if (this.save.challengeDate !== key) {
        this.save.challengeDate = key;
        this.save.challengeDone = false;
        this.save.challengeClaimed = false;
      }
    }
    const wk = weekKeyOf();
    if (this.save.weekKey !== wk) {
      this.save.weekKey = wk;
      this.save.weeklyDistance = 0;
      this.save.weekGolden = 0;
      // Weekly / daily missions become claimable again; lifetime ones stay claimed
      this.save.claimedMissions = this.save.claimedMissions.filter(id =>
        MISSIONS.find(m => m.id === id)?.cadence === 'total');
    }
    if (this.save.streak > 0 && this.save.lastDaily !== key && this.save.lastDaily !== yesterdayKey()) {
      this.save.streak = 0;      // missed a day — the chain resets
    }
  }

  // ---------------- claimable rewards ----------------
  claimMission(id: string): boolean {
    const def = MISSIONS.find(m => m.id === id);
    if (!def || this.save.claimedMissions.includes(id)) return false;
    if (def.progress(this.save) < def.goal) return false;
    this.save.coins += def.reward;
    this.save.claimedMissions.push(id);
    this.stats.coins = this.save.coins;
    this.sound.purchase();
    this.persist();
    this.onToast({ id: Date.now(), kind: 'achievement', icon: def.icon, title: 'Mission accomplie', subtitle: `${def.label} · +${def.reward} 🪙` });
    return true;
  }

  get dailyReady() { return this.save.lastDaily !== todayKey(); }
  get dailyRewardAmount() { return dailyRewardFor(this.save.streak + 1); }

  claimDaily(): boolean {
    if (!this.dailyReady) return false;
    this.save.streak = Math.min(7, this.save.lastDaily === yesterdayKey() ? this.save.streak + 1 : 1);
    this.save.lastDaily = todayKey();
    const amount = dailyRewardFor(this.save.streak);
    this.save.coins += amount;
    this.stats.coins = this.save.coins;
    this.sound.purchase();
    this.persist();
    this.onToast({ id: Date.now(), kind: 'achievement', icon: '🎁', title: `Coffret du jour — jour ${this.save.streak}`, subtitle: `+${amount} 🪙` });
    return true;
  }

  claimChallenge(): boolean {
    const ch = challengeForToday();
    if (!this.save.challengeDone || this.save.challengeClaimed) return false;
    this.save.challengeClaimed = true;
    this.save.coins += ch.reward;
    this.stats.coins = this.save.coins;
    this.sound.newRecord();
    this.persist();
    this.onToast({ id: Date.now(), kind: 'achievement', icon: ch.icon, title: 'Défi du jour réussi !', subtitle: `+${ch.reward} 🪙` });
    return true;
  }

  get challenge() { return challengeForToday(); }

  // ---------------- shared runs / rivals ----------------
  setPlayerName(name: string) {
    this.save.playerName = (name || '').trim().slice(0, 18);
    this.persist();
  }

  get playerName() {
    return this.save.playerName || 'Récolteur';
  }

  /**
   * Import a run a friend shared. Duplicates (same name + score + date)
   * are ignored so re-opening a link never stacks entries.
   */
  importRival(code: string): { ok: boolean; name?: string; score?: number; reason?: string } {
    const run = decodeRun(code);
    if (!run) return { ok: false, reason: 'invalid' };
    if (!run.s && !run.d) return { ok: false, reason: 'empty' };

    const dupe = this.save.rivals.some(r =>
      r.name === run.n && r.score === run.s && r.date === run.t);
    if (dupe) return { ok: false, reason: 'duplicate', name: run.n, score: run.s };

    this.save.rivals.push({
      name: run.n,
      score: run.s,
      vanilla: run.v,
      golden: run.g,
      distance: run.d,
      combo: run.c,
      multiplier: run.m,
      bosses: run.b,
      envReached: run.e,
      noHit: run.f,
      date: run.t,
    });
    // Keep the list tidy — the top 20 rivals are plenty for a friendly board.
    this.save.rivals.sort((a, b) => b.score - a.score);
    this.save.rivals = this.save.rivals.slice(0, 20);
    this.persist();
    this.onToast({
      id: Date.now(), kind: 'achievement', icon: '🤝',
      title: `${run.n} ajouté aux rivaux`,
      subtitle: `${run.s.toLocaleString('fr-FR')} points à battre`,
    });
    return { ok: true, name: run.n, score: run.s };
  }

  clearRivals() {
    this.save.rivals = [];
    this.persist();
  }

  /** Combined board: your local scores racing against imported rivals. */
  get combinedBoard(): Array<{
    who: 'you' | 'rival'; name: string; score: number; vanilla: number;
    golden: number; distance: number; date: number;
  }> {
    const mine = this.save.scores.map(s => ({
      who: 'you' as const,
      name: this.playerName,
      score: s.score, vanilla: s.vanilla, golden: s.golden,
      distance: s.distance, date: s.date,
    }));
    const theirs = this.save.rivals.map(r => ({
      who: 'rival' as const,
      name: r.name,
      score: r.score, vanilla: r.vanilla, golden: r.golden,
      distance: r.distance, date: r.date,
    }));
    return [...mine, ...theirs].sort((a, b) => b.score - a.score).slice(0, 25);
  }

  /** Where the player currently stands on that combined board (1-based). */
  get playerRank(): number {
    const board = this.combinedBoard;
    const first = board.findIndex(e => e.who === 'you');
    return first < 0 ? board.length + 1 : first + 1;
  }

  recordRun() {
    const s = this.save;
    this.refreshDaily();

    const run: RunSummary = {
      score: this.stats.score,
      vanilla: this.stats.vanilla,
      golden: this.stats.goldenVanilla,
      distance: Math.floor(this.stats.distance),
      maxCombo: this.stats.maxCombo,
      multiplier: this.stats.multiplier,
      bossesBeaten: this.bossesBeaten,
      noHit: !this.everHit,
      envReached: this.maxEnvReached,
      nearMisses: this.nearMisses,
    };

    const ch = challengeForToday();
    let challengeDone = this.save.challengeDone;
    const chVal =
      ch.id === 'golden' ? run.golden :
      ch.id === 'combo' ? run.maxCombo :
      ch.id === 'distance' ? run.distance :
      ch.id === 'guard' ? (run.noHit ? run.distance : 0) :
      ch.id === 'boss' ? run.bossesBeaten :
      Math.round(this.maxSpeedSeen);
    if (!challengeDone && chVal >= ch.goal) challengeDone = true;

    const isRecord = run.score > s.bestScore;
    if (isRecord) s.bestScore = run.score;

    s.scores.push({ score: run.score, vanilla: run.vanilla, golden: run.golden, distance: run.distance, date: Date.now() });
    s.scores.sort((a, b) => b.score - a.score);
    s.scores = s.scores.slice(0, 10);

    s.totalRuns += 1;
    s.totalVanilla += run.vanilla;
    s.totalGolden += run.golden;
    s.totalDistance += run.distance;
    s.totalBosses += run.bossesBeaten;
    s.bestDistance = Math.max(s.bestDistance, run.distance);
    if (run.noHit && run.distance >= 400) s.perfectRuns += 1;
    if (challengeDone) s.challengeDone = true;
    s.bestCombo = Math.max(s.bestCombo, run.maxCombo);
    s.envReached = Math.max(s.envReached, run.envReached);
    s.dailyVanilla += run.vanilla;
    s.dailyRuns += 1;
    s.weeklyDistance += run.distance;
    s.weekGolden += run.golden;

    // Coins — skim rewards and a clean run both pay
    const coinMult = 1 + s.upgrades.coinBonus * 0.25;
    const coinsEarned = Math.round((run.vanilla * 1.5 + run.golden * 12 + run.distance / 60
      + this.bossesBeaten * 150 + run.nearMisses * 2 + (run.noHit && run.distance > 400 ? 120 : 0)) * coinMult);

    const prevLevel = levelFromXp(s.xp);
    const xpGain = Math.round(run.score / 10) + run.golden * 30 + run.bossesBeaten * 150;
    s.xp += xpGain;
    const newLevel = levelFromXp(s.xp);
    s.coins += coinsEarned;
    this.stats.coins = s.coins;
    this.stats.bestScore = s.bestScore;

    // Achievements
    const unlocked: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (s.achievements.includes(a.id)) continue;
      if (a.check(s, run)) {
        s.achievements.push(a.id);
        s.coins += a.reward;
        unlocked.push(a.id);
      }
    }
    this.stats.coins = s.coins;

    this.persist();
    this.onRunComplete({ ...run, coinsEarned, isRecord, xpGain, levelUp: newLevel > prevLevel, newLevel, challengeDone });

    if (isRecord && run.score > 0) this.sound.newRecord();

    // Queue achievement toasts
    unlocked.forEach((id, i) => {
      const def = ACHIEVEMENTS.find(a => a.id === id)!;
      setTimeout(() => {
        this.sound.achievement();
        this.onToast({ id: Date.now() + i, kind: 'achievement', icon: def.icon, title: def.name, subtitle: `+${def.reward} 🪙` });
      }, 700 + i * 1300);
    });
  }

  updateCamera(dt: number) {
    // Camera follows with slight shake
    const shakeScale = this.save.settings.reducedMotion ? 0 : 1;
    const shakeX = (Math.random() - 0.5) * this.screenShake * 0.3 * shakeScale;
    const shakeY = (Math.random() - 0.5) * this.screenShake * 0.3 * shakeScale;
    this.screenShake = Math.max(0, this.screenShake - dt * 2);

    const targetCamY = this.isSliding ? 4.8 : 5.5;
    const targetCamZ = this.isJumping ? -8.5 : -9;
    this.camera.position.y += (targetCamY + shakeY - this.camera.position.y) * Math.min(1, dt * 5);
    this.camera.position.x += (shakeX - this.camera.position.x) * Math.min(1, dt * 8);
    this.camera.position.z += (targetCamZ - this.camera.position.z) * Math.min(1, dt * 5);

    // FOV zoom for speed boost / invincibility
    const targetFov = this.save.settings.reducedMotion ? 60
      : this.powerUp.type === 'speed' ? 72 : this.powerUp.type === 'invincibility' ? 68 : 60;
    (this.camera as THREE.PerspectiveCamera).fov += (targetFov - (this.camera as THREE.PerspectiveCamera).fov) * Math.min(1, dt * 4);
    (this.camera as THREE.PerspectiveCamera).updateProjectionMatrix();

    const lookY = this.isSliding ? 1.2 : 2;
    this.camera.lookAt(this.player.position.x * 0.3, lookY, 10);
  }

  loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, this.getDelta());
    let dt = rawDt;

    // Decay the screen-flash value regardless of state
    this.flashAmount = Math.max(0, this.flashAmount - rawDt * 2.2);

    // Hit-stop: a couple of frozen frames on a big event. Cheap, extremely effective.
    if (this.hitStop > 0 && !this.save.settings.reducedMotion) {
      this.hitStop = Math.max(0, this.hitStop - rawDt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.save.settings.reducedMotion) this.hitStop = 0;

    // Death plays in slow motion before the results card lands
    const dying = this.gameState === 'dying';
    if (dying) {
      dt = rawDt * 0.24;
      this.deathTimer -= rawDt;
      this.player.rotation.z += (0.85 - this.player.rotation.z) * Math.min(1, rawDt * 6);
      this.player.rotation.x += (-0.45 - this.player.rotation.x) * Math.min(1, rawDt * 6);
      if (this.deathTimer <= 0) this.finalizeDeath();
    }

    if (this.gameState === 'playing' || (dying && this.deathTimer > 0)) {
      // Speed: base ramp + power-up + special ability
      const baseTargetSpeed = Math.min(MAX_SPEED, BASE_SPEED + this.stats.distance * 0.0062);
      let mult = 1;
      if (this.powerUp.type === 'speed') mult *= 1.6;
      if (this.dash.active) mult *= 1.45;
      if (this.boss) mult *= 0.92; // slight slow-down so boss patterns stay readable
      const targetSpeed = baseTargetSpeed * mult;
      this.stats.speed += (targetSpeed - this.stats.speed) * Math.min(1, dt * 4);
      const effectiveSpeed = this.stats.speed;

      this.stats.distance += effectiveSpeed * dt;
      this.updatePlayer(dt);
      this.updateWorldScroll(dt);
      this.updateCollectiblesAndEnemies(dt, effectiveSpeed);
      this.updateBoss(dt, effectiveSpeed);
      this.updateDash(dt);
      this.updateParticles(dt, effectiveSpeed);
      this.updatePowerUps(dt);
      this.updateEnvironment(dt);
      this.updateAtmosphere(dt, effectiveSpeed);
      if (this.stats.speed > this.maxSpeedSeen) this.maxSpeedSeen = this.stats.speed;
      if (this.invulnAfterRevive > 0) {
        this.invulnAfterRevive = Math.max(0, this.invulnAfterRevive - dt);
        if (this.invulnAfterRevive <= 0) { this.isInvincibleHit = false; this.player.visible = true; }
      }

      const scoreMult = (this.powerUp.type === 'speed' ? 2 : 1) * (this.dash.active ? 1.5 : 1);
      if (this.gameState === 'playing') {
        this.stats.score += Math.floor(dt * effectiveSpeed * this.stats.multiplier * scoreMult);
      }
      this.updateCamera(dt);
      this.onStatsUpdate({ ...this.stats });
    } else {
      // Menu / pause / game-over idle
      if (this.gameState === 'menu' || this.gameState === 'intro') {
        this.runTime += dt * 4;
        const p = this.playerParts;
        const idleAmount = this.showroomActive ? 0.08 : 0.2;
        p.leftLeg.rotation.x = Math.sin(this.runTime) * idleAmount;
        p.rightLeg.rotation.x = -Math.sin(this.runTime) * idleAmount;
        p.leftArm.rotation.x = -Math.sin(this.runTime) * idleAmount;
        p.rightArm.rotation.x = Math.sin(this.runTime) * idleAmount;
        p.head.rotation.y = this.showroomActive ? 0 : Math.sin(this.runTime * 0.5) * 0.35;
        p.head.position.y = 1.95 + Math.sin(this.runTime * 1.2) * 0.03;
        if (this.showroomActive) {
          this.showroomAngle += dt * (this.save.settings.reducedMotion ? 0.12 : 0.42);
          this.player.rotation.y += (this.showroomAngle - this.player.rotation.y) * Math.min(1, dt * 5);
          this.showroom.rotation.y -= dt * 0.12;
          const ring = this.showroom.children[1];
          if (ring) ring.rotation.z += dt * 0.35;
        }
        // Slow world drift so the menu backdrop feels alive
        this.updateWorldScroll(dt * 0.18);
        this.updateCollectiblesAndEnemies(dt * 0.18, this.stats.speed * 0.18);
        this.updateParticles(dt, 0);
        // Occasional sparkle in the plantation
        if (Math.random() < 0.06) {
          this.spawnParticles(
            (Math.random() - 0.5) * 12, 1 + Math.random() * 3, 8 + Math.random() * 20,
            0xffd97a, 2, 0.07
          );
        }
      } else if (this.gameState === 'gameover') {
        // Slump the character forward
        const p = this.playerParts;
        p.leftArm.rotation.x += (0.9 - p.leftArm.rotation.x) * Math.min(1, dt * 4);
        p.rightArm.rotation.x += (0.9 - p.rightArm.rotation.x) * Math.min(1, dt * 4);
        this.player.rotation.x += (-0.25 - this.player.rotation.x) * Math.min(1, dt * 3);
        this.updateParticles(dt, 0);
        this.updateAtmosphere(dt * 0.2, this.stats.speed * 0.18);
      }
      this.updateCamera(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (!this.rafId) this.loop();
  }

  destroy() {
    this.sound.stopMusic();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
