/* ---------------------------------------------------------------------------
   Hook · Realtime de partida — Postgres Changes sobre match_holes
   Construido en /plan-eng-review 19 ago 2026 (Architecture Decision 1, T3).

   Se suscribe a match_holes vía Supabase Postgres Changes en vez de un canal
   Broadcast aparte — match_holes ya es la fuente de verdad única (ciclo
   revelar → confirmar → aplicar por carta y por hoyo), así que un segundo
   canal solo introduciría dos caminos de escritura que pueden desincronizarse
   (Decision 1). Layer 1: built-in de Supabase, sin infra nueva.

   `subscribeToMatchHoles` es framework-free a propósito — igual que
   cards.js/matchSync.js, así se testea con casos concretos sin necesitar
   jsdom. `useMatchRealtime` es solo el envoltorio de React encima.
   --------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const DEFAULT_RECONNECT_DELAY_MS = 2000;

/**
 * Se suscribe a los UPDATE de match_holes de una partida concreta y se
 * reconecta sola si el canal cae — nunca deja de escuchar en silencio
 * (el gap abierto del eng review: "qué ve el jugador si la suscripción se
 * cae" se responde en `onStatusChange`, que alimenta el indicador de
 * "Estado de conexión" de DESIGN.md).
 *
 * - `onChange(payload)` — se llama con cada UPDATE de match_holes de esta
 *   partida (el payload de Supabase Realtime, con `new`/`old`).
 * - `onStatusChange('connected' | 'reconnecting')` — arranca optimista
 *   ('connected' solo se confirma al primer 'SUBSCRIBED'; el estado inicial
 *   antes de eso no se anuncia, igual que el punto del indicador: invisible
 *   por defecto).
 * - `client` — inyectable para tests; por defecto el cliente real de Supabase.
 *
 * Devuelve una función para desuscribirse por completo (limpieza al
 * desmontar): quita el canal actual y cancela cualquier reconexión
 * pendiente, para no acumular listeners ni reconectar después de irse de
 * la pantalla (ver Performance Review, T3).
 */
export const subscribeToMatchHoles = ({
  matchId,
  onChange,
  onStatusChange = () => {},
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  client = supabase,
}) => {
  let channel = null;
  let reconnectTimer = null;
  let stopped = false;

  const connect = () => {
    channel = client
      .channel(`match_holes:${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "match_holes", filter: `match_id=eq.${matchId}` },
        (payload) => {
          if (!stopped) onChange(payload);
        }
      )
      .subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") {
          onStatusChange("connected");
          return;
        }
        // CHANNEL_ERROR / TIMED_OUT / CLOSED: el canal cayó. El socket de
        // Supabase se reconecta solo por debajo, pero un canal ya suscrito
        // no se re-suscribe solo — hay que tirarlo y crear uno nuevo.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          onStatusChange("reconnecting");
          scheduleReconnect();
        }
      });
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    if (channel) client.removeChannel(channel);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped) connect();
    }, reconnectDelayMs);
  };

  connect();

  return () => {
    if (stopped) return; // idempotente — un doble desmontaje no reintenta quitar el canal
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (channel) client.removeChannel(channel);
  };
};

/**
 * Envoltorio de React sobre `subscribeToMatchHoles`. `onChange` se guarda en
 * un ref para que pasar una función inline distinta en cada render no
 * fuerce una resuscripción — el efecto solo depende de `matchId`.
 */
export const useMatchRealtime = (matchId, { onChange } = {}) => {
  const [status, setStatus] = useState("connected");
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!matchId) return undefined;
    return subscribeToMatchHoles({
      matchId,
      onChange: (payload) => onChangeRef.current?.(payload),
      onStatusChange: setStatus,
    });
  }, [matchId]);

  return { status };
};
