/* ---------------------------------------------------------------------------
   Dominio · Rango Birdix y hándicap Birdix
   Funciones puras, sin dependencias de React ni de Supabase — extraídas de
   App.jsx en /plan-eng-review (10 ago 2026) para cerrar la fórmula del Rango
   (Elo estándar) y del hándicap Birdix (margen sobre lo esperado a tu hcp).
   --------------------------------------------------------------------------*/

const K_FACTOR = 32;

export const normalizeHcp = (hcp) => {
  const n = Number(hcp);
  return Math.min(54, Math.max(0, Number.isFinite(n) ? Math.round(n) : 0));
};

export const normalizeBirdixHcp = (hcp) => {
  const n = Number(hcp);
  const safe = Number.isFinite(n) ? n : 18;
  return Math.round(Math.min(36, Math.max(0, safe)) * 10) / 10;
};

export const formatBirdixHcp = (hcp) => normalizeBirdixHcp(hcp).toFixed(1);

export const getProfileBirdixHcp = (profile) => normalizeBirdixHcp(profile?.birdixHcp ?? profile?.hcp ?? 18);

export const getRivalBirdixHcp = (rival) => normalizeBirdixHcp(rival?.birdixHcp ?? rival?.hcp ?? 18);

export const toRankingPoints = (points) =>
  Math.max(0, Math.round(Number.isFinite(Number(points)) ? Number(points) : 0));

/**
 * Rango Birdix — Elo estándar, K=32 fijo, suma cero entre rivales.
 * Empate: sin cambio de rango para ninguno de los dos jugadores (v1).
 */
export const calculateEloDelta = (playerRank, rivalRank, result) => {
  if (result === "draw") return 0;
  const player = toRankingPoints(playerRank);
  const rival = toRankingPoints(rivalRank);
  const expected = 1 / (1 + Math.pow(10, (rival - player) / 400));
  const actual = result === "win" ? 1 : 0;
  return Math.round(K_FACTOR * (actual - expected));
};

/**
 * Wins/losses/streak tras una partida — gana +1 win y corta la racha de
 * derrotas a 0, o al revés; un empate no toca ninguna de las 2 rachas.
 */
export const calculateStreakAfterMatch = (profile, result) => {
  const wins = Number.isFinite(Number(profile?.wins)) ? Number(profile.wins) : 0;
  const losses = Number.isFinite(Number(profile?.losses)) ? Number(profile.losses) : 0;
  const winStreak = Number.isFinite(Number(profile?.winStreak)) ? Number(profile.winStreak) : 0;
  const lossStreak = Number.isFinite(Number(profile?.lossStreak)) ? Number(profile.lossStreak) : 0;
  if (result === "win") return { wins: wins + 1, losses, winStreak: winStreak + 1, lossStreak: 0 };
  if (result === "loss") return { wins, losses: losses + 1, winStreak: 0, lossStreak: lossStreak + 1 };
  return { wins, losses, winStreak, lossStreak };
};

/**
 * Hándicap Birdix tras una partida — se mueve según cuánto superaste (o no)
 * lo esperado a tu propio hcp, no por rachas de victorias/derrotas.
 * Esperado = 2 puntos Stableford netos por hoyo (par neto, tabla del reglamento).
 * Ajuste = (puntos reales − esperados) ÷ 8, signo invertido, tope ±1.5/partida.
 */
export const calculateBirdixHcpAfterMatch = (profile, match) => {
  const current = getProfileBirdixHcp(profile);
  if (!match) return current;
  const holes = match.holes || 9;
  const expected = holes * 2;
  const actual = Number.isFinite(Number(match.playerPoints)) ? Number(match.playerPoints) : expected;
  const margin = actual - expected;
  const adjustment = Math.max(-1.5, Math.min(1.5, -(margin / 8)));
  return normalizeBirdixHcp(current + adjustment);
};
