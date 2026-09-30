// ============================================================
// VANISKARA — Run sharing & rival leaderboard
//
// A true global leaderboard needs a mutable shared document, and no
// keyless CORS-enabled service offers one (verified: GitHub Gists,
// GitLab, Bitbucket, JSONBin, JSONBlob, npoint and JSONStorage all
// require a key; dpaste / haste / sourceb.in are append-only).
//
// So sharing works peer-to-peer instead:
//   • a run is packed into a compact URL-safe code
//   • opening that link imports the run as a "rival" entry
//   • rivals sit alongside your own scores in the leaderboard
// Everything is offline-safe and needs no backend.
// ============================================================

import type { RunSummary } from './save';

/** What travels inside a share code. */
export interface SharedRun {
  /** Display name the sender chose. */
  n: string;
  s: number;   // score
  v: number;   // vanilla pods
  g: number;   // golden pods
  d: number;   // distance (m)
  c: number;   // best combo chain
  b: number;   // guardians calmed
  m: number;   // multiplier reached
  /** Region index the run reached. */
  e: number;
  /** Clean run (no damage). */
  f: boolean;
  /** Epoch ms, used only for tie-breaking/display. */
  t: number;
  /** Encoding version, so old links keep working. */
  k: 1;
}

const REGION_NAMES = [
  'Plantation de Vanille', 'Forêt Tropicale', 'Vallée des Baobabs',
  'Région Montagneuse', 'Côte de Madagascar', 'Île Mystère',
];

export function regionName(i: number) {
  return REGION_NAMES[Math.max(0, Math.min(REGION_NAMES.length - 1, i | 0))];
}

// ------------------------------------------------------------
// Base64url codec (UTF-8 safe, no padding, URL fragment safe)
// ------------------------------------------------------------
function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeJson(value: unknown): string {
  return toB64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(text: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(fromB64Url(text))) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/** Pack a finished run into a share code. */
export function encodeRun(run: RunSummary, name: string): string {
  const payload: SharedRun = {
    n: (name || 'Récolteur').slice(0, 18),
    s: Math.max(0, Math.floor(run.score)),
    v: Math.max(0, Math.floor(run.vanilla)),
    g: Math.max(0, Math.floor(run.golden)),
    d: Math.max(0, Math.floor(run.distance)),
    c: Math.max(0, Math.floor(run.maxCombo)),
    b: Math.max(0, Math.floor(run.bossesBeaten)),
    m: Math.max(1, Math.floor(run.multiplier)),
    e: Math.max(0, Math.min(5, Math.floor(run.envReached))),
    f: !!run.noHit,
    t: Date.now(),
    k: 1,
  };
  return encodeJson(payload);
}

/** Turn a code into a run. Returns null for anything malformed. */
export function decodeRun(code: string): SharedRun | null {
  if (!code || code.length > 4000) return null;
  const raw = decodeJson<Partial<SharedRun>>(code.trim());
  if (!raw || typeof raw !== 'object') return null;

  const num = (v: unknown, max = 99_999_999) =>
    typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;

  // Reject anything that is not a recognisable payload rather than
  // silently importing garbage into someone's leaderboard.
  if (!num(raw.s, 500_000_000) && !num(raw.d, 100_000)) return null;

  return {
    n: (typeof raw.n === 'string' && raw.n.trim() ? raw.n.trim() : 'Récolteur').slice(0, 18),
    s: num(raw.s, 500_000_000),
    v: num(raw.v, 1_000_000),
    g: num(raw.g, 1_000_000),
    d: num(raw.d, 500_000),
    c: num(raw.c, 1_000_000),
    b: num(raw.b, 999),
    m: Math.max(1, num(raw.m, 50)),
    e: num(raw.e, 5),
    f: raw.f === true,
    t: num(raw.t, 4_102_444_800_000) || Date.now(),
    k: 1,
  };
}

/**
 * Build the link you hand to a friend or post on Facebook.
 * Uses `?r=` (preserved by Facebook's sharer & l.facebook.com redirect)
 * plus `#r=` as a fallback for static/local file hosts.
 */
export function buildShareUrl(code: string): string {
  const base = typeof location !== 'undefined'
    ? `${location.origin}${location.pathname}`
    : 'https://vaniskara.game/';
  return `${base}?r=${code}#r=${code}`;
}

/** Public game URL without any specific run code attached. */
export function getPublicGameUrl(): string {
  return typeof location !== 'undefined'
    ? `${location.origin}${location.pathname}`
    : 'https://vaniskara.game/';
}

/** Read `?r=...` or `#r=...` from the current address bar. */
export function readCodeFromUrl(): string | null {
  try {
    const search = location.search || '';
    const q = /[?&]r=([^&#]+)/.exec(search);
    if (q) return decodeURIComponent(q[1]);
    const hash = location.hash || '';
    if (!hash) return null;
    const m = /[#&]r=([^&]+)/.exec(hash);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Remove the share parameter once consumed, so a refresh doesn't re-import. */
export function clearCodeFromUrl() {
  try {
    if (!location.hash && !/[?&]r=/.test(location.search || '')) return;
    const params = new URLSearchParams(location.search || '');
    params.delete('r');
    const cleanSearch = params.toString();
    history.replaceState(null, '', location.pathname + (cleanSearch ? `?${cleanSearch}` : ''));
  } catch {}
}

/**
 * Build the Facebook Sharer URL.
 *
 * NOTE: only `u=` is honoured — Meta officially deprecated the `quote`
 * parameter (it is silently ignored now), so the caption must be pasted
 * by the author. We therefore expose `?quote=` off by default rather than
 * pretending the text arrives pre-filled.
 */
export function buildFacebookShareUrl(targetUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(targetUrl)}`;
}

/** Generate ready-to-paste copy for a Facebook Page post or personal challenge. */
export function buildFacebookPagePost(opts: {
  url: string;
  score?: number;
  distance?: number;
  vanilla?: number;
  golden?: number;
  playerName?: string;
}): string {
  if (opts.score && opts.score > 0) {
    const name = opts.playerName || 'Vaniskara';
    return [
      `🌿 Défi VANISKARA – L'Odyssée de la Vanille !`,
      `🏆 ${name} vient de réaliser ${opts.score.toLocaleString('fr-FR')} points (${(opts.distance || 0).toLocaleString('fr-FR')} m parcourus · 🍦 ${opts.vanilla || 0} gousses · 🌟 ${opts.golden || 0} dorées) !`,
      ``,
      `👉 Cliquez sur le lien pour relever le défi directement dans votre navigateur (mobile & PC) :`,
      opts.url,
      ``,
      `#Vaniskara #VanilleDeMadagascar #Madagascar #JeuMobile #OdysséeDeLaVanille`,
    ].join('\n');
  }
  return [
    `🌿 Découvrez VANISKARA – L'Odyssée de la Vanille !`,
    `Courez au cœur des plantations de Madagascar, récoltez les précieuses gousses dorées, évitez les obstacles et apaisez les Gardiens dans notre jeu d'aventure 3D gratuit ! 🇲🇬✨`,
    ``,
    `🎮 Jouez instantanément sur smartphone ou ordinateur (sans téléchargement) :`,
    opts.url,
    ``,
    `Qui fera le meilleur score de la communauté ? Partagez votre carte de récolte en commentaire ! 👇`,
    `#Vaniskara #VanilleDeMadagascar #Madagascar #JeuGratuit`,
  ].join('\n');
}

export function isSharedRun(v: unknown): v is SharedRun {
  return !!v && typeof v === 'object' && typeof (v as SharedRun).s === 'number';
}

// ------------------------------------------------------------
// Score card (canvas → PNG)
// ------------------------------------------------------------

const CARD_W = 1080;
const CARD_H = 1350;

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function flowerMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // Five-petal vanilla flower — the brand mark, drawn as vectors.
  const petal = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  petal.addColorStop(0, '#fff3cf');
  petal.addColorStop(0.55, '#ffb340');
  petal.addColorStop(1, '#a8500a');
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i / 5) * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.62, r * 0.34, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#3a1e0d';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd97a';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Renders a social-media-ready score card. Drawn entirely with canvas
 * primitives so the bundle stays asset-free.
 */
export function renderScoreCard(run: SharedRun, rankLabel: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  // --- backdrop ---
  const sky = ctx.createLinearGradient(0, 0, 0, CARD_H);
  sky.addColorStop(0, '#4a2812');
  sky.addColorStop(0.42, '#20100a');
  sky.addColorStop(1, '#0c0604');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // warm sunset glow
  const glow = ctx.createRadialGradient(CARD_W * 0.5, CARD_H * 0.28, 40, CARD_W * 0.5, CARD_H * 0.28, CARD_W * 0.8);
  glow.addColorStop(0, 'rgba(255,150,40,0.30)');
  glow.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // --- panel ---
  const P = 60;
  rounded(ctx, P, P, CARD_W - P * 2, CARD_H - P * 2, 46);
  ctx.fillStyle = 'rgba(30,15,8,0.86)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,200,90,0.55)';
  ctx.stroke();

  ctx.textAlign = 'center';

  // --- brand ---
  flowerMark(ctx, CARD_W / 2, 200, 54);
  ctx.fillStyle = '#ffb340';
  ctx.font = '900 74px Georgia, serif';
  ctx.fillText('VANISKARA', CARD_W / 2, 320);
  ctx.fillStyle = 'rgba(245,230,200,0.6)';
  ctx.font = '700 25px Trebuchet MS, sans-serif';
  ctx.fillText("L ' O D Y S S É E   D E   L A   V A N I L L E", CARD_W / 2, 362);

  ctx.strokeStyle = 'rgba(255,200,90,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CARD_W * 0.24, 400);
  ctx.lineTo(CARD_W * 0.76, 400);
  ctx.stroke();

  // --- headline score ---
  ctx.fillStyle = '#fff4d6';
  ctx.font = '900 62px Georgia, serif';
  ctx.fillText(run.f ? 'RÉCOLTE PARFAITE' : 'FIN DE RÉCOLTE', CARD_W / 2, 478);

  ctx.fillStyle = '#fff4d6';
  ctx.font = '900 168px Georgia, serif';
  ctx.fillText(run.s.toLocaleString('fr-FR'), CARD_W / 2, 648);
  ctx.fillStyle = 'rgba(255,200,90,0.75)';
  ctx.font = '700 27px Trebuchet MS, sans-serif';
  ctx.fillText('P O I N T S', CARD_W / 2, 694);

  // --- stat grid ---
  const stats: Array<[string, string]> = [
    ['🍦', `${run.v}`],
    ['🌟', `${run.g}`],
    ['🧭', `${run.d.toLocaleString('fr-FR')} m`],
    ['🔥', `x${run.m}`],
    ['🐾', `${run.b}`],
    ['⚡', `${run.c}`],
  ];
  const cols = 3;
  const cellW = (CARD_W - P * 2 - 60) / cols;
  const rowY = 790;
  const rowH = 148;
  stats.forEach((st, i) => {
    const cx = P + 30 + (i % cols) * cellW + cellW / 2;
    const cy = rowY + Math.floor(i / cols) * rowH;
    rounded(ctx, cx - cellW / 2 + 12, cy, cellW - 24, rowH - 28, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(180,118,52,0.4)';
    ctx.stroke();
    ctx.font = '40px serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(st[0], cx, cy + 48);
    ctx.font = '900 46px Trebuchet MS, sans-serif';
    ctx.fillStyle = '#f5e6c8';
    ctx.fillText(st[1], cx, cy + 100);
  });

  // --- footer: player, region, rank ---
  const footY = 1140;
  ctx.font = '700 30px Trebuchet MS, sans-serif';
  ctx.fillStyle = 'rgba(245,230,200,0.72)';
  ctx.fillText(`${run.n}  ·  ${regionName(run.e)}`, CARD_W / 2, footY);

  ctx.font = '900 32px Georgia, serif';
  ctx.fillStyle = '#ffb340';
  ctx.fillText(rankLabel, CARD_W / 2, footY + 52);

  ctx.font = '700 22px Trebuchet MS, sans-serif';
  ctx.fillStyle = 'rgba(245,230,200,0.38)';
  ctx.fillText('vaniskara.game  ·  Madagascar', CARD_W / 2, footY + 106);

  return canvas;
}

/**
 * Renders a 1200×630 landscape banner tailored for a Facebook Page post
 * or Open Graph preview card.
 */
export function renderFacebookBanner(bestScore = 0, playerName = 'Vaniskara'): HTMLCanvasElement {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Warm Madagascar sunset sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#4a2410');
  sky.addColorStop(0.5, '#8c4318');
  sky.addColorStop(0.82, '#e08a2e');
  sky.addColorStop(1, '#241108');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Golden sun glow
  const sun = ctx.createRadialGradient(W * 0.76, H * 0.42, 20, W * 0.76, H * 0.42, 340);
  sun.addColorStop(0, 'rgba(255,243,207,0.85)');
  sun.addColorStop(0.4, 'rgba(255,185,64,0.38)');
  sun.addColorStop(1, 'rgba(255,140,20,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  // Horizon hills + baobab silhouettes on the right
  ctx.fillStyle = 'rgba(32,14,7,0.88)';
  ctx.fillRect(0, H - 96, W, 96);

  const drawBaobab = (bx: number, by: number, scale: number) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(28,12,6,0.92)';
    ctx.fillRect(-22, -170, 44, 170);
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
      ctx.beginPath();
      ctx.ellipse(Math.sin(a) * 58, -185 - Math.cos(a) * 18, 46, 22, a * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  drawBaobab(980, H - 90, 1.05);
  drawBaobab(1095, H - 90, 0.72);
  drawBaobab(865, H - 90, 0.62);

  // Left main card frame
  rounded(ctx, 42, 42, W - 84, H - 84, 34);
  ctx.fillStyle = 'rgba(26,13,7,0.76)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,205,102,0.58)';
  ctx.stroke();

  // Brand flower + title
  flowerMark(ctx, 138, 145, 48);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd97a';
  ctx.font = '900 72px Georgia, serif';
  ctx.fillText('VANISKARA', 210, 154);

  ctx.fillStyle = 'rgba(245,230,200,0.82)';
  ctx.font = '700 24px Trebuchet MS, sans-serif';
  ctx.fillText("L ' O D Y S S É E   D E   L A   V A N I L L E   ·   M A D A G A S C A R", 214, 192);

  // Headline pitch
  ctx.fillStyle = '#fff4d6';
  ctx.font = '900 44px Georgia, serif';
  ctx.fillText('Courez. Récoltez. Négociez l’or noir.', 88, 285);

  ctx.fillStyle = 'rgba(245,230,200,0.85)';
  ctx.font = '600 25px Trebuchet MS, sans-serif';
  ctx.fillText('🌿 6 régions malgaches   ·   🐾 3 Gardiens   ·   ✨ Défis entre amis', 88, 336);

  // Score challenge badge if available
  if (bestScore > 0) {
    rounded(ctx, 88, 372, 690, 74, 20);
    ctx.fillStyle = 'rgba(255,179,64,0.16)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,217,122,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#ffd97a';
    ctx.font = '900 28px Trebuchet MS, sans-serif';
    ctx.fillText(`🏆 Record à battre (${playerName}) : ${bestScore.toLocaleString('fr-FR')} pts`, 114, 419);
  }

  // CTA button pill
  const ctaY = bestScore > 0 ? 472 : 415;
  rounded(ctx, 88, ctaY, 540, 74, 37);
  const ctaGrad = ctx.createLinearGradient(88, ctaY, 628, ctaY + 74);
  ctaGrad.addColorStop(0, '#ffc256');
  ctaGrad.addColorStop(1, '#c46a00');
  ctx.fillStyle = ctaGrad;
  ctx.fill();
  ctx.fillStyle = '#2d1810';
  ctx.font = '900 28px Trebuchet MS, sans-serif';
  ctx.fillText('▶ JOUER GRATUITEMENT (MOBILE & PC)', 120, ctaY + 47);

  return canvas;
}

/** Offer the native share sheet when available, else download the PNG. */
export async function shareCard(
  canvas: HTMLCanvasElement,
  text: string
): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/png', 0.92));

  if (!blob) return 'failed';
  const file = new File([blob], 'vaniskara.png', { type: 'image/png' });

  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], text, title: 'VANISKARA' });
      return 'shared';
    } catch {
      // user dismissed the sheet — fall through to download
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaniskara-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** Copy helper that works without the clipboard API (falls back to a textarea). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
