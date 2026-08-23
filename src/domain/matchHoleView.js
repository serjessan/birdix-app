/* ---------------------------------------------------------------------------
   Dominio · Vista de un hoyo para 2 dispositivos
   Construido en /plan-eng-review de D7 (21/23 ago 2026, T3-T6).

   Normaliza una fila cruda de match_holes (columnas player_a_ / player_b_)
   a la vista "yo/rival" que necesita la pantalla, según de qué lado sea
   cada jugador — y computa los puntos derivados de un hoyo (golpes de hcp,
   neto, Stableford base + efecto de carta) reutilizando exactamente la
   misma matemática ya probada (stableford.js, cards.js) que usaba el
   modelo de 1 dispositivo, no una copia paralela.
   --------------------------------------------------------------------------*/

import { getHandicapStrokesForHole, calculateStablefordPoints, hasStrokeInput } from "./stableford";
import { applyStablefordCardEffect } from "./cards";

const otherSide = (side) => (side === "player_a" ? "player_b" : "player_a");

/**
 * Normaliza una fila de match_holes a la perspectiva de `mySide`.
 *
 * Escudo es la única carta que necesita visibilidad inmediata en vez de
 * esperar a `cards_revealed` (D11 solo cubre las 9 cartas cuyo mecanismo es
 * genuinamente simultáneo/oculto) — su propósito entero es que el rival
 * sepa que está activo ANTES de elegir su propia carta, así que se revela
 * en cuanto se escribe, sin esperar a que ambos confirmen.
 */
export const deriveHoleView = (row, mySide) => {
  const rivalSide = otherSide(mySide);
  const pick = (side, field) => row?.[`${side}_${field}`];
  const myCard = pick(mySide, "card") || null;
  const rivalCardRaw = pick(rivalSide, "card") || null;
  const cardsRevealed = Boolean(row?.cards_revealed) || rivalCardRaw === "shield" || myCard === "shield";

  const sideView = (side, card) => ({
    strokes: pick(side, "strokes"),
    hcpStrokes: pick(side, "hcp_strokes") || 0,
    net: pick(side, "net"),
    stableford: pick(side, "stableford") || 0,
    strokesMarker: pick(side, "strokes_marker"),
    card,
    cardConfirmed: Boolean(pick(side, "card_confirmed")),
    cardApplied: Boolean(pick(side, "card_applied")),
    cardCancelledReason: pick(side, "card_cancelled_reason"),
    holeSubmitted: Boolean(pick(side, "hole_submitted")),
  });

  return {
    holeNumber: row?.hole_number,
    my: sideView(mySide, myCard),
    rival: sideView(rivalSide, cardsRevealed ? rivalCardRaw : null),
    cardsRevealed,
  };
};

/**
 * ¿Ya han decidido los dos su jugada de este hoyo? (Decision 4: confirmaron
 * una carta, o entró el primer golpe sin carta — lo que ocurra primero).
 */
export const bothPlayersDecided = (view) =>
  (view.my.cardConfirmed || view.my.holeSubmitted) && (view.rival.cardConfirmed || view.rival.holeSubmitted);

/**
 * Puntos Stableford base + golpes de hcp para los 2 lados de un hoyo, antes
 * de aplicar efecto de carta — misma fórmula que el modelo de 1 dispositivo
 * (stableford.js), ahora computada para escribirse en match_holes en vez de
 * quedarse en estado local.
 */
export const computeBaseHoleScores = ({ par, strokeIndex, playerAHcp, playerBHcp, playerAStrokes, playerBStrokes }) => {
  const hasA = hasStrokeInput(playerAStrokes);
  const hasB = hasStrokeInput(playerBStrokes);
  const hcp = getHandicapStrokesForHole(playerAHcp, playerBHcp, strokeIndex);
  const netA = hasA ? Number(playerAStrokes) - hcp.player : null;
  const netB = hasB ? Number(playerBStrokes) - hcp.rival : null;
  return {
    playerA: {
      hasScore: hasA,
      hcpStrokes: hcp.player,
      net: netA,
      netDiff: hasA ? netA - par : null,
      base: hasA ? calculateStablefordPoints(netA, par) : 0,
    },
    playerB: {
      hasScore: hasB,
      hcpStrokes: hcp.rival,
      net: netB,
      netDiff: hasB ? netB - par : null,
      base: hasB ? calculateStablefordPoints(netB, par) : 0,
    },
  };
};

/**
 * Puntos Stableford finales de un lado (base + efecto de carta), en el
 * mismo formato {delta,rivalDelta,note} que ya devuelve
 * applyStablefordCardEffect — reutilizada tal cual, sin duplicar la lógica
 * de ninguna carta.
 */
export const applyCardToBaseScore = (card, { base, rivalBase, netDiff, rivalNetDiff, hasScore, rivalHasScore, isBehind, cancelledByBlock, secondShotBase }) =>
  applyStablefordCardEffect(card, {
    playerBase: base,
    rivalBase,
    playerNetDiff: netDiff,
    rivalNetDiff,
    playerHasScore: hasScore,
    rivalHasScore,
    isBehind,
    cancelledByBlock,
    secondShotBase,
  });
