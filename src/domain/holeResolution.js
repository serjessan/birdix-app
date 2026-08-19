/* ---------------------------------------------------------------------------
   Dominio · Resolución conjunta del hoyo
   Construido en /plan-eng-review 19 ago 2026 (Architecture Decision 4, T4).

   Corregido tras revisión con el fundador: Bloqueo NO es una reacción
   cronometrada tipo "revelar y esperar a ver si cancelan". Es una elección
   más dentro de la misma ventana de "antes de empezar el hoyo" que usan las
   otras 8 cartas de ese grupo. Ambos jugadores eligen su carta del hoyo (o
   ninguna) de forma simultánea/independiente; cuando los dos han elegido
   (o entra el primer golpe del hoyo, lo que ocurra primero) se resuelve
   junto: si alguien jugó una carta y el rival jugó Bloqueo, ambas se anulan
   entre sí — ninguna afecta al resultado, ambos jugadores la dan por
   gastada igual. Sin temporizador, sin condición de carrera por llegada a
   la red — la resolución depende de que ambos hayan elegido, no de quién
   escribió antes.

   Segundo Golpe queda fuera de esta ventana a propósito: es la única carta
   genuinamente posterior al primer golpe, y por regla ("máximo 1 carta por
   hoyo") nadie puede haber jugado ya otra carta de este grupo el mismo
   hoyo — así que para cuando existe un Segundo Golpe que resolver, la
   ventana "antes de empezar el hoyo" ya se cerró sola (entrar el primer
   golpe la cierra). No hay solapamiento real entre las dos, y Segundo
   Golpe se resuelve aparte, sin depender del rival (ver cards.js).

   Framework-free a propósito, igual que cards.js/matchSync.js/
   useMatchRealtime.js: se testea con casos concretos sin Supabase ni React.
   --------------------------------------------------------------------------*/

/**
 * Dado lo que cada jugador ha elegido para el hoyo (una carta, o ninguna) y
 * si esa elección ya está cerrada, decide si toca resolver ya y, si toca,
 * qué carta queda anulada por el Bloqueo del rival.
 *
 * `playerChoiceMade`/`rivalChoiceMade`: true cuando ese jugador ya jugó una
 * carta o ya decidió explícitamente no jugar ninguna este hoyo (confirmado,
 * o porque entró su primer golpe sin haber jugado carta — Decision 4).
 *
 * Devuelve `{ ready: false }` mientras falte alguno de los dos por decidir
 * — nunca hay que esperar con temporizador, solo con estas dos banderas.
 * Cuando `ready` es true, `playerCancelled`/`rivalCancelled` son booleanos
 * listos para pasar como `ctx.cancelledByBlock` a
 * `applyStablefordCardEffect` de cada lado.
 */
export const resolveHoleCards = ({ playerCard, playerChoiceMade, rivalCard, rivalChoiceMade }) => {
  if (!playerChoiceMade || !rivalChoiceMade) {
    return { ready: false, playerCancelled: false, rivalCancelled: false };
  }

  const playerPlayedBlock = playerCard === "block";
  const rivalPlayedBlock = rivalCard === "block";

  return {
    ready: true,
    // Bloqueo sin nada real que cancelar (rival no jugó carta, o el rival
    // también jugó Bloqueo) se gasta igual, pero no anula nada — no hay
    // "doble cancelación" entre dos Bloqueos.
    playerCancelled: rivalPlayedBlock && Boolean(playerCard) && !playerPlayedBlock,
    rivalCancelled: playerPlayedBlock && Boolean(rivalCard) && !rivalPlayedBlock,
  };
};

/**
 * Envoltorio sobre una fila real de `match_holes`. **Interpretación de los
 * campos usada aquí, no verificada todavía contra una partida real** (la
 * pantalla de partida no habla con Supabase todavía — ver TODOS.md): la
 * elección de un jugador para el hoyo se da por cerrada cuando confirmó una
 * carta (`player_x_card_confirmed`) o ya entró su golpe de este hoyo sin
 * haber jugado ninguna (`player_x_hole_submitted`) — coincide con "cuando
 * los dos han elegido, o entra el primer golpe, lo que ocurra primero"
 * (Decision 4). Revisar esta función en cuanto se construya la pantalla de
 * partida real contra Supabase, por si la semántica exacta de estos campos
 * resulta ser otra.
 */
export const resolveMatchHoleRow = (row) => {
  const playerChoiceMade = Boolean(row.player_a_card_confirmed || row.player_a_hole_submitted);
  const rivalChoiceMade = Boolean(row.player_b_card_confirmed || row.player_b_hole_submitted);
  return resolveHoleCards({
    playerCard: row.player_a_card,
    playerChoiceMade,
    rivalCard: row.player_b_card,
    rivalChoiceMade,
  });
};
