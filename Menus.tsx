import { useState } from 'react';
import {
  OUTFITS, UPGRADE_DEFS, ACHIEVEMENTS, MISSIONS, upgradePrice, levelProgress,
  type SaveData, type Upgrades,
} from '../game/save';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

const ENV_LIST = [
  { name: 'Plantation de Vanille', icon: '🌿', need: 0, desc: 'Treillis de bois, lianes et fleurs blanches', tint: '#e8c89a' },
  { name: 'Forêt Tropicale', icon: '🌴', need: 1, desc: 'Vegetation dense, cascades, rivières', tint: '#7fc98f' },
  { name: 'Vallée des Baobabs', icon: '🌅', need: 2, desc: 'Terre rouge et géants millénaires', tint: '#ff9c56' },
  { name: 'Région Montagneuse', icon: '⛰️', need: 3, desc: 'Falaises, ponts de corde et brume', tint: '#a9bcc9' },
  { name: 'Côte de Madagascar', icon: '🏝️', need: 4, desc: 'Sable clair, pirogues, eau turquoise', tint: '#7fd8e8' },
  { name: 'Île Mystère', icon: '🔮', need: 5, desc: 'Lucioles, cristaux et gardiens anciens', tint: '#b98fe0' },
];

function Reward({ n, small }: { n: number; small?: boolean }) {
  return (
    <span className={`whitespace-nowrap font-black text-yellow-300 ${small ? 'text-[10px]' : 'text-xs'}`}>
      🪙 {fmt(n)}
    </span>
  );
}

/* ================= Rank / XP ================= */
export function RankCard({ save }: { save: SaveData }) {
  const lp = levelProgress(save.xp);
  return (
    <div className="panel-lit rounded-2xl p-3 flex items-center gap-3">
      <div className="relative shrink-0 w-14 h-14">
        <svg viewBox="0 0 40 40" className="w-14 h-14 -rotate-90">
          <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="5" />
          <circle cx="20" cy="20" r="17" fill="none" stroke={lp.rank.color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(lp.pct / 100) * 106.8} 106.8`} style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.8,.3,1)' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xl">{lp.rank.icon}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-lg leading-none text-white">Niv. {lp.level}</span>
          <span className="text-[11px] font-black truncate" style={{ color: lp.rank.color }}>{lp.rank.name}</span>
        </div>
        <div className="xp-track mt-1.5">
          <div className="xp-fill" style={{ width: `${lp.pct}%` }} />
        </div>
        <div className="text-[9px] text-amber-200/60 mt-1 font-bold tabular-nums">
          {fmt(lp.into)} / {fmt(lp.need)} XP · {fmt(save.coins)} pièces
        </div>
      </div>
    </div>
  );
}

/* ================= Daily gift ================= */
export function DailyCard({
  streak, ready, amount, onClaim,
}: { streak: number; ready: boolean; amount: number; onClaim: () => void }) {
  return (
    <div className={`rounded-2xl p-3 border ${ready ? 'panel-lit' : 'panel'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`text-2xl ${ready ? 'sway' : 'opacity-50'}`}>🎁</span>
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm text-white leading-none">Coffret du jour</div>
          <div className="text-[10px] text-amber-200/70 mt-0.5">
            {ready ? <>Ouvre-le pour <b className="text-yellow-300">+{fmt(amount)} 🪙</b></> : <>Déjà ouvert — reviens demain</>}
          </div>
        </div>
        {ready ? (
          <button onClick={onClaim} className="btn-primary rounded-xl px-3 py-2 text-xs font-black shrink-0 ready-ring">
            Ouvrir
          </button>
        ) : (
          <span className="text-[10px] font-black text-green-400 shrink-0">✓</span>
        )}
      </div>
      <div className="flex gap-1 mt-2.5">
        {Array.from({ length: 7 }).map((_, i) => {
          const day = i + 1;
          const got = day <= streak;
          return (
            <div key={day}
              className={`flex-1 rounded-lg py-1 text-center text-[9px] font-black border ${
                got ? 'bg-amber-500/25 border-amber-400/70 text-amber-100' : 'bg-black/30 border-white/10 text-amber-200/40'
              }`}>
              J{day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Daily challenge ================= */
export function ChallengeCard({
  icon, name, desc, reward, done, claimed, onClaim,
}: { icon: string; name: string; desc: string; reward: number; done: boolean; claimed: boolean; onClaim: () => void }) {
  return (
    <div className={`rounded-2xl p-3 border flex items-center gap-2.5 ${
      claimed ? 'panel opacity-70' : done ? 'panel-lit' : 'panel'
    }`}>
      <span className="text-2xl shrink-0">{done && !claimed ? '🏅' : icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] eyebrow text-amber-300/70">Défi du jour</div>
        <div className="font-display text-sm text-white leading-tight truncate">{name}</div>
        <div className="text-[10px] text-amber-200/60 truncate">{desc}</div>
      </div>
      {claimed ? (
        <span className="text-[10px] font-black text-amber-300/70 shrink-0">Réclamé</span>
      ) : done ? (
        <button onClick={onClaim} className="btn-primary rounded-xl px-3 py-2 text-xs font-black shrink-0 ready-ring">
          <Reward n={reward} />
        </button>
      ) : (
        <Reward n={reward} small />
      )}
    </div>
  );
}

/* ================= World map ================= */
export function WorldMapPanel({ save }: { save: SaveData }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-amber-200/60">
        Chaque course traverse les régions dans l'ordre, de la plantation à l'Île Mystère.
      </p>
      {ENV_LIST.map((e, i) => {
        const reached = save.envReached >= e.need;
        return (
          <div key={e.name} className="flex items-stretch gap-2.5">
            <div className="flex flex-col items-center pt-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: reached ? e.tint : 'rgba(255,255,255,0.2)' }} />
              {i < ENV_LIST.length - 1 && <span className="flex-1 w-px my-0.5" style={{ background: reached ? 'rgba(255,200,90,0.4)' : 'rgba(255,255,255,0.1)' }} />}
            </div>
            <div className={`flex-1 rounded-xl p-2.5 border mb-0.5 flex items-center gap-3 ${
              reached ? 'bg-amber-900/30 border-amber-500/45' : 'bg-black/30 border-white/10 opacity-60'
            }`}>
              <span className="text-2xl shrink-0">{reached ? e.icon : '🔒'}</span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm truncate" style={{ color: reached ? e.tint : 'rgba(245,230,200,0.6)' }}>{e.name}</div>
                <div className="text-[10px] text-amber-200/55 truncate">{e.desc}</div>
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider text-amber-200/50 shrink-0">
                {reached ? 'Ouverte' : `Zone ${i + 1}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Characters ================= */
export function CharactersPanel({
  save, onSelect, onBuy, onRotate,
}: {
  save: SaveData;
  onSelect: (id: string) => void;
  onBuy: (id: string, price: number) => void;
  onRotate: (direction: number) => void;
}) {
  const activeOutfit = OUTFITS.find(o => o.id === save.outfit) || OUTFITS[0];
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-amber-400/40 bg-black/25 p-3 text-center">
        <div className="eyebrow text-amber-300/70">Aperçu 3D en direct</div>
        <div className="font-display text-base text-amber-50 mt-1">{activeOutfit.name}</div>
        <div className="text-[10px] text-green-300/80 mt-0.5">✦ {activeOutfit.perk}</div>
        <div className="flex justify-center gap-2 mt-2">
          <button onClick={() => onRotate(-1)}
            className="btn-secondary rounded-full w-10 h-8 flex items-center justify-center font-black"
            aria-label="Tourner le personnage vers la gauche">↶</button>
          <span className="rounded-full px-3 py-1.5 bg-amber-500/15 border border-amber-400/30 text-[9px] font-black text-amber-200">
            SOCLE VANISKARA
          </span>
          <button onClick={() => onRotate(1)}
            className="btn-secondary rounded-full w-10 h-8 flex items-center justify-center font-black"
            aria-label="Tourner le personnage vers la droite">↷</button>
        </div>
      </div>
      {OUTFITS.map(o => {
        const owned = save.outfits.includes(o.id);
        const active = save.outfit === o.id;
        const afford = save.coins >= o.price;
        return (
          <div key={o.id} className={`rounded-xl p-2.5 border flex items-center gap-3 ${
            active ? 'bg-amber-600/25 border-amber-400/80' : owned ? 'bg-black/30 border-amber-700/50' : 'bg-black/30 border-white/10'
          }`}>
            <span className="text-2xl shrink-0" style={{ filter: owned ? 'none' : 'grayscale(1)' }}>{owned ? o.icon : '🔒'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm text-amber-50 truncate">{o.name}</div>
              <div className="text-[10px] text-amber-200/60 truncate">{o.desc}</div>
              <div className="text-[10px] font-bold text-green-300/85 truncate">✦ {o.perk}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              {o.colors && [o.colors.shirt, o.colors.hat, o.colors.pants].map((c, i) => (
                <span key={i} className="w-2.5 h-6 rounded-full border border-black/40"
                  style={{ background: `#${c.toString(16).padStart(6, '0')}`, opacity: owned ? 1 : 0.35 }} />
              ))}
            </div>
            {active ? (
              <span className="text-[10px] font-black text-amber-200 shrink-0">PORTÉ</span>
            ) : owned ? (
              <button onClick={() => onSelect(o.id)} className="btn-secondary rounded-lg px-3 py-1.5 text-[11px] font-black shrink-0">Porter</button>
            ) : (
              <button onClick={() => afford && onBuy(o.id, o.price)} disabled={!afford}
                className={`rounded-lg px-2.5 py-1.5 shrink-0 ${afford ? 'btn-primary' : 'btn-secondary opacity-50'}`}>
                <Reward n={o.price} small />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================= Shop ================= */
export function ShopPanel({ save, onBuy }: { save: SaveData; onBuy: (id: keyof Upgrades, price: number) => void }) {
  return (
    <div className="space-y-2">
      {UPGRADE_DEFS.map(def => {
        const lvl = save.upgrades[def.id];
        const maxed = lvl >= def.max;
        const price = upgradePrice(def, lvl);
        const afford = save.coins >= price;
        return (
          <div key={def.id} className="rounded-xl p-2.5 border border-amber-700/40 bg-black/30">
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">{def.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm text-amber-50 truncate">{def.name}</div>
                <div className="text-[10px] text-amber-200/60 truncate">{def.desc}</div>
              </div>
              {maxed ? (
                <span className="text-[10px] font-black text-amber-300 shrink-0">MAX</span>
              ) : (
                <button onClick={() => afford && onBuy(def.id, price)} disabled={!afford}
                  className={`rounded-lg px-2.5 py-1.5 shrink-0 ${afford ? 'btn-primary' : 'btn-secondary opacity-50'}`}>
                  <Reward n={price} small />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              {Array.from({ length: def.max }).map((_, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${i < lvl ? 'bg-gradient-to-r from-amber-400 to-yellow-200' : 'bg-white/10'}`} />
              ))}
              <span className="text-[10px] font-black text-amber-200/70 w-11 text-right tabular-nums">{def.valueLabel(lvl)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Missions ================= */
export function MissionsPanel({ save, onClaim }: { save: SaveData; onClaim: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {MISSIONS.map(m => {
        const cur = m.progress(save);
        const pct = Math.min(100, (cur / m.goal) * 100);
        const complete = pct >= 100;
        const claimed = save.claimedMissions.includes(m.id);
        return (
          <div key={m.id} className={`rounded-xl p-2.5 border ${
            claimed ? 'bg-black/25 border-white/10 opacity-65' : complete ? 'bg-green-900/30 border-green-400/60' : 'bg-black/30 border-amber-700/40'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-base">{claimed ? '✅' : m.icon}</span>
              <span className="text-xs font-bold text-amber-50 flex-1 truncate">{m.label}</span>
              <span className="text-[8px] uppercase tracking-widest font-black text-amber-300/60">{m.cadence === 'day' ? 'Jour' : m.cadence === 'week' ? 'Semaine' : 'À vie'}</span>
              {claimed ? null : complete ? (
                <button onClick={() => onClaim(m.id)} className="btn-primary rounded-lg px-2.5 py-1 text-[10px] font-black ready-ring shrink-0">
                  Réclamer
                </button>
              ) : (
                <Reward n={m.reward} small />
              )}
            </div>
            <div className="h-1.5 rounded-full bg-black/50 overflow-hidden mt-2">
              <div className={`h-full ${complete ? 'bg-green-400' : 'bg-gradient-to-r from-amber-500 to-yellow-200'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[9px] text-amber-200/55 mt-1 text-right tabular-nums">
              {fmt(Math.min(cur, m.goal))} / {fmt(m.goal)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Achievements ================= */
export function AchievementsPanel({ save }: { save: SaveData }) {
  const done = save.achievements.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-black text-amber-200/70 uppercase tracking-wider">
        <span>Débloqués</span><span className="tabular-nums">{done} / {ACHIEVEMENTS.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden mb-1">
        <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-200" style={{ width: `${(done / ACHIEVEMENTS.length) * 100}%` }} />
      </div>
      {ACHIEVEMENTS.map(a => {
        const unlocked = save.achievements.includes(a.id);
        return (
          <div key={a.id} className={`rounded-xl p-2.5 border flex items-center gap-3 ${
            unlocked ? 'bg-amber-900/30 border-amber-400/45' : 'bg-black/30 border-white/10 opacity-60'
          }`}>
            <span className="text-xl shrink-0">{unlocked ? a.icon : '🔒'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-xs text-amber-50 truncate">{a.name}</div>
              <div className="text-[10px] text-amber-200/60 truncate">{a.desc}</div>
            </div>
            <span className="text-[10px] font-black text-yellow-300/80 shrink-0 tabular-nums">+{a.reward}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Rival leaderboard & Facebook Page Kit ================= */
export function RivalBoard({
  board, playerName, onRename, onImport, onClear, hasRivals,
  onShareFacebook, onCopyFacebookPost, onDownloadFacebookBanner, fbNote,
}: {
  board: Array<{ who: 'you' | 'rival'; name: string; score: number; vanilla: number; golden: number; distance: number; date: number }>;
  playerName: string;
  onRename: (name: string) => void;
  onImport: (code: string) => void;
  onClear: () => void;
  hasRivals: boolean;
  onShareFacebook: () => void;
  onCopyFacebookPost: () => void;
  onDownloadFacebookBanner: () => void;
  fbNote: string | null;
}) {
  const [code, setCode] = useState('');
  const [nameInput, setNameInput] = useState(playerName === 'Récolteur' ? '' : playerName);

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    // Accept a bare code or a full share link (?r= or #r=).
    const m = /[#&?]r=([^&\s#]+)/.exec(trimmed);
    onImport(m ? m[1] : trimmed);
    setCode('');
  };

  const saveName = () => {
    onRename(nameInput.trim() || 'Vaniskara');
  };

  return (
    <div className="space-y-2.5">
      {/* Facebook Page Kit */}
      <div className="rounded-2xl p-3 bg-black/35 border border-amber-500/45">
        <div className="flex items-center justify-between mb-1">
          <span className="eyebrow text-amber-300/85">📘 Publier sur ma Page Facebook</span>
          <span className="text-[9px] font-black text-amber-200/60">1200×630 · Open Graph</span>
        </div>
        <p className="text-[10px] text-amber-100/75 leading-relaxed mb-1.5">
          Partagez le lien du jeu ou votre record sur votre Page Facebook : vos abonnés jouent en 1 clic et voient votre score à battre.
        </p>
        <div className="text-[9px] text-amber-200/55 leading-snug mb-2 bg-black/35 rounded-lg px-2 py-1.5 border border-amber-700/30">
          <b className="text-amber-100">Déroulé :</b> 📝 Copier post → 🖼️ Bannière → ouvrir Facebook → <b className="text-amber-100">coller</b> dans la création de publication de votre Page.
          <br />Le bouton 📘 ouvre l'aperçu de partage sur votre fil <i>personnel</i> (Facebook n'autorise pas d'auto-post sur les Pages).
        </div>
        {/* Player / Page name */}
        <div className="flex gap-1.5 mb-2">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
            placeholder="Nom affiché (ex. Vaniskara Officiel)"
            maxLength={18}
            className="flex-1 min-w-0 rounded-xl bg-black/45 border border-amber-700/50 px-2.5 py-1.5 text-[11px] text-amber-50 placeholder:text-amber-200/35 outline-none focus:border-amber-400/70"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
          />
          <button onClick={saveName} className="btn-secondary rounded-xl px-2.5 py-1.5 text-[10px] font-black shrink-0">
            Nom ✓
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={onShareFacebook} className="btn-primary rounded-xl py-2 px-2 text-[10px] font-black flex items-center justify-center gap-1">
            📘 Facebook
          </button>
          <button onClick={onCopyFacebookPost} className="btn-secondary rounded-xl py-2 px-2 text-[10px] font-black flex items-center justify-center gap-1">
            📝 Copier post
          </button>
          <button onClick={onDownloadFacebookBanner} className="btn-secondary rounded-xl py-2 px-2 text-[10px] font-black flex items-center justify-center gap-1">
            🖼️ Bannière
          </button>
        </div>
        {fbNote && (
          <div className="text-center text-[10px] font-black text-green-300 mt-2 fade-in">{fbNote}</div>
        )}
      </div>

      {/* import a friend's run */}
      <div className="rounded-2xl p-3 bg-black/30 border border-amber-700/40">
        <div className="eyebrow text-amber-300/70 mb-1">Importer un défi</div>
        <p className="text-[10px] text-amber-200/60 mb-2">
          Collez le code ou le lien Facebook d'un ami : sa course rejoint votre classement.
        </p>
        <div className="flex gap-1.5">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="Code ou lien de partage…"
            className="flex-1 min-w-0 rounded-xl bg-black/45 border border-amber-700/50 px-3 py-2 text-[11px] text-amber-50 placeholder:text-amber-200/30 outline-none focus:border-amber-400/70"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
            spellCheck={false}
            autoComplete="off"
          />
          <button onClick={submit} className="btn-primary rounded-xl px-3 py-2 text-[11px] font-black shrink-0">
            Ajouter
          </button>
        </div>
      </div>

      {hasRivals && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black text-amber-200/60 uppercase tracking-wider">
            {board.filter(b => b.who === 'rival').length} rival{board.filter(b => b.who === 'rival').length > 1 ? 'aux' : ''}
          </span>
          <button onClick={onClear} className="text-[10px] font-bold text-red-300/70 active:scale-95">
            Vider les rivaux
          </button>
        </div>
      )}

      {!board.length ? (
        <div className="text-center text-amber-200/55 text-xs py-4">
          🌿 Aucune récolte enregistrée.<br />Lancez une course ou importez un défi ci-dessus.
        </div>
      ) : (
        board.map((e, i) => (
          <div key={`${e.who}-${e.score}-${i}`}
            className={`rounded-xl px-2.5 py-2 border flex items-center gap-2.5 ${
              e.who === 'you' ? 'bg-amber-600/25 border-amber-400/70' : 'bg-black/30 border-red-400/35'
            }`}>
            <span className="w-6 text-center font-display text-sm text-amber-300 shrink-0">{i + 1}</span>
            <span className="text-base shrink-0">{e.who === 'you' ? '🧑‍🌾' : '⚔️'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-black text-sm text-white leading-tight tabular-nums">
                {fmt(e.score)}
              </div>
              <div className="text-[10px] text-amber-200/60 truncate">
                {e.who === 'you' ? playerName : e.name} · 🍦 {e.vanilla} · 🌟 {e.golden} · {fmt(e.distance)} m
              </div>
            </div>
            {i === 0 && <span className="text-lg shrink-0">🥇</span>}
          </div>
        ))
      )}
    </div>
  );
}

/* ================= High scores ================= */
export function ScoresPanel({ save }: { save: SaveData }) {
  if (!save.scores.length) {
    return (
      <div className="text-center text-amber-200/55 text-xs py-8">
        🌿 Aucune récolte enregistrée.<br />Lancez votre première course.
      </div>
    );
  }
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div className="space-y-1.5">
      {save.scores.map((s, i) => (
        <div key={`${s.date}-${i}`}
          className={`rounded-xl px-2.5 py-2 border flex items-center gap-2.5 ${
            i === 0 ? 'bg-amber-600/25 border-amber-400/70' : 'bg-black/30 border-amber-700/30'
          }`}>
          <span className="w-6 text-center font-display text-sm text-amber-300 shrink-0">{medal[i] || i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="font-black text-sm text-white leading-tight tabular-nums">{fmt(s.score)}</div>
            <div className="text-[10px] text-amber-200/60 truncate">🍦 {s.vanilla} · 🌟 {s.golden} · {fmt(s.distance)} m</div>
          </div>
          <span className="text-[9px] text-amber-200/40 shrink-0">
            {new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ================= Stats ================= */
export function StatsPanel({ save }: { save: SaveData }) {
  const rows = [
    { label: 'Courses', value: fmt(save.totalRuns), icon: '🏃' },
    { label: 'Record', value: fmt(save.bestScore), icon: '🏆' },
    { label: 'Gousses', value: fmt(save.totalVanilla), icon: '🍦' },
    { label: 'Dorées', value: fmt(save.totalGolden), icon: '🌟' },
    { label: 'Distance totale', value: `${fmt(save.totalDistance)} m`, icon: '🗺️' },
    { label: 'Meilleur run', value: `${fmt(save.bestDistance)} m`, icon: '👟' },
    { label: 'Combo max', value: `${fmt(save.bestCombo)}`, icon: '🔥' },
    { label: 'Gardiens apaisés', value: fmt(save.totalBosses), icon: '🐾' },
    { label: 'Courses parfaites', value: fmt(save.perfectRuns), icon: '💎' },
    { label: 'Régions vues', value: `${save.envReached + 1} / 6`, icon: '📍' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(r => (
        <div key={r.label} className="rounded-xl p-2.5 bg-black/30 border border-amber-700/30">
          <div className="text-base leading-none">{r.icon}</div>
          <div className="font-display text-base text-amber-50 leading-tight mt-1 tabular-nums">{r.value}</div>
          <div className="text-[9px] uppercase tracking-wide text-amber-200/55 font-bold">{r.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ================= Settings ================= */
export function SettingsPanel({
  save, onToggle, onQuality, onReset,
}: {
  save: SaveData;
  onToggle: (
    k: 'sfx' | 'music' | 'haptics' | 'reducedMotion' | 'reducedFlashes' | 'highContrast' | 'largeText',
    v: boolean
  ) => void;
  onQuality: (q: 'low' | 'high') => void;
  onReset: () => void;
}) {
  const Row = ({ label, icon, on, onClick }: { label: string; icon: string; on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between bg-black/30 border border-amber-700/30 rounded-xl px-3 py-2.5 active:scale-[0.99] transition">
      <span className="text-xs font-bold text-amber-50 flex items-center gap-2"><span className="text-base">{icon}</span>{label}</span>
      <span className={`w-11 h-6 rounded-full transition-colors relative ${on ? 'bg-amber-500' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
  return (
    <div className="space-y-2">
      <Row label="Effets sonores" icon="🔊" on={save.settings.sfx} onClick={() => onToggle('sfx', !save.settings.sfx)} />
      <Row label="Musique & ambiance" icon="🎵" on={save.settings.music} onClick={() => onToggle('music', !save.settings.music)} />
      <Row label="Vibrations" icon="📳" on={save.settings.haptics} onClick={() => onToggle('haptics', !save.settings.haptics)} />
      <div className="gold-rule my-2" />
      <div className="eyebrow text-amber-300/70 px-1">Accessibilité</div>
      <Row label="Mouvements réduits" icon="🫧" on={save.settings.reducedMotion}
        onClick={() => onToggle('reducedMotion', !save.settings.reducedMotion)} />
      <Row label="Flashs atténués" icon="🌙" on={save.settings.reducedFlashes}
        onClick={() => onToggle('reducedFlashes', !save.settings.reducedFlashes)} />
      <Row label="Contraste renforcé" icon="◐" on={save.settings.highContrast}
        onClick={() => onToggle('highContrast', !save.settings.highContrast)} />
      <Row label="Texte agrandi" icon="A+" on={save.settings.largeText}
        onClick={() => onToggle('largeText', !save.settings.largeText)} />
      <div className="bg-black/30 border border-amber-700/30 rounded-xl px-3 py-2.5">
        <div className="text-xs font-bold text-amber-50 mb-2 flex items-center gap-2"><span className="text-base">🎨</span>Qualité graphique</div>
        <div className="flex gap-2">
          {(['low', 'high'] as const).map(q => (
            <button key={q} onClick={() => onQuality(q)}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-black ${save.settings.quality === q ? 'btn-primary' : 'btn-secondary'}`}>
              {q === 'low' ? 'Performance' : 'Beauté'}
            </button>
          ))}
        </div>
      </div>
      <div className="wood border border-amber-700/40 rounded-xl px-3 py-2.5 text-[11px] text-amber-100/85 leading-relaxed">
        <div className="font-display text-xs text-amber-200 mb-1">🎮 Commandes</div>
        Glisser ← → : changer de couloir<br />
        Glisser ↑ (ou tap haut) : sauter<br />
        Glisser ↓ : glisser sous les branches<br />
        Toucher : déclencher l'Élan de Vanille<br />
        <span className="text-amber-200/60">Clavier — Flèches / QSD · Entrée : élan · Échap : pause</span>
      </div>
      <button onClick={onReset} className="w-full rounded-xl py-2.5 text-[11px] font-black bg-red-950/60 border border-red-700/50 text-red-200 active:scale-95 transition">
        ⚠️ Réinitialiser la progression
      </button>
    </div>
  );
}
