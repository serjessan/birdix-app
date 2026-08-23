/* ---------------------------------------------------------------------------
   Dominio · Puntuación Stableford neta y golpes de hándicap por hoyo
   Extraído de App.jsx en /plan-eng-review de D7 (21/23 ago 2026) — esta
   matemática se reutiliza ahora en un camino de código nuevo (las columnas
   derivadas que escribe MatchPlayScreen en match_holes), así que necesitaba
   quedar aislada y probada en vez de vivir como funciones inline sin test.
   No cambia ningún comportamiento respecto al modelo de 1 dispositivo.
   --------------------------------------------------------------------------*/

import { normalizeBirdixHcp } from "./rango";

export const hasStrokeInput = (value) =>
  value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));

/** Tabla estándar de Stableford modificado — BIRDIX_REGLAMENTO.md §2. */
export const calculateStablefordPoints = (netStrokes, par) => {
  const diff = netStrokes - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
};

/** Exportada aparte porque TeamStablefordScreen (2vs2) la llama directamente
 * — cada jugador se compara contra un baselineHcp del equipo, no contra un
 * único rival, así que no le sirve la forma "player vs rival" de
 * getHandicapStrokesForHole. */
export const strokesForIndex = (hcpDiff, strokeIndex) => {
  const diff = Math.max(0, Math.round(hcpDiff));
  const fullRounds = Math.floor(diff / 18);
  const extra = diff % 18;
  return fullRounds + (strokeIndex <= extra ? 1 : 0);
};

/**
 * Golpes de hándicap que recibe cada jugador en un hoyo concreto, según la
 * diferencia de Birdix HCP entre los 2 y el índice de dificultad del hoyo —
 * BIRDIX_REGLAMENTO.md §3.
 */
export const getHandicapStrokesForHole = (playerHcp, rivalHcp, strokeIndex) => {
  const player = normalizeBirdixHcp(playerHcp);
  const rival = normalizeBirdixHcp(rivalHcp);
  if (player === rival) return { player: 0, rival: 0 };
  if (player > rival) return { player: strokesForIndex(player - rival, strokeIndex), rival: 0 };
  return { player: 0, rival: strokesForIndex(rival - player, strokeIndex) };
};
