/* ---------------------------------------------------------------------------
   Lib · Sync de partida — outbox local + reintento automático
   Construido en /plan-eng-review 19 ago 2026 (Architecture Decision 2/3, T2).

   El principio que esto existe para proteger: la partida nunca se bloquea
   por el estado de la conexión. Apuntar un golpe o jugar una carta escribe
   primero en el propio dispositivo — este módulo solo se encarga de la
   parte "e intenta guardarlo en Supabase, reintentando solo si hace falta".
   El estado local de React (lo que ve el jugador en pantalla) lo sigue
   llevando la pantalla que llama a esto; este módulo nunca lo toca.

   Por qué un outbox casero y no una librería de sync offline: cada jugador
   solo escribe sus propios campos en su propia fila de match_holes — nunca
   la del rival — así que no hay conflictos reales que resolver, y un UPDATE
   reenviado con el mismo valor es un no-op. Ponytail: la pieza más simple
   que resuelve el problema real (Decision 2).
   --------------------------------------------------------------------------*/

import { supabase } from "./supabase";

const OUTBOX_KEY = "birdix:match-sync:outbox";
const DEFAULT_RETRY_INTERVAL_MS = 4000;

// Claves actualmente en vuelo hacia Supabase — evita que un doble tap o un
// tick del intervalo solapado con un evento 'online' disparen dos peticiones
// en paralelo para el mismo hoyo (la parte "retry seguro, no duplica" de T2).
const inFlight = new Set();

const outboxKeyFor = (matchId, holeNumber) => `${matchId}:${holeNumber}`;

const readOutbox = () => {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    // localStorage no disponible o JSON corrupto — se trata como vacío en
    // vez de romper la partida por esto.
    return {};
  }
};

const writeOutbox = (outbox) => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    // Cuota llena u otro fallo de localStorage — no bloquea la partida;
    // el intento de guardado en Supabase de esta pasada sigue en marcha,
    // simplemente no queda persistido si falla y hay que reintentar luego.
  }
};

/**
 * Escritura optimista de un hoyo: fusiona `patch` con lo que ya hubiera
 * pendiente para ese hoyo en el outbox (dos llamadas seguidas para el mismo
 * hoyo — doble pulsación en red lenta, o golpes + carta por separado — se
 * combinan en una única entrada, nunca se duplican) y dispara un intento de
 * guardado inmediato. No bloquea: no hace falta esperar a la promesa
 * devuelta para seguir jugando, está pensada para "dispara y olvida",
 * aunque se devuelve por si el caller quiere saber cuándo terminó.
 */
export const queueMatchHoleWrite = ({ matchId, holeNumber, patch }) => {
  if (!matchId || holeNumber == null || !patch || !Object.keys(patch).length) {
    return Promise.resolve();
  }
  const key = outboxKeyFor(matchId, holeNumber);
  const outbox = readOutbox();
  outbox[key] = {
    matchId,
    holeNumber,
    patch: { ...(outbox[key]?.patch || {}), ...patch },
  };
  writeOutbox(outbox);
  return flushKey(key);
};

/** Intenta guardar en Supabase la entrada `key` del outbox, si existe y no está ya en vuelo. */
async function flushKey(key) {
  if (inFlight.has(key)) return;
  const entry = readOutbox()[key];
  if (!entry) return;

  inFlight.add(key);
  try {
    const { data, error } = await supabase
      .from("match_holes")
      .update(entry.patch)
      .eq("match_id", entry.matchId)
      .eq("hole_number", entry.holeNumber)
      .select("hole_number");
    if (error) throw error;
    // Un UPDATE que no coincide con ninguna fila no es un error para
    // PostgREST — se trata igual que un fallo de red y se reintenta,
    // en vez de vaciar el outbox pensando que guardó algo que en
    // realidad nunca llegó a escribirse (D7, D15).
    if (!data || data.length === 0) throw new Error(`match_holes row not found for ${key}`);

    // Se quita del outbox solo lo que se acaba de confirmar guardado — si
    // una escritura nueva llegó para la misma clave mientras esta petición
    // estaba en vuelo, ya quedó fusionada en `entry.patch` antes de partir
    // (todas las llamadas pasan por queueMatchHoleWrite/readOutbox), así
    // que no hay pérdida de datos, solo se reintentaría de más en el peor
    // caso — sin coste real a esta escala (ver Performance Review, T2).
    const latest = readOutbox();
    delete latest[key];
    writeOutbox(latest);
  } catch {
    // Sin cobertura o error del servidor: se queda tal cual en el outbox.
    // El próximo evento 'online' o el siguiente tick del intervalo lo
    // reintenta solo, sin que el jugador tenga que hacer nada (Decision 2).
  } finally {
    inFlight.delete(key);
  }
}

/** Reintenta guardar todo lo que haya pendiente en el outbox ahora mismo. */
export const flushOutbox = () => Promise.all(Object.keys(readOutbox()).map(flushKey));

/** Cuántos hoyos tienen escritura pendiente de confirmar — para un indicador visual (ver DESIGN.md, "Estado de conexión"). */
export const getPendingSyncCount = () => Object.keys(readOutbox()).length;

/**
 * Funde una foto de match_holes recién hidratada por REST (`listMatchHoles`,
 * al montar la pantalla de partida) sobre el estado local ya en pantalla,
 * sin dejar que pise ningún hoyo para el que ya haya llegado un UPDATE de
 * Realtime — ese ya es, por causalidad, al menos tan fresco como la foto
 * REST. Sin esto, en cobertura de campo la hidratación puede tardar más que
 * el push de Realtime y pisar un dato del rival que ya habías visto llegar
 * con uno más viejo (T-investigate 25 ago 2026: causa raíz del "lío al
 * refrescar entre hoyo y hoyo").
 *
 * `realtimeSeenHoles` es un Set de `hole_number` — cualquier estructura con
 * `.has()` sirve (pensado para un `useRef(new Set())` en el componente).
 */
export const mergeHydratedHoles = (prevByHole, rows, realtimeSeenHoles) => {
  const merged = { ...prevByHole };
  rows.forEach((row) => {
    if (realtimeSeenHoles.has(row.hole_number)) return;
    merged[row.hole_number] = row;
  });
  return merged;
};

/**
 * Arranca el ciclo de reintento en segundo plano: reintenta lo que haya
 * quedado pendiente de una sesión anterior (partida cerrada con la app y
 * reabierta — Decision 3), escucha el evento 'online' del navegador, y
 * revisa el outbox cada `intervalMs` mientras la app esté abierta. Un
 * intervalo vacío no cuesta nada — se deja correr sin arrancar/parar según
 * haya o no cola pendiente, es más simple y no hay coste real a esta
 * escala. Llamar una vez al arrancar la app. Devuelve una función para
 * desengancharlo (tests, hot reload).
 */
export const initMatchSync = ({ intervalMs = DEFAULT_RETRY_INTERVAL_MS } = {}) => {
  if (typeof window === "undefined") return () => {};

  flushOutbox();
  const onOnline = () => flushOutbox();
  window.addEventListener("online", onOnline);
  const intervalId = setInterval(flushOutbox, intervalMs);

  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(intervalId);
  };
};
