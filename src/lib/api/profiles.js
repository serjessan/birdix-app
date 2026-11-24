/* ---------------------------------------------------------------------------
   Lib API · Clasificación — top de jugadores y puesto propio, datos reales

   Construido en PR-A del /plan-eng-review del 5 nov 2026 (PLAN-EMBUDO.md,
   T3 ampliada). Sustituye a FAKE_TOP, al array `around` inline y al
   `position: 4287` que el propio código marcaba como "posición global
   simulada" — tres fuentes de datos inventados en la pantalla que vende el
   Rango, que es el diferenciador del producto.

   REGLA CENTRAL: un jugador entra en la clasificación cuando ha jugado al
   menos una partida real. A 5 nov 2026 los 5 jugadores registrados están a
   1000 puntos exactos con `real_matches_played = 0`, así que un
   `count(*) where points > mine` daría 0 para todos y los cinco leerían
   "Puesto 1" a la vez. Un nº1 regalado devalúa el Rango, así que sin partidas
   no hay puesto: la pantalla muestra estado vacío.

   ORDEN Y EMPATES: `points desc, created_at asc`. El desempate por
   antigüedad tiene que usarse EN LOS DOS SITIOS — en la lista y en el cálculo
   del puesto — o los dos números se contradicen: la lista pintaría a un
   jugador por encima de otro con los mismos puntos mientras los dos leen el
   mismo número de puesto.
   --------------------------------------------------------------------------*/

import { supabase } from "../supabase";

/** Cuántos jugadores se muestran en el top de la pantalla de Clasificación. */
export const RANKING_TOP_SIZE = 10;

/** Columnas que la Clasificación necesita de `profiles`. Lista explícita: ver PROFILE_COLUMNS en App.jsx. */
const RANKING_COLUMNS = "id, full_name, tag, points, real_matches_played, created_at";

/**
 * Top de jugadores por puntos, solo los que ya han jugado alguna partida real.
 * El índice `idx_profiles_points` ya existe en el esquema.
 *
 * Devuelve [] mientras nadie haya jugado — eso es el estado vacío, no un
 * error: con 5 jugadores se verán 5, y hoy se ven 0. Es honesto y es el gancho
 * de Birdix (el rango es real desde el primer día).
 */
export const listRankedPlayers = async (limit = RANKING_TOP_SIZE) => {
  const { data, error } = await supabase
    .from("profiles")
    .select(RANKING_COLUMNS)
    .gt("real_matches_played", 0)
    .order("points", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
};

/**
 * Mi puesto real en la clasificación, o `null` si todavía no estoy en ella.
 *
 * Cuenta a los jugadores que van estrictamente por delante con el MISMO
 * criterio que `listRankedPlayers`: más puntos, o los mismos puntos y cuenta
 * más antigua. Sin ese segundo término, dos jugadores empatados leerían los
 * dos el mismo puesto mientras la lista los pinta uno encima del otro.
 */
export const getMyRankingPosition = async ({ points, realMatchesPlayed, createdAt }) => {
  if (!realMatchesPlayed || !createdAt) return null;

  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("real_matches_played", 0)
    .or(`points.gt.${points},and(points.eq.${points},created_at.lt.${createdAt})`);
  if (error) throw error;
  return (count || 0) + 1;
};
