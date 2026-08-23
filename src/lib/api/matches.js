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
  calculateBirdixHcpAfterMatch,
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
 * Partidas activas donde soy jugador — sin esto, el rival (quien no creó la
 * partida) no tiene forma de descubrirla nunca (D7, gap señalado en el eng
 * review y no resuelto hasta ahora). RLS de `matches` ya filtra a las
 * partidas donde soy creador o jugador, así que no hace falta un .eq extra.
 * Une course/match_players/profiles en una sola consulta (recursos
 * embebidos de PostgREST vía las FK ya existentes en el esquema).
 */
export const listMyActiveMatches = async (userId) => {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      id, course_id, status, format, started_at,
      courses ( name, location ),
      match_players ( side, user_id, points_before, birdix_hcp_at_match, selected_cards, profiles ( full_name ) ),
      match_holes ( hole_number )
    `)
    .eq("status", "active")
    .order("started_at", { ascending: false });
  if (error) throw error;

  return data
    .map((row) => {
      const me = row.match_players.find((p) => p.user_id === userId);
      const rival = row.match_players.find((p) => p.user_id !== userId);
      if (!me || !rival) return null; // no debería pasar bajo RLS, pero no reventar si pasa
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
        selectedCards: me.selected_cards || [],
        matchType: "1v1",
        format: "1 vs 1",
        status: "pending",
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
    .select("id, points, birdix_hcp, wins, losses, win_streak, loss_streak")
    .in("id", [userId, rivalCtx.user_id]);
  if (profilesError) throw profilesError;
  const myLive = liveProfiles.find((p) => p.id === userId);
  const rivalLive = liveProfiles.find((p) => p.id === rivalCtx.user_id);
  if (!myLive || !rivalLive) return { applied: false };

  const rivalResult = result === "win" ? "loss" : result === "loss" ? "win" : "draw";
  const myProfileForCalc = { birdixHcp: myLive.birdix_hcp, wins: myLive.wins, losses: myLive.losses, winStreak: myLive.win_streak, lossStreak: myLive.loss_streak };
  const rivalProfileForCalc = { birdixHcp: rivalLive.birdix_hcp, wins: rivalLive.wins, losses: rivalLive.losses, winStreak: rivalLive.win_streak, lossStreak: rivalLive.loss_streak };

  const playerDelta = calculateEloDelta(myLive.points, rivalLive.points, result);
  const playerNewHcp = calculateBirdixHcpAfterMatch(myProfileForCalc, { holes, playerPoints });
  const playerStreak = calculateStreakAfterMatch(myProfileForCalc, result);

  const rivalNewHcp = calculateBirdixHcpAfterMatch(rivalProfileForCalc, { holes, playerPoints: rivalPoints });
  const rivalStreak = calculateStreakAfterMatch(rivalProfileForCalc, rivalResult);

  const newPointsMe = toRankingPoints(myLive.points + playerDelta);
  const newPointsRival = toRankingPoints(rivalLive.points - playerDelta);

  // Los deltas ya están calculados desde "mi" perspectiva; aquí solo se
  // colocan en las columnas _a/_b correctas según de qué lado soy yo.
  const me = { points: newPointsMe, hcp: playerNewHcp, ...playerStreak };
  const rival = { points: newPointsRival, hcp: rivalNewHcp, ...rivalStreak };
  const a = playerSide === "player_a" ? me : rival;
  const b = playerSide === "player_a" ? rival : me;

  const { error: applyError } = await supabase.rpc("apply_match_result", {
    p_match_id: matchId,
    p_new_points_a: a.points,
    p_new_points_b: b.points,
    p_new_hcp_a: a.hcp,
    p_new_hcp_b: b.hcp,
    p_new_wins_a: a.wins,
    p_new_losses_a: a.losses,
    p_new_win_streak_a: a.winStreak,
    p_new_loss_streak_a: a.lossStreak,
    p_new_wins_b: b.wins,
    p_new_losses_b: b.losses,
    p_new_win_streak_b: b.winStreak,
    p_new_loss_streak_b: b.lossStreak,
  });
  if (applyError) throw applyError;

  return { applied: true, newPoints: newPointsMe, delta: playerDelta, newBirdixHcp: playerNewHcp };
};

/**
 * Confirma tu mazo para una partida ya creada — el flujo de Player B (D7,
 * T8): el mazo es visible al rival (D9) pero cada uno lo elige por su
 * propio dispositivo. RLS de match_players ya permite a cada jugador
 * escribir su propia fila (PR1 D3), sin necesitar ningún RPC.
 */
export const confirmDeck = async ({ matchId, userId, selectedCards }) => {
  const { error } = await supabase
    .from("match_players")
    .update({ selected_cards: selectedCards, deck_confirmed_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("user_id", userId);
  if (error) throw error;
};
