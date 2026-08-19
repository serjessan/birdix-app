/* ---------------------------------------------------------------------------
   Dominio · Las 10 cartas de Birdix
   Extraído de App.jsx en /plan-eng-review (10 ago 2026). Punto Limpio y Bajo
   Presión se eliminaron del reglamento el 10 de agosto — quedan 10 cartas,
   no 12. Ver BIRDIX_REGLAMENTO.md para el detalle completo de cada una.
   --------------------------------------------------------------------------*/

import { RefreshCcw, CircleSlash, Shield, Zap, Hand, CheckCircle2, Ban, Gift, Rewind } from "lucide-react";

export const CARDS = [
  {
    id: "second-shot",
    name: "Segundo Golpe",
    short: "Repites un golpe.",
    desc: "Justo después de hacer un golpe puedes repetirlo. El segundo cuenta como definitivo, aunque sea peor.",
    type: "Reacción",
    icon: RefreshCcw,
    accent: "bg-[#E6F4ED] text-[#00703a] border-[#00703a]/30",
    chip: "bg-[#00703a]",
  },
  {
    id: "block",
    name: "Bloqueo",
    short: "Cancelas una carta rival.",
    desc: "Inmediatamente después de que el rival revele una carta, la anulas. Solo cancela esa carta concreta.",
    type: "Defensa",
    icon: CircleSlash,
    accent: "bg-[#FBEAE3] text-[#A8543F] border-[#D67560]/30",
    chip: "bg-[#D67560]",
  },
  {
    id: "shield",
    name: "Escudo",
    short: "Te proteges un hoyo.",
    desc: "Antes de empezar el hoyo. El rival no puede usar cartas contra ti durante todo ese hoyo.",
    type: "Defensa",
    icon: Shield,
    accent: "bg-sky-50 text-sky-700 border-sky-200",
    chip: "bg-sky-600",
  },
  {
    id: "double",
    name: "Todo o Nada",
    short: "Duplicas tus puntos.",
    desc: "Antes de empezar el hoyo. Duplica tus puntos Stableford netos de ese hoyo.",
    type: "Ofensiva",
    icon: Zap,
    accent: "bg-amber-50 text-amber-700 border-amber-200",
    chip: "bg-amber-500",
  },
  {
    id: "steal",
    name: "Roba Punto",
    short: "Robas 1 punto.",
    desc: "Antes de empezar el hoyo. Si haces más puntos que el rival en el hoyo, le robas 1 punto.",
    type: "Ofensiva",
    icon: Hand,
    accent: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    chip: "bg-fuchsia-600",
  },
  {
    id: "safe-hole",
    name: "Hoyo Seguro",
    short: "Mínimo 1 punto.",
    desc: "Antes de empezar el hoyo. Si haces 0 puntos, recibes 1 punto. Si haces más de 0, no añade extra.",
    type: "Defensa",
    icon: CheckCircle2,
    accent: "bg-[#E6F4ED] text-[#00703a] border-[#00703a]/30",
    chip: "bg-[#00703a]",
  },
  {
    id: "no-driver",
    name: "Driver Prohibido",
    short: "El rival sin driver.",
    desc: "Antes del golpe de salida del rival. Solo afecta a su primer golpe del hoyo.",
    type: "Sabotaje",
    icon: Ban,
    accent: "bg-[#FBEAE3] text-[#A8543F] border-[#D67560]/30",
    chip: "bg-[#D67560]",
  },
  {
    id: "no-club",
    name: "Palo Prohibido",
    short: "Eliges un palo prohibido.",
    desc: "Antes de empezar el hoyo. No puedes prohibir el putter. Dura solo un hoyo.",
    type: "Sabotaje",
    icon: Ban,
    accent: "bg-[#FBEAE3] text-[#A8543F] border-[#D67560]/30",
    chip: "bg-[#D67560]",
  },
  {
    id: "birdix-prize",
    name: "Premio Birdix",
    short: "Bonus por birdie.",
    desc: "Antes de empezar el hoyo. +2 si haces birdie. +3 si haces eagle o mejor.",
    type: "Ofensiva",
    icon: Gift,
    accent: "bg-amber-50 text-amber-700 border-amber-200",
    chip: "bg-amber-500",
  },
  {
    id: "comeback",
    name: "Remontada",
    short: "+2 si remontas.",
    desc: "Antes de empezar el hoyo, solo si vas perdiendo en el total. Si ganas ese hoyo concreto al rival: +2 puntos.",
    type: "Ofensiva",
    icon: Rewind,
    accent: "bg-violet-50 text-violet-700 border-violet-200",
    chip: "bg-violet-600",
  },
];

/** Cartas cuyo efecto necesita elegir a quién de los rivales afecta (2vs2). */
export const cardNeedsTarget = (cardId) => ["steal", "no-driver", "no-club", "block"].includes(cardId);

/**
 * ¿Se puede seleccionar esta carta ahora mismo?
 *
 * - `ctx.alreadyPlayedThisHole`: máximo 1 carta por hoyo, sin excepción —
 *   incluye a las cartas de reacción (Segundo Golpe, Bloqueo). Bloquea
 *   cualquier carta, sin importar cuál. Ver BIRDIX_REGLAMENTO.md §6.
 * - `ctx.rivalShieldActive`: el rival tiene Escudo activo este hoyo — no
 *   puede jugarse ninguna carta contra él. Extendido en /plan-eng-review
 *   19 ago 2026 (Architecture Decision 4, T1): Escudo se resuelve aquí, en
 *   selección, no como anulación posterior de efecto — así el rival nunca
 *   llega a `applyStablefordCardEffect` con una carta que no iba a contar.
 * - Remontada: solo se puede jugar si vas perdiendo en puntos acumulados
 *   hasta ese hoyo (sin cambios).
 */
export const isCardPlayable = (card, ctx = {}) => {
  if (!card) return false;
  if (ctx.alreadyPlayedThisHole) return false;
  if (ctx.rivalShieldActive) return false;
  if (card.id === "comeback") return Boolean(ctx.isBehind);
  return true;
};

/**
 * Efecto en puntos Stableford de una carta jugada en un hoyo (1vs1).
 *
 * Driver Prohibido y Palo Prohibido siguen sin efecto de puntos — se
 * registran (qué carta, en qué hoyo) sin lógica de targeting real, honor
 * system en el campo, hasta que haya Supabase Realtime (ver TODOS.md).
 *
 * Escudo, Bloqueo y Segundo Golpe SÍ tienen efecto real desde
 * /plan-eng-review 19 ago 2026 (Architecture Decision 4, T1):
 * - Escudo nunca llega hasta aquí — se bloquea en `isCardPlayable` antes de
 *   que el rival pueda seleccionar una carta, así que su carta jamás se
 *   resuelve como jugada.
 * - Bloqueo no tiene delta propio (sigue siendo "sin efecto de puntos" en
 *   el switch de abajo), pero anula la carta contraria: quien orquesta la
 *   resolución conjunta del hoyo (T4) pasa `ctx.cancelledByBlock = true` al
 *   resolver esa carta rival — ninguna de las dos cuenta, ambas se dan por
 *   gastadas igual (BIRDIX_REGLAMENTO.md §6, "De reacción").
 * - Segundo Golpe repite el golpe y el segundo cuenta como definitivo,
 *   incluso si sale peor — se expresa como la diferencia de puntos entre
 *   el golpe repetido (`ctx.secondShotBase`, ya calculado por quien llama,
 *   igual que `playerBase`) y el golpe original.
 */
export const applyStablefordCardEffect = (card, ctx) => {
  if (!card) return { delta: 0, rivalDelta: 0, note: null };
  if (ctx.cancelledByBlock) return { delta: 0, rivalDelta: 0, note: `${card.name}: anulada por Bloqueo rival` };
  if (!ctx.playerHasScore) return { delta: 0, rivalDelta: 0, note: `${card.name}: introduce golpes` };
  switch (card.id) {
    case "double":
      return ctx.playerBase > 0
        ? { delta: ctx.playerBase, rivalDelta: 0, note: "Todo o Nada: puntos x2" }
        : { delta: 0, rivalDelta: 0, note: "Todo o Nada: sin puntos que duplicar" };
    case "steal":
      return ctx.rivalHasScore && ctx.playerBase > ctx.rivalBase
        ? { delta: 1, rivalDelta: -1, note: "Roba Punto: +1 / rival -1" }
        : { delta: 0, rivalDelta: 0, note: "Roba Punto: no activa" };
    case "safe-hole":
      return ctx.playerBase === 0 ? { delta: 1, rivalDelta: 0, note: "Hoyo Seguro: +1" } : { delta: 0, rivalDelta: 0, note: "Hoyo Seguro: ya sumas" };
    case "birdix-prize":
      if (ctx.playerNetDiff <= -2) return { delta: 3, rivalDelta: 0, note: "Premio Birdix: +3" };
      if (ctx.playerNetDiff === -1) return { delta: 2, rivalDelta: 0, note: "Premio Birdix: +2" };
      return { delta: 0, rivalDelta: 0, note: "Premio Birdix: sin birdie neto" };
    case "comeback":
      return ctx.rivalHasScore && ctx.isBehind && ctx.playerBase > ctx.rivalBase
        ? { delta: 2, rivalDelta: 0, note: "Remontada: +2" }
        : { delta: 0, rivalDelta: 0, note: "Remontada: no activa" };
    case "second-shot":
      if (ctx.secondShotBase == null) return { delta: 0, rivalDelta: 0, note: "Segundo Golpe: pendiente de repetir el golpe" };
      return { delta: ctx.secondShotBase - ctx.playerBase, rivalDelta: 0, note: "Segundo Golpe: el golpe repetido cuenta como definitivo" };
    default:
      return { delta: 0, rivalDelta: 0, note: `${card.name}: sin efecto de puntos` };
  }
};
