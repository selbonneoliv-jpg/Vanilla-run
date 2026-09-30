// ============================================================
// VANISKARA — Save / Progression system (localStorage)
// ============================================================

export interface ScoreEntry {
  score: number;
  vanilla: number;
  golden: number;
  distance: number;
  date: number;
}

export interface Upgrades {
  magnet: number;      // 0-5 : magnet duration
  shield: number;      // 0-3 : start run with shield charges
  dash: number;        // 0-5 : special ability charge speed
  coinBonus: number;   // 0-5 : coins earned multiplier
  headStart: number;   // 0-3 : begin the run further along
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  quality: 'low' | 'high';
  haptics: boolean;
  reducedMotion: boolean;
  reducedFlashes: boolean;
  highContrast: boolean;
  largeText: boolean;
}

export interface SaveData {
  bestScore: number;
  scores: ScoreEntry[];
  coins: number;
  xp: number;
  totalVanilla: number;
  totalGolden: number;
  totalDistance: number;
  totalRuns: number;
  bestCombo: number;
  totalBosses: number;
  perfectRuns: number;
  achievements: string[];
  upgrades: Upgrades;
  settings: Settings;
  outfit: string;
  outfits: string[];
  seenIntro: boolean;
  envReached: number;
  dailyDate: string;
  dailyVanilla: number;
  dailyRuns: number;
  weeklyDistance: number;
  weekGolden: number;
  // --- retention layer ---
  streak: number;
  lastDaily: string;
  claimedMissions: string[];
  weekKey: string;
  challengeDate: string;
  challengeDone: boolean;
  challengeClaimed: boolean;
  bestDistance: number;
  reviveCount: number;
  /** First-run gesture tutorial has been shown. */
  seenTutorial: boolean;
  /** How many times the on-screen sound toggle was flipped (sanity check). */
  totalPlaytime: number;
  // --- shared runs imported from friends' links ---
  playerName: string;
  rivals: RivalEntry[];
}

/** A run someone shared with you, kept separate from your own scores. */
export interface RivalEntry {
  name: string;
  score: number;
  vanilla: number;
  golden: number;
  distance: number;
  combo: number;
  multiplier: number;
  bosses: number;
  envReached: number;
  noHit: boolean;
  date: number;
}

const KEY = 'vaniskara_save_v3';

export const DEFAULT_SAVE: SaveData = {
  bestScore: 0,
  scores: [],
  coins: 0,
  xp: 0,
  totalVanilla: 0,
  totalGolden: 0,
  totalDistance: 0,
  totalRuns: 0,
  bestCombo: 0,
  totalBosses: 0,
  perfectRuns: 0,
  achievements: [],
  upgrades: { magnet: 0, shield: 0, dash: 0, coinBonus: 0, headStart: 0 },
  settings: {
    sfx: true,
    music: true,
    quality: 'high',
    haptics: true,
    reducedMotion: false,
    reducedFlashes: false,
    highContrast: false,
    largeText: false,
  },
  outfit: 'classic',
  outfits: ['classic'],
  seenIntro: false,
  envReached: 0,
  dailyDate: '',
  dailyVanilla: 0,
  dailyRuns: 0,
  weeklyDistance: 0,
    weekGolden: 0,
  streak: 0,
  lastDaily: '',
  claimedMissions: [],
  weekKey: '',
  challengeDate: '',
  challengeDone: false,
  challengeClaimed: false,
  bestDistance: 0,
  reviveCount: 0,
  seenTutorial: false,
  totalPlaytime: 0,
  playerName: '',
  rivals: [],
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) || {};
    return {
      ...freshSave(),
      ...parsed,
      upgrades: { ...DEFAULT_SAVE.upgrades, ...(parsed.upgrades || {}) },
      settings: { ...DEFAULT_SAVE.settings, ...(parsed.settings || {}) },
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
      claimedMissions: Array.isArray(parsed.claimedMissions) ? parsed.claimedMissions : [],
      outfits: Array.isArray(parsed.outfits) && parsed.outfits.length ? parsed.outfits : ['classic'],
    };
  } catch {
    return freshSave();
  }
}

function freshSave(): SaveData {
  return {
    ...DEFAULT_SAVE,
    upgrades: { ...DEFAULT_SAVE.upgrades },
    settings: { ...DEFAULT_SAVE.settings },
    scores: [], achievements: [], claimedMissions: [], outfits: ['classic'],
  };
}

export function writeSave(data: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

// ---------- Ranks / XP ----------
export interface Rank { level: number; name: string; icon: string; color: string }

export const RANKS: Rank[] = [
  { level: 1, name: 'Apprenti Récolteur', icon: '🌱', color: '#9ec96f' },
  { level: 3, name: 'Cueilleur Matinal', icon: '🧺', color: '#cfe07a' },
  { level: 5, name: 'Gardien de Treille', icon: '🌿', color: '#7bd45a' },
  { level: 8, name: 'Négociant de Sava', icon: '⚖️', color: '#ffd97a' },
  { level: 11, name: 'Maître Séchoir', icon: '☀️', color: '#ffb340' },
  { level: 15, name: 'Explorateur Malgache', icon: '🧭', color: '#ff9500' },
  { level: 20, name: 'Sentinelle des Baobabs', icon: '🌳', color: '#ff7a3c' },
  { level: 26, name: 'Gardien de la Vanille', icon: '👑', color: '#fff3cf' },
  { level: 34, name: 'Légende de l\'Île', icon: '🏝️', color: '#8ee8f5' },
  { level: 45, name: 'Esprit de Vaniskara', icon: '✨', color: '#e8b6ff' },
];

export function xpForLevel(level: number) {
  return Math.round(240 * Math.pow(level, 1.42));
}
/** Cumulative XP needed to REACH a level. */
export function xpToReach(level: number) {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}
export function levelFromXp(xp: number) {
  let level = 1;
  while (xpToReach(level + 1) <= xp && level < 99) level++;
  return level;
}
export function rankFor(level: number): Rank {
  let r = RANKS[0];
  for (const c of RANKS) if (level >= c.level) r = c;
  return r;
}
export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const floor = xpToReach(level);
  const ceil = xpToReach(level + 1);
  return {
    level,
    into: xp - floor,
    need: ceil - floor,
    pct: Math.max(0, Math.min(100, ((xp - floor) / Math.max(1, ceil - floor)) * 100)),
    rank: rankFor(level),
  };
}

// ---------- Outfits / characters ----------
export interface OutfitDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  price: number;
  perk: string;
  colors: { shirt: number; pants: number; hat: number; skin: number; basket: number };
}

export const OUTFITS: OutfitDef[] = [
  { id: 'classic', name: 'Vani, Récolteuse', desc: 'Tenue de récolte traditionnelle', icon: '🧑‍🌾', price: 0, perk: 'Tenue de départ', colors: { shirt: 0xe8a050, pants: 0x6b4d2b, hat: 0xd4a050, skin: 0xf4c38a, basket: 0x8b5a2b } },
  { id: 'farmer', name: 'Maître Planteur', desc: 'Lin écru des grandes plantations', icon: '👨‍🌾', price: 400, perk: '+5 % de gousses dorées au sol', colors: { shirt: 0xf5e6c8, pants: 0x5d3a1a, hat: 0xe8d4a8, skin: 0xd9a066, basket: 0x6b4020 } },
  { id: 'explorer', name: 'Explorateur Baobab', desc: 'Pour les vallées de terre rouge', icon: '🧭', price: 900, perk: 'Élan chargé 10 % plus vite', colors: { shirt: 0x8b4513, pants: 0x4a3f35, hat: 0xc46a00, skin: 0xf4c38a, basket: 0x5c2e0c } },
  { id: 'ocean', name: 'Pêcheur de la Côte', desc: 'Bleu turquoise de l\'océan Indien', icon: '🌊', price: 1500, perk: 'Course plus fluide dans les virages', colors: { shirt: 0x4ec5d9, pants: 0x228b8b, hat: 0xf4e4bc, skin: 0xd9a066, basket: 0x8b5a2b } },
  { id: 'guardian', name: 'Gardien de la Vanille', desc: 'Costume cérémoniel doré', icon: '✨', price: 3000, perk: 'Bouclier offert à chaque course', colors: { shirt: 0xffd97a, pants: 0x5c2e0c, hat: 0xffaa00, skin: 0xf4c38a, basket: 0xffd97a } },
  { id: 'mystic', name: 'Esprit de l\'Île', desc: 'Légende de l\'Île Mystère', icon: '🔮', price: 6000, perk: 'Les cristaux dorent tout le score', colors: { shirt: 0x9b59b6, pants: 0x2d1b3d, hat: 0x6c3483, skin: 0xe0c0f0, basket: 0x4a2860 } },
];

// ---------- Upgrades ----------
export interface UpgradeDef {
  id: keyof Upgrades;
  name: string;
  desc: string;
  icon: string;
  max: number;
  basePrice: number;
  valueLabel: (lvl: number) => string;
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  { id: 'magnet', name: 'Aimant à Vanille', desc: 'Durée et portée de l\'aimant', icon: '🧲', max: 5, basePrice: 150, valueLabel: (l) => `${8 + l * 2}s` },
  { id: 'dash', name: 'Élan de Vanille', desc: 'Charge plus vite la capacité spéciale', icon: '💫', max: 5, basePrice: 200, valueLabel: (l) => `+${l * 20}%` },
  { id: 'shield', name: 'Bouclier de Départ', desc: 'Commence la course protégé·e', icon: '🛡️', max: 3, basePrice: 350, valueLabel: (l) => l > 0 ? `${l} charge${l > 1 ? 's' : ''}` : '—' },
  { id: 'coinBonus', name: 'Comptoir de Négoce', desc: 'Plus de pièces à chaque course', icon: '🪙', max: 5, basePrice: 250, valueLabel: (l) => `+${l * 25}%` },
  { id: 'headStart', name: 'Départ Lancé', desc: 'Commence plus loin sur la piste', icon: '🚀', max: 3, basePrice: 500, valueLabel: (l) => l > 0 ? `${l * 400}m` : '—' },
];

export function upgradePrice(def: UpgradeDef, level: number) {
  return Math.round(def.basePrice * Math.pow(1.85, level));
}

// ---------- Achievements ----------
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
  check: (s: SaveData, run: RunSummary) => boolean;
}

export interface RunSummary {
  score: number;
  vanilla: number;
  golden: number;
  distance: number;
  maxCombo: number;
  multiplier: number;
  bossesBeaten: number;
  noHit: boolean;
  envReached: number;
  nearMisses: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_harvest', name: 'Première Récolte', desc: 'Terminer une première course', icon: '🌱', reward: 50, check: (s) => s.totalRuns >= 1 },
  { id: 'vanilla_expert', name: 'Expert Vanille', desc: 'Récolter 250 gousses au total', icon: '🌿', reward: 150, check: (s) => s.totalVanilla >= 250 },
  { id: 'golden_collector', name: "Collecteur d'Or", desc: 'Récolter 50 gousses dorées', icon: '🌟', reward: 250, check: (s) => s.totalGolden >= 50 },
  { id: 'pods_1000', name: '1000 Gousses', desc: 'Récolter 1000 gousses au total', icon: '📦', reward: 500, check: (s) => s.totalVanilla >= 1000 },
  { id: 'combo_master', name: 'Maître du Combo', desc: 'Atteindre un combo x5', icon: '🔥', reward: 300, check: (_s, r) => r.multiplier >= 5 },
  { id: 'long_run', name: 'Traversée de l\'Île', desc: 'Parcourir 3000 m en une course', icon: '🏃', reward: 300, check: (_s, r) => r.distance >= 3000 },
  { id: 'guardian_slayer', name: 'Défi du Gardien', desc: 'Survivre à un Gardien', icon: '🛡️', reward: 400, check: (_s, r) => r.bossesBeaten >= 1 },
  { id: 'flawless', name: 'Récolte Parfaite', desc: '1500 m sans aucun dégât', icon: '💎', reward: 400, check: (_s, r) => r.noHit && r.distance >= 1500 },
  { id: 'score_25k', name: 'Grand Négociant', desc: 'Atteindre 25 000 points', icon: '💰', reward: 500, check: (_s, r) => r.score >= 25000 },
  { id: 'master_madagascar', name: 'Maître de Madagascar', desc: 'Atteindre l\'Île Mystère', icon: '👑', reward: 1000, check: (_s, r) => r.envReached >= 5 },
];

// ---------- Claimable missions ----------
export interface MissionDef {
  id: string;
  label: string;
  icon: string;
  goal: number;
  reward: number;
  cadence: 'day' | 'week' | 'total';
  progress: (s: SaveData) => number;
}

export const MISSIONS: MissionDef[] = [
  { id: 'm_pods', label: 'Récolter 120 gousses', icon: '🍦', goal: 120, reward: 180, cadence: 'day', progress: (s) => s.dailyVanilla },
  { id: 'm_runs', label: 'Jouer 3 courses', icon: '🏃', goal: 3, reward: 120, cadence: 'day', progress: (s) => s.dailyRuns },
  { id: 'm_gold', label: '50 gousses dorées cette semaine', icon: '🌟', goal: 50, reward: 400, cadence: 'week', progress: (s) => s.weekGolden },
  { id: 'm_dist', label: '12 000 m cette semaine', icon: '🗺️', goal: 12000, reward: 500, cadence: 'week', progress: (s) => s.weeklyDistance },
  { id: 'm_boss', label: 'Apaiser 3 Gardiens', icon: '🐾', goal: 3, reward: 700, cadence: 'total', progress: (s) => s.totalBosses },
  { id: 'm_perfect', label: 'Une course parfaite', icon: '💎', goal: 1, reward: 350, cadence: 'total', progress: (s) => s.perfectRuns },
];

// ---------- Daily challenge (deterministic per calendar day) ----------
export interface ChallengeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
  goal: number;
  goalLabel: string;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'golden', name: 'Journée Dorée', desc: 'Dore 25 gousses', icon: '🌟', reward: 600, goal: 25, goalLabel: 'gousses dorées' },
  { id: 'combo', name: 'Chaîne Infinie', desc: 'Atteindre le combo x5', icon: '🔥', reward: 650, goal: 50, goalLabel: 'gousses d\'affilée' },
  { id: 'distance', name: 'Grande Traite', desc: 'Parcourir 2 200 m', icon: '🧭', reward: 550, goal: 2200, goalLabel: 'mètres' },
  { id: 'guard', name: 'Sans une Éraflure', desc: '800 m sans dégât', icon: '💎', reward: 700, goal: 800, goalLabel: 'mètres intacts' },
  { id: 'boss', name: 'Négociateur', desc: 'Apaiser un Gardien', icon: '🐾', reward: 800, goal: 1, goalLabel: 'gardien' },
  { id: 'speed', name: 'Pied au Plancher', desc: 'Atteindre 42 m/s de pointe', icon: '⚡', reward: 600, goal: 42, goalLabel: 'vitesse max (m/s)' },
];

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function weekKeyOf(d = new Date()) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}
export function yesterdayKey() {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
/** Deterministic challenge for a given day. */
export function challengeForToday(): ChallengeDef {
  const d = new Date();
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return CHALLENGES[seed % CHALLENGES.length];
}
export function dailyRewardFor(streak: number) {
  return 120 + Math.min(streak, 6) * 90;
}
