import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Game, POWERUP_COLORS,
  type GameState, type GameStats, type PowerUpState, type DashState, type BossState, type Toast,
} from './game/Game';
import {
  loadSave, levelProgress, challengeForToday, todayKey,
  type SaveData, type RunSummary, type Upgrades,
} from './game/save';
import {
  encodeRun, decodeRun, buildShareUrl, getPublicGameUrl, readCodeFromUrl, clearCodeFromUrl,
  buildFacebookShareUrl, buildFacebookPagePost, renderFacebookBanner,
  renderScoreCard, shareCard, copyText, regionName, type SharedRun,
} from './game/share';
import {
  WorldMapPanel, CharactersPanel, ShopPanel, AchievementsPanel, MissionsPanel,
  ScoresPanel, StatsPanel, SettingsPanel, RankCard, DailyCard, ChallengeCard, RivalBoard,
} from './ui/Menus';

const POWERUP_INFO: Record<string, { name: string; icon: string; max: number }> = {
  magnet: { name: 'Aimant', icon: '🧲', max: 8 },
  goldenRush: { name: 'Ruée Dorée', icon: '✨', max: 8 },
  shield: { name: 'Bouclier', icon: '🛡️', max: 1 },
  speed: { name: 'Turbo', icon: '⚡', max: 6 },
  invincibility: { name: 'Invincible', icon: '⭐', max: 6 },
  storm: { name: 'Tempête', icon: '🌪️', max: 7 },
};

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

type MenuTab = 'missions' | 'chars' | 'shop' | 'map' | 'trophies' | 'scores' | 'rivals' | 'stats' | 'settings';
const TABS: { id: MenuTab; icon: string; label: string }[] = [
  { id: 'missions', icon: '📋', label: 'Missions' },
  { id: 'chars', icon: '🎭', label: 'Tenues' },
  { id: 'shop', icon: '⚒️', label: 'Atelier' },
  { id: 'map', icon: '🗺️', label: 'Carte' },
  { id: 'trophies', icon: '🏆', label: 'Succès' },
  { id: 'scores', icon: '📊', label: 'Scores' },
  { id: 'rivals', icon: '⚔️', label: 'Rivaux' },
  { id: 'stats', icon: '📈', label: 'Stats' },
  { id: 'settings', icon: '⚙️', label: 'Réglages' },
];

const INTRO = [
  { icon: '🌅', text: <>Au cœur de <b className="gold-text">Madagascar</b>, l'île aux mille senteurs, s'étendent les plantations de vanille les plus précieuses du monde…</> },
  { icon: '🌱', text: <>Vani veille sur les <b className="gold-text">gousses dorées de Vaniskara</b>, une variété légendaire transmise de génération en génération.</> },
  { icon: '⛈️', text: <>Mais une nuit, une tempête mystérieuse disperse <b className="gold-text">toute la récolte</b> aux quatre coins de l'île…</> },
  { icon: '🌿', text: <>Il est temps de traverser six régions pour tout retrouver.<br /><br /><span className="gold-text font-black text-xl">L'aventure commence…</span></> },
];

const TUTORIAL_STEPS = [
  { icon: '↔️', main: 'Glissez à gauche ou à droite', sub: 'Pour changer de couloir' },
  { icon: '⬆️', main: 'Glissez vers le haut', sub: 'Sauter troncs et gouffres' },
  { icon: '⬇️', main: 'Glissez vers le bas', sub: 'Glisser sous les branches' },
  { icon: '💫', main: 'Tapez l\'écran', sub: 'Activer l\'Élan de Vanille' },
];

interface Pop { id: number; x: number; y: number; text: string; color: string; big: boolean }

interface BoardRow {
  who: 'you' | 'rival'; name: string; score: number;
  vanilla: number; golden: number; distance: number; date: number;
}

function useCountUp(target: number, dur = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="drop-shadow-[0_3px_12px_rgba(255,170,40,0.5)]">
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff3cf" />
          <stop offset="52%" stopColor="#ffb340" />
          <stop offset="100%" stopColor="#a8500a" />
        </linearGradient>
      </defs>
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse key={a} cx="32" cy="16.5" rx="7.4" ry="13" fill="url(#vg)" opacity="0.94" transform={`rotate(${a} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="6.6" fill="#3a1e0d" />
      <circle cx="32" cy="32" r="3.1" fill="#ffd97a" />
      <rect x="30.5" y="34" width="3" height="23" rx="1.5" fill="#4a2810" transform="rotate(19 32 45)" />
      <rect x="30.5" y="34" width="3" height="23" rx="1.5" fill="#6b4020" transform="rotate(-19 32 45)" />
    </svg>
  );
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [gameState, setGameState] = useState<GameState>('menu');
  const [stats, setStats] = useState<GameStats>({
    score: 0, vanilla: 0, goldenVanilla: 0, distance: 0, combo: 0, maxCombo: 0,
    multiplier: 1, speed: 18, bestScore: 0, coins: 0,
  });
  const [powerUp, setPowerUp] = useState<PowerUpState>({ type: null, timeLeft: 0 });
  const [dash, setDash] = useState<DashState>({ charge: 0, ready: false, active: false, timeLeft: 0 });
  const [boss, setBoss] = useState<BossState>({ active: false, name: '', timeLeft: 0, maxTime: 0, hp: 1, phase: 0 });
  const [envName, setEnvName] = useState('Plantation de Vanille');
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [flash, setFlash] = useState<{ color: string; a: number } | null>(null);
  const [comboPulse, setComboPulse] = useState(false);
  const [shake, setShake] = useState(false);
  const [tab, setTab] = useState<MenuTab | null>(null);
  const [intro, setIntro] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [regionBanner, setRegionBanner] = useState<string | null>(null);
  const [bossBanner, setBossBanner] = useState<{ name: string } | null>(null);
  const prevBossActive = useRef(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [importedRun, setImportedRun] = useState<SharedRun | null>(null);
  const [invalidImport, setInvalidImport] = useState(false);
  const [rivalBoard, setRivalBoard] = useState<BoardRow[]>([]);
  const [runResult, setRunResult] = useState<(RunSummary & {
    coinsEarned: number; isRecord: boolean; xpGain: number; levelUp: boolean; newLevel: number; challengeDone: boolean;
  }) | null>(null);
  const lastMult = useRef(1);
  const popId = useRef(0);
  const prevEnv = useRef('');
  const [tutorial, setTutorial] = useState(-1);   // -1 = off, 0..3 = current coach step, 4 = done
  const tutorialTimers = useRef<number[]>([]);

  const shownScore = useCountUp(runResult ? runResult.score : 0, 950);
  const shownCoins = useCountUp(runResult ? runResult.coinsEarned : 0, 1100);

  const confetti = useMemo(() => {
    if (!runResult?.isRecord) return [];
    const colors = ['#ffd97a', '#ffb340', '#f5e6c8', '#7bd45a', '#8ee8f5', '#e8b6ff'];
    return Array.from({ length: 46 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      dx: `${(Math.random() - 0.5) * 180}px`,
      rot: `${540 + Math.random() * 900}deg`,
      dur: `${2 + Math.random() * 1.8}s`,
      delay: `${Math.random() * 0.7}s`,
      bg: colors[i % colors.length],
      w: 5 + Math.random() * 7,
      h: 9 + Math.random() * 12,
    }));
  }, [runResult?.isRecord]);

  // ---------------- engine bootstrap ----------------
  useEffect(() => {
    if (!containerRef.current) return;
    const game = new Game(containerRef.current);
    gameRef.current = game;

    game.onStatsUpdate = (s) => {
      setStats(s);
      if (s.multiplier > lastMult.current) { setComboPulse(true); setTimeout(() => setComboPulse(false), 620); }
      lastMult.current = s.multiplier;
    };
    game.onStateChange = (s) => {
      setGameState(s);
      if (s === 'gameover') { setShake(true); setTimeout(() => setShake(false), 440); }
    };
    game.onPowerUpUpdate = setPowerUp;
    game.onDashUpdate = setDash;
    game.onBossUpdate = (b) => {
      setBoss(b);
      if (b.active && !prevBossActive.current) {
        setBossBanner({ name: b.name });
        setTimeout(() => setBossBanner(null), 3000);
      }
      prevBossActive.current = b.active;
    };
    game.onSaveUpdate = (s) => setSave({ ...s });
    game.onRunComplete = (r) => setRunResult(r);
    game.onEnvironmentChange = (n) => {
      setEnvName(n);
      if (prevEnv.current && prevEnv.current !== n) {
        setRegionBanner(n);
        setTimeout(() => setRegionBanner(null), 2100);
      }
      prevEnv.current = n;
    };
    game.onFlash = (color, amount) => {
      setFlash({ color: hex(color), a: Math.min(0.72, amount) });
      setTimeout(() => setFlash(null), 230);
    };
    game.onPopup = (text, color, screen, big) => {
      const id = ++popId.current;
      setPops(prev => [...prev.slice(-11), { id, x: screen.x, y: screen.y, text, color, big }]);
      setTimeout(() => setPops(prev => prev.filter(p => p.id !== id)), 1000);
    };
    game.onToast = (t) => {
      setToasts(prev => [...prev.slice(-2), t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 2900);
      if (game.save.settings.haptics && navigator.vibrate) {
        navigator.vibrate(t.kind === 'boss' ? [28, 40, 28] : 22);
      }
    };

    setSave({ ...game.save });
    setStats({ ...game.stats });
    game.start();

    const t = setTimeout(() => {
      setLoading(false);
      if (!game.save.seenIntro) { setIntro(true); setIntroStep(0); }
    }, 1400);

    return () => {
      clearTimeout(t);
      tutorialTimers.current.forEach(clearTimeout);
      game.destroy();
    };
  }, []);

  // Browsers require a gesture before audio can start
  useEffect(() => {
    const kick = () => {
      const g = gameRef.current;
      if (!g) return;
      g.sound.resume();
      g.sound.setSfx(g.save.settings.sfx);
      g.sound.setMusic(g.save.settings.music);
      g.sound.startMusic();
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => { window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
  }, []);

  useEffect(() => {
    const onHide = () => { if (document.hidden) gameRef.current?.pause(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // The character tab turns the living menu backdrop into a real 3D showroom.
  useEffect(() => {
    gameRef.current?.showCharacterPreview(gameState === 'menu' && tab === 'chars');
  }, [gameState, tab]);


  // ---------------- actions ----------------
  const click = () => gameRef.current?.sound.uiClick();
  const sync = () => { if (gameRef.current) setSave({ ...gameRef.current.save }); };

  /** First-run coach: four gestures, never blocking, auto-dismisses. */
  const startTutorial = useCallback(() => {
    tutorialTimers.current.forEach(clearTimeout);
    tutorialTimers.current = [];
    setTutorial(0);
    [3400, 6800, 10200, 13800].forEach((t, i) => {
      tutorialTimers.current.push(window.setTimeout(() => setTutorial(i + 1), t));
    });
  }, []);

  const beginRun = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.sound.resume();
    setTab(null);
    setRunResult(null);
    setPops([]);
    if (!g.save.seenTutorial) {
      g.save.seenTutorial = true;
      g.persist();
      setSave({ ...g.save });
      startTutorial();
    } else {
      setTutorial(-1);
    }
    setCountdown(3);
    let n = 3;
    const tick = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(tick); setCountdown(0); g.startGame(); }
      else { setCountdown(n); g.sound.uiClick(); }
    }, 520);
  }, []);

  const handlePlay = useCallback(() => {
    click();
    const g = gameRef.current;
    if (g && !g.save.seenIntro) { g.save.seenIntro = true; g.persist(); setIntro(true); setIntroStep(0); return; }
    beginRun();
  }, [beginRun]);

  const handleIntroNext = useCallback(() => {
    click();
    if (introStep < INTRO.length - 1) setIntroStep(s => s + 1);
    else {
      const g = gameRef.current;
      if (g) { g.save.seenIntro = true; g.persist(); }
      setIntro(false);
      beginRun();
    }
  }, [introStep, beginRun]);

  const skipIntro = useCallback(() => {
    const g = gameRef.current;
    if (g) { g.save.seenIntro = true; g.persist(); }
    setIntro(false);
    beginRun();
  }, [beginRun]);

  const toMenu = useCallback(() => { click(); gameRef.current?.goToMenu(); setRunResult(null); sync(); }, []);

  /** Refresh the combined you-vs-rivals board. */
  const refreshBoard = useCallback(() => {
    const g = gameRef.current;
    if (g) setRivalBoard([...g.combinedBoard]);
  }, []);

  /** Send the finished run: Facebook sharer, code link, or PNG score card. */
  const handleShare = useCallback(async (mode: 'facebook' | 'link' | 'card', rankLabel?: string) => {
    const g = gameRef.current;
    if (!g || !runResult) return;
    setShareBusy(true);
    try {
      const code = encodeRun(runResult, g.playerName);
      const url = buildShareUrl(code);
      if (mode === 'facebook') {
        const postCopy = buildFacebookPagePost({
          url,
          score: runResult.score,
          distance: Math.floor(runResult.distance),
          vanilla: runResult.vanilla,
          golden: runResult.golden,
          playerName: g.playerName,
        });
        await copyText(postCopy);
        window.open(buildFacebookShareUrl(url), '_blank', 'noopener,noreferrer,width=640,height=680');
        setShareNote('Aperçu ouvert — texte copié, collez-le !');
      } else if (mode === 'link') {
        const ok = await copyText(url);
        setShareNote(ok ? 'Lien copié !' : 'Copie impossible — utilisez la carte');
      } else {
        const card = renderScoreCard({
          n: g.playerName, s: runResult.score, v: runResult.vanilla, g: runResult.golden,
          d: Math.floor(runResult.distance), c: runResult.maxCombo, b: runResult.bossesBeaten,
          m: runResult.multiplier, e: runResult.envReached, f: runResult.noHit,
          t: Date.now(), k: 1,
        }, rankLabel || levelProgress(save.xp).rank.name);
        const res = await shareCard(card, `VANISKARA — ${runResult.score.toLocaleString('fr-FR')} points`);
        setShareNote(
          res === 'shared' ? 'Partagé !' :
          res === 'downloaded' ? 'Carte enregistrée' : 'Échec du partage'
        );
      }
    } finally {
      setShareBusy(false);
      setTimeout(() => setShareNote(null), 2600);
    }
  }, [runResult, save.xp]);

  /** Build the best available URL (with your best run if you have one, else the public game URL). */
  const buildPageChallengeUrl = useCallback(() => {
    const g = gameRef.current;
    const top = save.scores[0];
    if (g && top && top.score > 0) {
      const code = encodeRun({
        score: top.score, vanilla: top.vanilla, golden: top.golden, distance: top.distance,
        maxCombo: save.bestCombo || 10, multiplier: 5, bossesBeaten: save.totalBosses || 0,
        noHit: save.perfectRuns > 0, envReached: save.envReached || 0, nearMisses: 0,
      }, g.playerName);
      return buildShareUrl(code);
    }
    return getPublicGameUrl();
  }, [save.scores, save.bestCombo, save.totalBosses, save.perfectRuns, save.envReached]);

  const handlePageFacebookShare = useCallback(async () => {
    click();
    const g = gameRef.current;
    const url = buildPageChallengeUrl();
    const top = save.scores[0];
    const text = buildFacebookPagePost({
      url,
      score: top?.score,
      distance: top?.distance,
      vanilla: top?.vanilla,
      golden: top?.golden,
      playerName: g?.playerName || 'Vaniskara',
    });
    await copyText(text);
    window.open(buildFacebookShareUrl(url), '_blank', 'noopener,noreferrer,width=640,height=680');
    setShareNote('Aperçu ouvert — collez le texte copié !');
    setTimeout(() => setShareNote(null), 2800);
  }, [buildPageChallengeUrl, save.scores]);

  const handleCopyFacebookPost = useCallback(async () => {
    click();
    const g = gameRef.current;
    const url = buildPageChallengeUrl();
    const top = save.scores[0];
    const text = buildFacebookPagePost({
      url,
      score: top?.score,
      distance: top?.distance,
      vanilla: top?.vanilla,
      golden: top?.golden,
      playerName: g?.playerName || 'Vaniskara',
    });
    const ok = await copyText(text);
    setShareNote(ok ? 'Post copié — collez-le dans la Page Facebook !' : 'Impossible de copier');
    setTimeout(() => setShareNote(null), 2800);
  }, [buildPageChallengeUrl, save.scores]);

  const handleDownloadFacebookBanner = useCallback(async () => {
    click();
    const g = gameRef.current;
    const canvas = renderFacebookBanner(save.bestScore, g?.playerName || 'Vaniskara');
    const res = await shareCard(canvas, 'VANISKARA – L’Odyssée de la Vanille');
    setShareNote(res === 'shared' ? 'Bannière partagée !' : 'Bannière 1200×630 enregistrée !');
    setTimeout(() => setShareNote(null), 2800);
  }, [save.bestScore]);

  /** Import a friend's run from the address bar on first load. */
  useEffect(() => {
    const code = readCodeFromUrl();
    if (!code) return;
    const g = gameRef.current;
    const run = decodeRun(code);
    clearCodeFromUrl();
    if (!g || !run) return;
    const res = g.importRival(code);
    setSave({ ...g.save });
    refreshBoard();
    if (res.ok) {
      setImportedRun(run);
      g.sound.achievement();
    } else if (res.reason === 'duplicate') {
      setImportedRun(run);   // already on the board — still show the challenge card
    } else {
      setInvalidImport(true);
      setTimeout(() => setInvalidImport(false), 3000);
    }
  }, [refreshBoard]);


  // Keep the combined board in sync with the save.
  useEffect(() => { refreshBoard(); }, [save.scores, save.rivals, refreshBoard]);
  const doImport = useCallback((code: string) => {
    const g = gameRef.current;
    if (!g) return;
    const res = g.importRival(code);
    setSave({ ...g.save });
    refreshBoard();
    click();
    if (!res.ok && res.reason !== 'duplicate') {
      setInvalidImport(true);
      setTimeout(() => setInvalidImport(false), 3000);
    }
  }, [refreshBoard]);

  const g = gameRef.current;
  const canRevive = !!(g && g.canRevive && stats.coins >= g.reviveCost);
  const reviveCost = g?.reviveCost ?? 0;
  const isPlaying = gameState === 'playing';
  const isPaused = gameState === 'paused';
  const isOver = gameState === 'gameover';
  const isMenu = gameState === 'menu';
  const puInfo = powerUp.type ? POWERUP_INFO[powerUp.type] : null;
  const lp = levelProgress(save.xp);
  const ch = challengeForToday();
  const dailyReady = save.lastDaily !== todayKey();
  const speedPct = Math.min(100, ((stats.speed - 18) / (55 - 18)) * 100);

  return (
    <div className={`relative w-full h-full overflow-hidden ${shake ? 'shake' : ''} ${
      save.settings.reducedMotion ? 'access-reduced-motion' : ''
    } ${save.settings.highContrast ? 'access-high-contrast' : ''} ${
      save.settings.largeText ? 'access-large-text' : ''
    }`}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* vignette */}
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 150px 34px rgba(18,7,2,0.6)' }} />

      {/* speed rush vignette */}
      {(isPlaying || isPaused) && speedPct > 35 && (
        <div className="pointer-events-none absolute inset-0 transition-opacity"
          style={{ opacity: (speedPct - 35) / 130, background: 'radial-gradient(ellipse at 50% 45%, transparent 42%, rgba(255,150,40,0.22) 100%)' }} />
      )}

      {flash && (
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{ background: flash.color, opacity: flash.a, mixBlendMode: 'screen' }} />
      )}

      {dash.active && (
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 58%, transparent 32%, rgba(255,190,60,0.32) 100%)' }} />
      )}

      {/* ---------- floating score labels, projected from the 3D world ---------- */}
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {pops.map(p => (
          <span key={p.id} className="pop-label outline-type"
            style={{ left: p.x, top: p.y, fontSize: p.big ? 30 : 19, color: p.color }}>
            {p.text}
          </span>
        ))}
      </div>

      {/* ---------- region banner ---------- */}
      {regionBanner && (
        <div className="absolute left-0 right-0 top-[26%] z-30 pointer-events-none">
          <div className="slide-in-right flex items-center gap-3 pl-6">
            <span className="h-11 w-1.5 rounded-full" style={{ background: 'linear-gradient(#ffe9a8,#c46a00)' }} />
            <div>
              <div className="eyebrow text-amber-200/70 -mb-0.5">Région atteinte</div>
              <div className="font-display text-3xl outline-type leading-none">{regionBanner}</div>
              <div className="text-[10px] font-black text-amber-300 mt-1">+500 points de passage</div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- boss awakening alert banner ---------- */}
      {bossBanner && (
        <div className="absolute left-0 right-0 top-[22%] z-30 pointer-events-none px-4 flex justify-center">
          <div className="bounce-in panel-lit rounded-3xl p-4 border-red-500/80 shadow-[0_0_50px_rgba(255,50,0,0.55)] text-center max-w-sm w-full bg-gradient-to-b from-red-950/95 via-black/90 to-amber-950/95">
            <div className="text-3xl mb-1 animate-bounce">⚠️</div>
            <div className="eyebrow text-red-300 font-black tracking-[0.25em]">LE GARDIEN S'ÉVEILLE !</div>
            <div className="font-display text-2xl gold-text mt-0.5">{bossBanner.name}</div>
            <div className="text-[11px] text-amber-200/85 mt-1 font-bold">Collectez l'énergie dorée pour l'apaiser !</div>
          </div>
        </div>
      )}

      {/* ================= LOADING ================= */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col"
          style={{ background: 'linear-gradient(168deg,#4a2812,#20100a 55%,#0c0604)' }}>
          <div className="flex-1 flex flex-col justify-center px-8 max-w-md w-full mx-auto">
            <div className="flex items-end gap-3 bounce-in">
              <LogoMark size={64} />
              <div>
                <h1 className="font-display text-[2.9rem] leading-[0.85] gold-text">VANISKARA</h1>
                <div className="text-amber-200/70 text-[9px] uppercase tracking-[0.3em] font-black mt-1">L'Odyssée de la Vanille</div>
              </div>
            </div>
            <div className="gold-rule my-5" />
            <p className="text-amber-100/75 text-sm leading-relaxed max-w-xs">
              Six régions, trois gardiens, une récolte à ramener chez soi.
            </p>
            <div className="mt-6 h-1 rounded-full bg-black/50 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-100" style={{ animation: 'loadbar 1.4s ease-out forwards' }} />
            </div>
            <div className="mt-2 text-[9px] uppercase tracking-[0.25em] text-amber-200/40 font-black">
              Préparation de la récolte…
            </div>
            <style>{`@keyframes loadbar{from{width:0}to{width:100%}}`}</style>
          </div>
          <div className="px-8 pb-6 text-center text-[9px] text-amber-200/30 uppercase tracking-[0.2em]">
            Vaniskara · Madagascar
          </div>
        </div>
      )}

      {/* ================= IMPORTED CHALLENGE ================= */}
      {importedRun && gameState === 'menu' && !loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/72 backdrop-blur-md px-5 fade-in">
          <div className="panel-lit rounded-3xl p-5 w-full max-w-sm bounce-in text-center">
            <div className="text-4xl mb-1">⚔️</div>
            <div className="eyebrow text-amber-300/70">Défi reçu</div>
            <h2 className="font-display text-2xl gold-text leading-tight mt-1">{importedRun.n}</h2>
            <p className="text-[11px] text-amber-200/60 mb-3">{regionName(importedRun.e)}</p>

            <div className="text-5xl font-black text-white tabular-nums leading-none">
              {fmt(importedRun.s)}
            </div>
            <div className="eyebrow text-amber-200/55 mt-1 mb-3">Points à battre</div>

            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {[
                { l: 'Vanille', v: `🍦 ${importedRun.v}` },
                { l: 'Dorées', v: `🌟 ${importedRun.g}` },
                { l: 'Distance', v: `${fmt(importedRun.d)} m` },
                { l: 'Combo', v: `🔥 x${importedRun.m}` },
                { l: 'Gardiens', v: `🐾 ${importedRun.b}` },
                { l: 'Parfaite', v: importedRun.f ? '💎 Oui' : '—' },
              ].map(c => (
                <div key={c.l} className="bg-black/30 rounded-lg py-1.5 border border-amber-700/30">
                  <div className="eyebrow text-amber-200/50">{c.l}</div>
                  <div className="text-[11px] font-black text-amber-50 tabular-nums">{c.v}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => { click(); setImportedRun(null); beginRun(); }}
              className="btn-primary rounded-2xl py-3.5 font-display text-lg w-full"
            >
              ⚔️ RELEVER LE DÉFI
            </button>
            <button onClick={() => { click(); setImportedRun(null); }}
              className="btn-ghost w-full rounded-2xl py-2.5 text-xs font-bold mt-2">
              Plus tard
            </button>
          </div>
        </div>
      )}

      {invalidImport && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-40 pointer-events-none bounce-in">
          <div className="panel rounded-2xl px-4 py-2.5 border-red-400/60 flex items-center gap-2.5">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="font-display text-sm text-amber-50">Code invalide</div>
              <div className="text-[10px] text-amber-200/65">Vérifiez le lien de partage</div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TOASTS ================= */}
      <div className="absolute top-[30%] left-0 right-0 z-40 flex flex-col items-center gap-2 pointer-events-none px-6">
        {toasts.map(t => (
          <div key={t.id} className={`bounce-in panel rounded-2xl px-4 py-2.5 flex items-center gap-3 max-w-xs ${
            t.kind === 'boss' ? 'border-red-400/70' : t.kind === 'achievement' ? 'border-yellow-300/80' : ''}`}>
            <span className="text-2xl">{t.icon}</span>
            <div className="min-w-0">
              <div className="font-display text-sm text-amber-50 leading-tight truncate">{t.title}</div>
              {t.subtitle && <div className="text-[10px] text-amber-200/70 truncate">{t.subtitle}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ================= COUNTDOWN ================= */}
      {countdown > 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <div key={countdown} className="text-center">
            <div className="font-display text-[6.5rem] gold-text bounce-in leading-none">{countdown}</div>
            <div className="eyebrow text-amber-200/60 -mt-1">Préparez le panier</div>
          </div>
        </div>
      )}

      {/* ================= HUD ================= */}
      {(isPlaying || isPaused || gameState === 'dying') && (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div className="absolute top-0 left-0 right-0 p-2.5 pt-[max(10px,env(safe-area-inset-top))] flex justify-between items-start gap-2">
            {/* score stack */}
            <div className="flex flex-col gap-1.5">
              <div className="panel rounded-2xl px-3.5 py-1.5">
                <div className="eyebrow text-amber-200/60">Score</div>
                <div className={`font-display text-[1.7rem] text-white leading-none tabular-nums ${comboPulse ? 'combo-flash' : ''}`}>
                  {fmt(stats.score)}
                </div>
              </div>
              <div className="flex gap-1">
                <div className="panel rounded-lg px-2 py-0.5 flex items-center gap-1">
                  <span className="text-xs">🍦</span><span className="text-xs font-black text-amber-100 tabular-nums">{stats.vanilla}</span>
                </div>
                <div className="panel rounded-lg px-2 py-0.5 flex items-center gap-1">
                  <span className="text-xs">🌟</span><span className="text-xs font-black text-yellow-300 tabular-nums">{stats.goldenVanilla}</span>
                </div>
              </div>
            </div>

            {/* centre: region + combo */}
            <div className="flex flex-col items-center gap-1 pt-1 min-w-0">
              <div className="panel rounded-full px-2.5 py-0.5 flex items-center gap-1 max-w-[52vw]">
                <span className="text-[9px]">📍</span>
                <span className="text-[9px] font-black text-amber-100 uppercase tracking-wide truncate">{envName}</span>
              </div>
              <div className="font-display text-[13px] text-amber-100 tabular-nums leading-none">{Math.floor(stats.distance)} m</div>
              {stats.multiplier > 1 && (
                <div className={`panel rounded-full px-3 py-0.5 border-yellow-300/70 ${comboPulse ? 'bounce-in' : ''}`}>
                  <span className="font-display text-[13px] gold-text leading-none">COMBO x{stats.multiplier}</span>
                </div>
              )}
              {stats.combo > 0 && stats.multiplier < 5 && (
                <div className="w-20">
                  <div className="h-1 rounded-full bg-black/50 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-yellow-100 transition-all"
                      style={{ width: `${Math.min(100, (stats.combo / (stats.multiplier === 1 ? 10 : stats.multiplier === 2 ? 25 : 50)) * 100)}%`}} />
                  </div>
                  <div className="text-[8px] text-amber-200/55 font-black text-center tabular-nums mt-0.5">
                    {stats.combo}/{stats.multiplier === 1 ? 10 : stats.multiplier === 2 ? 25 : 50}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 items-end pointer-events-auto">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const soundActive = save.settings.sfx || save.settings.music;
                    gameRef.current?.setSetting('sfx', !soundActive);
                    gameRef.current?.setSetting('music', !soundActive);
                    sync();
                    click();
                  }}
                  className="btn-secondary rounded-2xl w-10 h-10 flex items-center justify-center text-sm active:scale-90 transition"
                  title="Couper / Activer le son"
                >
                  {(save.settings.sfx || save.settings.music) ? '🔊' : '🔇'}
                </button>
                <button onClick={() => { click(); gameRef.current?.pause(); }}
                  className="btn-secondary rounded-2xl w-12 h-12 flex items-center justify-center text-lg active:scale-90 transition">⏸</button>
              </div>
              <div className="panel rounded-lg px-2 py-0.5 text-right">
                <div className="eyebrow text-amber-200/55">Record</div>
                <div className="text-[11px] font-black text-white leading-none tabular-nums">{fmt(stats.bestScore)}</div>
              </div>
            </div>
          </div>

          {/* velocity meter — communicates the ramp, which is the whole tension of a runner */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
            <div className="w-1.5 h-28 rounded-full bg-black/45 overflow-hidden flex flex-col-reverse border border-amber-900/50">
              <div className="w-full transition-all duration-200" style={{ height: `${speedPct}%`, background: 'linear-gradient(#7bd45a,#ffb340,#ff5b3c)' }} />
            </div>
            <span className="text-[8px] font-black text-amber-200/60 tabular-nums" style={{ writingMode: 'vertical-rl' }}>
              {stats.speed.toFixed(0)} m/s
            </span>
          </div>

          {/* boss */}
          {boss.active && (
            <div className="absolute top-[88px] left-1/2 -translate-x-1/2 w-[78%] max-w-sm bounce-in">
              <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-[10px] font-black text-red-200 uppercase tracking-widest drop-shadow">⚠️ {boss.name}</span>
                <span className="text-[10px] font-black text-amber-200 tabular-nums">{Math.ceil(boss.timeLeft)}s</span>
              </div>
              <div className="h-3 rounded-full bg-black/65 border border-red-400/50 overflow-hidden">
                <div className="h-full transition-all duration-200"
                  style={{ width: `${boss.hp * 100}%`, background: 'linear-gradient(90deg,#ff6b4a,#ffd97a)', boxShadow: '0 0 14px rgba(255,150,60,0.8)' }} />
              </div>
              <div className="text-center text-[9px] text-amber-100/70 mt-1 font-bold">
                Collectez l'énergie ✨ dans le couloir libre pour l'apaiser
              </div>
            </div>
          )}

          {/* power-up */}
          {puInfo && powerUp.type && (
            <div className={`absolute ${boss.active ? 'top-[152px]' : 'top-[94px]'} left-1/2 -translate-x-1/2 bounce-in`}>
              <div className="power-up-indicator flex items-center gap-2" style={{ borderColor: hex(POWERUP_COLORS[powerUp.type]) }}>
                <span className="text-base">{puInfo.icon}</span>
                <div>
                  <div className="text-[9px] uppercase tracking-wider font-black leading-none" style={{ color: hex(POWERUP_COLORS[powerUp.type]) }}>
                    {puInfo.name}
                  </div>
                  {powerUp.type !== 'shield' && (
                    <div className="w-20 h-1 bg-black/55 rounded mt-1 overflow-hidden">
                      <div className="h-full transition-all"
                        style={{
                          width: `${Math.max(0, Math.min(100, (powerUp.timeLeft / (powerUp.type === 'magnet' ? 8 + save.upgrades.magnet * 2 : puInfo.max)) * 100))}%`,
                          background: hex(POWERUP_COLORS[powerUp.type]),
                        }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* special ability */}
          <div className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-0 right-0 flex flex-col items-center gap-2 px-6">
            {/* First-run gesture coach — never blocks touch input */}
            {tutorial >= 0 && tutorial < 4 && (
              <div key={tutorial} className="pointer-events-none bounce-in">
                <div className="panel-lit rounded-full px-4 py-2 flex items-center gap-2.5 border-amber-300/70">
                  <span className="text-2xl animate-bounce">{TUTORIAL_STEPS[tutorial].icon}</span>
                  <div className="text-left">
                    <div className="text-[11px] font-black text-amber-50 leading-tight">{TUTORIAL_STEPS[tutorial].main}</div>
                    <div className="text-[10px] text-amber-200/75 leading-tight">{TUTORIAL_STEPS[tutorial].sub}</div>
                  </div>
                </div>
              </div>
            )}
            {dash.active ? (
              <div className="panel rounded-2xl px-5 py-2 border-yellow-300/80 bounce-in">
                <div className="font-display text-base gold-text text-center leading-none">💫 ÉLAN DE VANILLE</div>
                <div className="w-36 h-1.5 bg-black/55 rounded mt-1.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-200 to-yellow-50" style={{ width: `${(dash.timeLeft / 4.5) * 100}%` }} />
                </div>
              </div>
            ) : (
              <button onClick={() => gameRef.current?.activateDash()}
                className={`pointer-events-auto rounded-full pl-3 pr-4 py-2 flex items-center gap-2.5 transition-transform active:scale-95 ${
                  dash.ready ? 'btn-primary ready-ring' : 'panel'}`}>
                <span className={`text-xl ${dash.ready ? '' : 'opacity-45'}`}>💫</span>
                <div className="w-24">
                  <div className={`text-[9px] uppercase tracking-widest font-black text-left leading-none ${dash.ready ? 'text-[#2d1810]' : 'text-amber-200/60'}`}>
                    {dash.ready ? 'PRÊT · TOUCHEZ' : 'Élan'}
                  </div>
                  <div className={`h-1.5 rounded mt-1 overflow-hidden ${dash.ready ? 'bg-[#8a4a00]/50' : 'bg-black/55'}`}>
                    <div className="h-full transition-all duration-150"
                      style={{ width: `${dash.charge * 100}%`, background: dash.ready ? '#fff8e7' : 'linear-gradient(90deg,#c46a00,#ffb340)' }} />
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================= PAUSE ================= */}
      {isPaused && (
        <div className="absolute inset-0 z-[35] flex items-center justify-center bg-black/65 backdrop-blur-md fade-in px-6">
          <div className="panel-lit rounded-3xl p-5 w-full max-w-xs bounce-in">
            <div className="flex items-center gap-2.5 mb-3">
              <LogoMark size={34} />
              <div>
                <h2 className="font-display text-2xl gold-text leading-none">Pause</h2>
                <p className="text-[10px] text-amber-200/60 mt-0.5">Le panier vous attend</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[{ l: 'Score', v: fmt(stats.score) }, { l: 'Vanille', v: fmt(stats.vanilla) }, { l: 'Distance', v: `${Math.floor(stats.distance)}m` }].map(c => (
                <div key={c.l} className="bg-black/35 rounded-lg py-1.5 border border-amber-700/30 text-center">
                  <div className="eyebrow text-amber-200/55">{c.l}</div>
                  <div className="text-xs font-black text-white tabular-nums">{c.v}</div>
                </div>
              ))}
            </div>
            {/* Quick Audio Toggles inside Pause */}
            <div className="flex gap-2 justify-center mb-4">
              <button
                onClick={() => {
                  const next = !save.settings.music;
                  gameRef.current?.setSetting('music', next);
                  sync();
                  click();
                }}
                className={`flex-1 py-1.5 px-2 rounded-xl border text-[10px] font-black flex items-center justify-center gap-1 transition ${
                  save.settings.music ? 'bg-amber-500/25 border-amber-400 text-amber-100' : 'bg-black/40 border-white/10 opacity-60'
                }`}
              >
                🎵 Musique : {save.settings.music ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => {
                  const next = !save.settings.sfx;
                  gameRef.current?.setSetting('sfx', next);
                  sync();
                  click();
                }}
                className={`flex-1 py-1.5 px-2 rounded-xl border text-[10px] font-black flex items-center justify-center gap-1 transition ${
                  save.settings.sfx ? 'bg-amber-500/25 border-amber-400 text-amber-100' : 'bg-black/40 border-white/10 opacity-60'
                }`}
              >
                🔊 Sons : {save.settings.sfx ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => { click(); gameRef.current?.resume(); }} className="btn-primary rounded-2xl py-3 font-display text-lg">▶ Reprendre</button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { click(); beginRun(); }} className="btn-secondary rounded-2xl py-2.5 font-bold text-xs">🔄 Recommencer</button>
                <button onClick={toMenu} className="btn-secondary rounded-2xl py-2.5 font-bold text-xs">🏠 Menu</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= RESULTS ================= */}
      {isOver && countdown === 0 && (
        <div className="absolute inset-0 z-[35] flex items-center justify-center bg-black/72 backdrop-blur-md fade-in px-4 py-5 scroll-y">
          {runResult?.isRecord && confetti.map(c => (
            <span key={c.id} className="confetti rounded-[2px]"
              style={{ left: `${c.left}%`, width: c.w, height: c.h, background: c.bg, ['--dx' as any]: c.dx, ['--rot' as any]: c.rot, ['--dur' as any]: c.dur, ['--delay' as any]: c.delay }} />
          ))}
          <div className="panel-lit rounded-3xl p-5 w-full max-w-sm bounce-in my-auto relative">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="eyebrow text-amber-200/60">{envName}</div>
                <h2 className="font-display text-[1.9rem] gold-text leading-none mt-1">
                  {runResult?.isRecord ? 'NOUVEAU RECORD !' : runResult?.noHit ? 'RÉCOLTE PARFAITE' : 'Fin de la récolte'}
                </h2>
              </div>
              <span className="text-3xl shrink-0">{runResult?.isRecord ? '🏆' : runResult?.noHit ? '💎' : '🧺'}</span>
            </div>

            <div className="text-center bg-black/35 rounded-2xl py-3 border border-amber-500/30 mb-3">
              <div className="font-display text-[3.1rem] leading-none text-white tabular-nums">{fmt(shownScore)}</div>
              <div className="eyebrow text-amber-200/55 mt-1">Points</div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { l: 'Vanille', v: `🍦 ${runResult?.vanilla ?? 0}` },
                { l: 'Dorées', v: `🌟 ${runResult?.golden ?? 0}` },
                { l: 'Distance', v: `${Math.floor(stats.distance)} m` },
                { l: 'Combo', v: `🔥 x${stats.multiplier}` },
                { l: 'Gard.', v: `🐾 ${runResult?.bossesBeaten ?? 0}` },
                { l: 'Esquives', v: `⚡ ${runResult?.nearMisses ?? 0}` },
              ].map(c => (
                <div key={c.l} className="bg-black/30 rounded-lg py-1.5 border border-amber-700/30 text-center">
                  <div className="eyebrow text-amber-200/50">{c.l}</div>
                  <div className="text-[11px] font-black text-amber-50 tabular-nums">{c.v}</div>
                </div>
              ))}
            </div>

            {/* XP rail */}
            <div className="rounded-2xl p-2.5 bg-black/30 border border-amber-700/30 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black" style={{ color: lp.rank.color }}>{lp.rank.icon} {lp.rank.name}</span>
                <span className="text-[11px] font-black text-yellow-300 tabular-nums">+ {fmt(shownCoins)} 🪙</span>
              </div>
              <div className="xp-track"><div className="xp-fill" style={{ width: `${lp.pct}%` }} /></div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] font-black text-amber-200/70 tabular-nums">Niveau {lp.level}</span>
                <span className="text-[9px] font-black text-green-300 tabular-nums">+{fmt(runResult?.xpGain ?? 0)} XP</span>
              </div>
              {runResult?.levelUp && (
                <div className="mt-2 text-center font-display text-sm gold-text bounce-in">🎉 NIVEAU {runResult.newLevel} ATTEINT !</div>
              )}
            </div>

            {runResult?.challengeDone && !save.challengeClaimed && (
              <div className="rounded-2xl px-3 py-2 mb-3 bg-green-900/35 border border-green-400/50 text-[11px] font-black text-green-200">
                🏅 Défi du jour réussi — réclamez-le depuis le menu !
              </div>
            )}

            {/* Share: Facebook + code link + social card */}
            {runResult && (
              <div className="rounded-2xl p-2.5 bg-black/30 border border-amber-700/30 mb-3">
                <div className="eyebrow text-amber-300/70 mb-1.5">Partager cette récolte</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleShare('facebook')}
                    disabled={shareBusy}
                    className={`rounded-xl py-2.5 text-[11px] font-black flex items-center justify-center gap-1 ${shareBusy ? 'btn-primary opacity-60' : 'btn-primary'}`}
                  >
                    📘 Facebook
                  </button>
                  <button
                    onClick={() => handleShare('link')}
                    disabled={shareBusy}
                    className={`rounded-xl py-2.5 text-[11px] font-black flex items-center justify-center gap-1 ${shareBusy ? 'btn-secondary opacity-60' : 'btn-secondary'}`}
                  >
                    🔗 Lien
                  </button>
                  <button
                    onClick={() => handleShare('card')}
                    disabled={shareBusy}
                    className={`rounded-xl py-2.5 text-[11px] font-black flex items-center justify-center gap-1 ${shareBusy ? 'btn-secondary opacity-60' : 'btn-secondary'}`}
                  >
                    🖼️ Carte
                  </button>
                </div>
                {shareNote && (
                  <div className="text-center text-[10px] font-black text-green-300 mt-2 fade-in">{shareNote}</div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {canRevive && (
                <button onClick={() => { click(); if (gameRef.current?.reviveRun()) { setRunResult(null); sync(); } }}
                  className="btn-primary rounded-2xl py-3 font-display text-base flex items-center justify-center gap-2">
                  <span>🌿</span> Continuer <span className="text-xs opacity-80 tabular-nums">🪙 {fmt(reviveCost)}</span>
                </button>
              )}
              <button onClick={() => { click(); beginRun(); }} className="btn-primary rounded-2xl py-3.5 font-display text-lg">🔄 Rejouer</button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { click(); gameRef.current?.goToMenu(); setTab('shop'); setRunResult(null); sync(); }}
                  className="btn-secondary rounded-2xl py-2.5 font-bold text-xs">⚒️ Atelier</button>
                <button onClick={toMenu} className="btn-secondary rounded-2xl py-2.5 font-bold text-xs">🏠 Menu</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MAIN MENU ================= */}
      {isMenu && !intro && !loading && countdown === 0 && (
        <div className="absolute inset-0 z-20 flex flex-col pointer-events-auto">
          <div className="absolute inset-0 bg-gradient-to-b from-[#3a1c0a]/70 via-transparent to-[#120802]/92 pointer-events-none" />

          {/* top bar */}
          <div className="relative px-5 pt-[max(16px,env(safe-area-inset-top))] flex items-start justify-between gap-3 slide-up">
            <div className="flex items-end gap-2.5">
              <LogoMark size={52} />
              <div>
                <h1 className="font-display text-[2.3rem] leading-[0.8] gold-text">VANISKARA</h1>
                <div className="text-amber-200/75 text-[8px] uppercase tracking-[0.28em] font-black mt-1">
                  L'Odyssée de la Vanille
                </div>
              </div>
            </div>
            <div className="panel rounded-xl px-2.5 py-1.5 text-right shrink-0">
              <div className="eyebrow text-amber-200/55">Record</div>
              <div className="font-display text-lg gold-text leading-none tabular-nums">{fmt(save.bestScore)}</div>
            </div>
          </div>

          <div className="flex-1" />

          {/* headline block, deliberately left-aligned over the living scene */}
          <div className="relative px-5 pb-3 max-w-sm slide-up">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-px w-6 bg-amber-400/60" />
              <span className="eyebrow text-amber-300/80">Madagascar · {save.envReached + 1}/6 régions</span>
            </div>
            <h2 className="font-display text-[2.1rem] leading-[0.95] text-[#fff4d6]" style={{ textShadow: '0 3px 0 rgba(50,22,6,0.55), 0 10px 26px rgba(0,0,0,0.6)' }}>
              Courez. Récoltez.<br /><span className="gold-text">Négociez l'or noir.</span>
            </h2>
          </div>

          {/* bottom stack */}
          <div className="relative px-4 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-2">
            <RankCard save={save} />

            {dailyReady ? (
              <DailyCard streak={save.streak} ready={dailyReady} amount={gameRef.current?.dailyRewardAmount ?? 120}
                onClaim={() => { click(); gameRef.current?.claimDaily(); sync(); }} />
            ) : (
              <ChallengeCard icon={ch.icon} name={ch.name} desc={ch.desc} reward={ch.reward}
                done={save.challengeDone} claimed={save.challengeClaimed}
                onClaim={() => { click(); gameRef.current?.claimChallenge(); sync(); }} />
            )}

            <button onClick={handlePlay}
              className="btn-primary rounded-2xl py-3.5 px-5 flex items-center gap-3 w-full text-left">
              <span className="text-2xl leading-none">▶</span>
              <span className="flex-1">
                <span className="block font-display text-2xl leading-none">JOUER</span>
                <span className="block text-[10px] font-black text-[#5c2e0c] mt-0.5">
                  {ch.icon} Défi du jour : {ch.name}
                </span>
              </span>
              <span className="text-lg opacity-70">›</span>
            </button>

            {tab ? (
              <div className="panel-lit rounded-3xl p-4 fade-in flex flex-col" style={{ maxHeight: '46vh' }}>
                <div className="flex items-center justify-between mb-2.5 shrink-0">
                  <h3 className="font-display text-base text-amber-50">
                    {TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-yellow-300 tabular-nums">🪙 {fmt(save.coins)}</span>
                    <button onClick={() => { click(); setTab(null); }}
                      className="btn-secondary rounded-full w-8 h-8 flex items-center justify-center text-sm font-black">✕</button>
                  </div>
                </div>
                <div className="scroll-y pr-1 -mr-1">
                  {tab === 'map' && <WorldMapPanel save={save} />}
                  {tab === 'chars' && (
                    <CharactersPanel save={save}
                      onSelect={(id) => { gameRef.current?.setOutfit(id); sync(); click(); }}
                      onBuy={(id, price) => { gameRef.current?.buyOutfit(id, price); sync(); }}
                      onRotate={(direction) => gameRef.current?.rotateCharacterPreview(direction)} />
                  )}
                  {tab === 'missions' && <MissionsPanel save={save} onClaim={(id) => { click(); gameRef.current?.claimMission(id); sync(); }} />}
                  {tab === 'shop' && <ShopPanel save={save} onBuy={(id: keyof Upgrades, price) => { gameRef.current?.buyUpgrade(id, price); sync(); }} />}
                  {tab === 'trophies' && <AchievementsPanel save={save} />}
                  {tab === 'scores' && <ScoresPanel save={save} />}
                  {tab === 'rivals' && (
                    <RivalBoard
                      board={rivalBoard}
                      playerName={gameRef.current?.playerName || 'Récolteur'}
                      onRename={(name) => {
                        gameRef.current?.setPlayerName(name);
                        sync();
                        refreshBoard();
                        click();
                        setShareNote(`Nom défini : ${name}`);
                        setTimeout(() => setShareNote(null), 2000);
                      }}
                      hasRivals={save.rivals.length > 0}
                      onImport={doImport}
                      onClear={() => { gameRef.current?.clearRivals(); sync(); refreshBoard(); click(); }}
                      onShareFacebook={handlePageFacebookShare}
                      onCopyFacebookPost={handleCopyFacebookPost}
                      onDownloadFacebookBanner={handleDownloadFacebookBanner}
                      fbNote={shareNote}
                    />
                  )}
                  {tab === 'stats' && <StatsPanel save={save} />}
                  {tab === 'settings' && (
                    <SettingsPanel save={save}
                      onToggle={(k, v) => { gameRef.current?.setSetting(k, v); sync(); click(); }}
                      onQuality={(q) => { gameRef.current?.setSetting('quality', q); sync(); click(); }}
                      onReset={() => { if (confirm('Réinitialiser toute la progression ?')) { gameRef.current?.resetProgress(); sync(); } }} />
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => { click(); setTab(t.id); }}
                    className="btn-ghost rounded-xl py-1.5 flex flex-col items-center gap-0.5 active:scale-95 transition">
                    <span className="text-base leading-none">{t.icon}</span>
                    <span className="text-[8px] font-black uppercase tracking-wide text-amber-100/85">{t.label}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="text-center text-[8px] text-amber-200/25 uppercase tracking-[0.22em] font-black">
              v1.0 · Vaniskara Studios
            </div>
          </div>
        </div>
      )}

      {/* ================= INTRO ================= */}
      {intro && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end pointer-events-auto">
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/20 pointer-events-none" />
          <button onClick={skipIntro}
            className="absolute top-[max(14px,env(safe-area-inset-top))] right-4 panel rounded-full px-3.5 py-1.5 text-[10px] font-black text-amber-200 uppercase tracking-widest">
            Passer ›
          </button>
          <div className="relative px-6 pb-[max(26px,env(safe-area-inset-bottom))] w-full max-w-md mx-auto">
            <div key={introStep} className="fade-in mb-4">
              <div className="text-5xl mb-2.5">{INTRO[introStep].icon}</div>
              <div className="panel-lit rounded-2xl p-5">
                <p className="text-amber-50 text-[15px] leading-relaxed">{INTRO[introStep].text}</p>
              </div>
            </div>
            <button onClick={handleIntroNext} className="btn-primary rounded-2xl py-3.5 font-display text-lg w-full">
              {introStep < INTRO.length - 1 ? 'Suivant →' : '🌿 COMMENCER'}
            </button>
            <div className="flex justify-center gap-1.5 mt-3">
              {INTRO.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === introStep ? 'w-7 bg-amber-400' : 'w-3 bg-white/20'}`} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
