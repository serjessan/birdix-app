/* ---------------------------------------------------------------------------
   Lib API · Partidas — buscar rival, crear partida, cerrar y actualizar Rango
   Construido en /plan-eng-review de Approach B PR1 (19/23 ago 2026, T5).

   Sustituye a FAKE_RIVALS/FAKE_TOP y a la creación local de partidas en
   App.jsx. La lógica de Elo/hcp/streak sigue viviendo en domain/rango.js
   (DRY, ya probada) — este módulo solo hace de puente con Supabase:
   create_match/apply_match_result son RPCs con privilegio elevado, pero el
   cálculo de los valores que escriben sigue en JS, no duplicado en SQL.
   --------------------------------------------------------------------------*/

import { supabase } from "../supabase";
import {
  calculateEloDelta,
  calculateBirdixHcpCalibration,
  calculateStreakAfterMatch,
  toRankingPoints,
} from "../../domain/rango";

/** Busca rivales por nombre entre los profiles reales (lectura pública). */
export const findRivalCandidates = async (query, { excludeUserId } = {}) => {
  const trimmed = (query || "").trim();
  if (!trimmed) return [];
  let q = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, points, birdix_hcp")
    .ilike("full_name", `%${trimmed}%`)
    .order("full_name")
    .limit(20);
  if (excludeUserId) q = q.neq("id", excludeUserId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
};

/**
 * Crea la partida (matches + match_players + match_holes, atómico vía
 * create_match) y devuelve ya lista para guardar en estado local, incluido
 * el hcp/rango del rival en el momento de crearla — evita que MatchPlayScreen
 * tenga que leer match_players del rival (RLS solo permite tu propia fila
 * hasta que D7 lo arregle).
 */
export const createMatch = async ({ courseId, courseName, rivalId, rivalName, holesCount, selectedCards }) => {
  const { data: matchId, error } = await supabase.rpc("create_match", {
    p_course_id: courseId,
    p_player_b_id: rivalId,
    p_holes_count: holesCount,
    p_selected_cards_a: selectedCards,
  });
  if (error) throw error;

  const context = await getMatchContext(matchId);
  const rival = context.find((c) => c.side === "player_b");

  return {
    id: matchId,
    courseId,
    course: courseName,
    rivalId,
    rivalName,
    rivalRank: toRankingPoints(rival?.points_before ?? 1000),
    rivalBirdixHcp: rival?.birdix_hcp_at_match ?? 18,
    holes: holesCount,
  };
};

/** Ambos lados de match_players (points_before/birdix_hcp_at_match) — solo lo pueden leer jugadores de esa partida. */
export const getMatchContext = async (matchId) => {
  const { data, error } = await supabase.rpc("get_match_context", { p_match_id: matchId });
  if (error) throw error;
  return data;
};

/**
 * Todas las filas de match_holes de una partida, en orden — hidratación
 * inicial de MatchPlayScreen (D7) al entrar en la pantalla; las
 * actualizaciones en vivo llegan luego vía useMatchRealtime, esto solo
 * cubre el progreso que ya existiera antes de que este dispositivo abriera
 * la partida.
 */
export const listMatchHoles = async (matchId) => {
  const { data, error } = await supabase.from("match_holes").select("*").eq("match_id", matchId).order("hole_number");
  if (error) throw error;
  return data;
};

/**
 * Marca que he abierto esta partida por primera vez en este dispositivo —
 * señal de "me he unido" para la sala de espera del creador (D23, 25 ago
 * 2026). El `.is("opened_at", null)` evita pisar el instante real la
 * segunda vez que abro la partida (no falla si no hay fila que actualizar,
 * simplemente no hace nada).
 */
export const markMatchOpened = async ({ matchId, userId }) => {
  const { error } = await supabase
    .from("match_players")
    .update({ opened_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .is("opened_at", null);
  if (error) throw error;
};

/** Estado de unión de los 2 lados de una partida — para que la sala de espera del creador sepa cuándo dejar de esperar. */
export const getMatchPlayersStatus = async (matchId) => {
  const { data, error } = await supabase
    .from("match_players")
    .select("side, user_id, opened_at, deck_confirmed_at")
    .eq("match_id", matchId);
  if (error) throw error;
  return data;
};

/** Cuánto puede quedarse una partida en "active" sin que nadie la termine antes de considerarla abandonada (D24, 27 ago 2026). */
const STALE_ACTIVE_MATCH_MS = 30 * 60 * 1000;

/**
 * Partidas activas donde soy jugador — sin esto, el rival (quien no creó la
 * partida) no tiene forma de descubrirla nunca (D7, gap señalado en el eng
 * review y no resuelto hasta ahora). RLS de `matches` ya filtra a las
 * partidas donde soy creador o jugador, así que no hace falta un .eq extra.
 * Une course/match_players/profiles en una sola consulta (recursos
 * embebidos de PostgREST vía las FK ya existentes en el esquema).
 *
 * Partidas creadas o abiertas que se quedan a medias (nadie termina, nadie
 * vuelve) se filtran a los 30 minutos y ya no cuentan como activas para
 * nadie — best-effort, no bloquea esta llamada si falla. RLS solo deja
 * actualizar `matches` a quien la creó, así que cada dispositivo solo limpia
 * lo que él mismo creó; lo del rival se limpia solo la próxima vez que su
 * propio dispositivo llame a esto.
 */
export const listMyActiveMatches = async (userId) => {
  const cutoffIso = new Date(Date.now() - STALE_ACTIVE_MATCH_MS).toISOString();

  supabase
    .from("matches")
    .update({ status: "abandoned" })
    .eq("status", "active")
    .eq("created_by", userId)
    .lt("started_at", cutoffIso)
    .then(() => {}, () => {});

  const { data, error } = await supabase
    .from("matches")
    .select(`
      id, course_id, status, format, started_at,
      courses ( name, location ),
      match_players ( side, user_id, points_before, birdix_hcp_at_match, profiles ( full_name ) ),
      match_holes ( hole_number ),
      match_player_decks ( user_id, selected_cards )
    `)
    .eq("status", "active")
    .gte("started_at", cutoffIso)
    .order("started_at", { ascending: false });
  if (error) throw error;

  return data
    .map((row) => {
      const me = row.match_players.find((p) => p.user_id === userId);
      const rival = row.match_players.find((p) => p.user_id !== userId);
      if (!me || !rival) return null; // no debería pasar bajo RLS, pero no reventar si pasa
      // D26: RLS de match_player_decks solo deja ver tu propia fila — el
      // embed ya viene sin la del rival, .find() aquí es solo por claridad.
      const myDeck = row.match_player_decks.find((d) => d.user_id === userId);
      return {
        id: row.id,
        courseId: row.course_id,
        course: row.courses?.name,
        holes: row.match_holes.length,
        playerSide: me.side,
        playerBirdixHcp: me.birdix_hcp_at_match,
        rivalId: rival.user_id,
        rivalName: rival.profiles?.full_name || "Rival",
        rivalRank: toRankingPoints(rival.points_before),
        rivalBirdixHcp: rival.birdix_hcp_at_match,
        rivalHcp: rival.birdix_hcp_at_match,
        selectedCards: myDeck?.selected_cards || [],
        matchType: "1v1",
        format: "1 vs 1",
        status: "pending",
        isRealMatch: true,
      };
    })
    .filter(Boolean);
};

/**
 * Historial de partidas reales YA confirmadas (D22, 25 ago 2026) — hasta
 * ahora `state.matches` solo se rellenaba con lo que este mismo dispositivo
 * acababa de terminar (dispatch local en App.jsx), así que un segundo
 * dispositivo — o el mismo tras vaciar/perder localStorage — nunca veía el
 * historial ni el perfil realmente al día, aunque las partidas sí quedaran
 * bien guardadas en Supabase. Se llama al arrancar la app (ver HYDRATE en
 * App.jsx), igual que `listMyActiveMatches` cubre las pendientes.
 *
 * `total_stableford` en match_players nunca se ha escrito desde el cliente
 * (queda a 0), así que los puntos reales de cada lado se recalculan aquí
 * sumando `match_holes.player_a/b_stableford` — la misma fuente de verdad
 * que ya usa `holeSummaries` en vivo dentro de la partida.
 */
export const listMyMatchHistory = async (userId) => {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      id, course_id, status, format, started_at, finished_at, winner_id,
      courses ( name, location ),
      match_players ( side, user_id, points_before, points_after, birdix_hcp_at_match, profiles ( full_name ) ),
      match_holes ( hole_number, player_a_card, player_b_card, player_a_stableford, player_b_stableford )
    `)
    .eq("status", "confirmed")
    .order("finished_at", { ascending: false });
  if (error) throw error;

  return data
    .map((row) => {
      const me = row.match_players.find((p) => p.user_id === userId);
      const rival = row.match_players.find((p) => p.user_id !== userId);
      if (!me || !rival) return null; // no debería pasar bajo RLS, pero no reventar si pasa

      const holes = row.match_holes || [];
      const mySide = me.side;
      const rivalSide = mySide === "player_a" ? "player_b" : "player_a";
      const playerPoints = holes.reduce((sum, h) => sum + (h[`${mySide}_stableford`] || 0), 0);
      const rivalPoints = holes.reduce((sum, h) => sum + (h[`${rivalSide}_stableford`] || 0), 0);
      const cardsUsed = holes.map((h) => h[`${mySide}_card`]).filter(Boolean);
      const result = !row.winner_id ? "draw" : row.winner_id === userId ? "win" : "loss";

      return {
        id: row.id,
        matchType: "1v1",
        format: row.format === "stableford_1v1" ? "1 vs 1" : row.format,
        holes: holes.length,
        courseId: row.course_id,
        course: row.courses?.name || "Campo sin definir",
        date: row.finished_at || row.started_at,
        status: "finished",
        result,
        playerSide: mySide,
        playerHcp: me.birdix_hcp_at_match,
        playerBirdixHcp: me.birdix_hcp_at_match,
        playerPoints,
        rivalId: rival.user_id,
        rivalName: rival.profiles?.full_name || "Rival",
        rivalHcp: rival.birdix_hcp_at_match,
        rivalBirdixHcp: rival.birdix_hcp_at_match,
        rivalPoints,
        rankingDelta: (Number(me.points_after) || 0) - (Number(me.points_before) || 0),
        cardsUsed,
        finishedAt: row.finished_at,
        isRealMatch: true,
      };
    })
    .filter(Boolean);
};

/**
 * Confirma el resultado de esta partida desde tu lado. Cuando ambos
 * jugadores han confirmado, calcula (con rango.js, no en SQL) el nuevo
 * rango/hcp/streak de los 2 y lo aplica vía apply_match_result — gateado
 * por match_confirmations, así que solo se aplica una vez.
 *
 * Usa profiles.points/birdix_hcp/wins/losses EN VIVO (lectura pública) como
 * base del cálculo, no el points_before capturado en match_players al crear
 * la partida — apply_match_result valida la suma cero contra profiles en
 * vivo también, así que el punto de partida tiene que ser el mismo en los
 * dos sitios o la validación puede no cuadrar.
 *
 * playerSide: "player_a" | "player_b" — el lado que eres tú en esta partida.
 */
export const confirmMatchResult = async ({
  matchId,
  userId,
  playerSide,
  holes,
  result, // "win" | "loss" | "draw", desde tu perspectiva
  playerPoints,
  rivalPoints,
}) => {
  const { error: insertError } = await supabase.from("match_confirmations").insert({ match_id: matchId, user_id: userId });
  if (insertError && insertError.code !== "23505") throw insertError; // 23505 = ya habías confirmado, no-op

  const { count, error: countError } = await supabase
    .from("match_confirmations")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId);
  if (countError) throw countError;
  if ((count || 0) < 2) return { applied: false };

  const context = await getMatchContext(matchId);
  const rivalSide = playerSide === "player_a" ? "player_b" : "player_a";
  const rivalCtx = context.find((c) => c.side === rivalSide);
  if (!rivalCtx) return { applied: false };

  const { data: liveProfiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, points, birdix_hcp, wins, losses, win_streak, loss_streak, real_matches_played, pending_hcp_margin")
    .in("id", [userId, rivalCtx.user_id]);
  if (profilesError) throw profilesError;
  const myLive = liveProfiles.find((p) => p.id === userId);
  const rivalLive = liveProfiles.find((p) => p.id === rivalCtx.user_id);
  if (!myLive || !rivalLive) return { applied: false };

  const rivalResult = result === "win" ? "loss" : result === "loss" ? "win" : "draw";
  const myProfileForCalc = {
    birdixHcp: myLive.birdix_hcp,
    wins: myLive.wins,
    losses: myLive.losses,
    winStreak: myLive.win_streak,
    lossStreak: myLive.loss_streak,
    realMatchesPlayed: myLive.real_matches_played,
    pendingHcpMargin: myLive.pending_hcp_margin,
  };
  const rivalProfileForCalc = {
    birdixHcp: rivalLive.birdix_hcp,
    wins: rivalLive.wins,
    losses: rivalLive.losses,
    winStreak: rivalLive.win_streak,
    lossStreak: rivalLive.loss_streak,
    realMatchesPlayed: rivalLive.real_matches_played,
    pendingHcpMargin: rivalLive.pending_hcp_margin,
  };

  const playerDelta = calculateEloDelta(myLive.points, rivalLive.points, result);
  const playerHcpResult = calculateBirdixHcpCalibration(myProfileForCalc, { holes, playerPoints });
  const playerStreak = calculateStreakAfterMatch(myProfileForCalc, result);

  const rivalHcpResult = calculateBirdixHcpCalibration(rivalProfileForCalc, { holes, playerPoints: rivalPoints });
  const rivalStreak = calculateStreakAfterMatch(rivalProfileForCalc, rivalResult);

  const newPointsMe = toRankingPoints(myLive.points + playerDelta);
  const newPointsRival = toRankingPoints(rivalLive.points - playerDelta);

  // Los deltas ya están calculados desde "mi" perspectiva; aquí solo se
  // colocan en las columnas _a/_b correctas según de qué lado soy yo.
  const me = { points: newPointsMe, hcpResult: playerHcpResult, ...playerStreak };
  const rival = { points: newPointsRival, hcpResult: rivalHcpResult, ...rivalStreak };
  const a = playerSide === "player_a" ? me : rival;
  const b = playerSide === "player_a" ? rival : me;

  const { error: applyError } = await supabase.rpc("apply_match_result", {
    p_match_id: matchId,
    p_new_points_a: a.points,
    p_new_points_b: b.points,
    p_new_hcp_a: a.hcpResult.hcp,
    p_new_hcp_b: b.hcpResult.hcp,
    p_new_wins_a: a.wins,
    p_new_losses_a: a.losses,
    p_new_win_streak_a: a.winStreak,
    p_new_loss_streak_a: a.lossStreak,
    p_new_wins_b: b.wins,
    p_new_losses_b: b.losses,
    p_new_win_streak_b: b.winStreak,
    p_new_loss_streak_b: b.lossStreak,
    p_new_real_matches_played_a: a.hcpResult.realMatchesPlayed,
    p_new_pending_hcp_margin_a: a.hcpResult.pendingHcpMargin,
    p_new_real_matches_played_b: b.hcpResult.realMatchesPlayed,
    p_new_pending_hcp_margin_b: b.hcpResult.pendingHcpMargin,
  });
  if (applyError) throw applyError;

  return {
    applied: true,
    newPoints: newPointsMe,
    delta: playerDelta,
    newBirdixHcp: playerHcpResult.hcp,
    hcpCalibrating: playerHcpResult.calibrating,
    realMatchesPlayed: playerHcpResult.realMatchesPlayed,
  };
};

/**
 * Confirma tu mazo para una partida ya creada — el flujo de Player B (D7,
 * T8), cada uno lo elige por su propio dispositivo. Las cartas en sí van a
 * `match_player_decks` (D26, 27 ago 2026: mazo realmente secreto — su RLS
 * solo deja leer tu propia fila, nunca la del rival). `deck_confirmed_at`
 * se queda en `match_players` — no revela qué cartas, solo que ya decidiste,
 * y de eso sí necesita enterarse el rival (sala de espera, cierre de la
 * ventana de elección del hoyo).
 */
export const confirmDeck = async ({ matchId, userId, selectedCards }) => {
  const { error: deckError } = await supabase
    .from("match_player_decks")
    .insert({ match_id: matchId, user_id: userId, selected_cards: selectedCards });
  if (deckError) throw deckError;

  const { error } = await supabase
    .from("match_players")
    .update({ deck_confirmed_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("user_id", userId);
  if (error) throw error;
};
