import React, { useState, useReducer, useEffect, useMemo, useRef } from "react";
import {
  Home,
  Swords,
  Layers,
  Trophy,
  User,
  ArrowRight,
  ArrowLeft,
  Plus,
  Eye,
  EyeOff,
  Check,
  X,
  Flag,
  Sparkles,
  Crown,
  TrendingUp,
  TrendingDown,
  Minus,
  Lock,
  Mail,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Star,
  Award,
  Calendar,
  Users,
  Clock,
  AlertCircle,
  CircleDot,
  Search,
  Info,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import {
  normalizeHcp,
  normalizeBirdixHcp,
  formatBirdixHcp,
  getProfileBirdixHcp,
  getRivalBirdixHcp,
  toRankingPoints,
  calculateEloDelta,
  calculateBirdixHcpAfterMatch,
  REAL_HCP_CALIBRATION_MATCHES,
} from "./domain/rango";
import { CARDS, applyStablefordCardEffect, isCardPlayable, cardNeedsTarget } from "./domain/cards";
import { hasStrokeInput, calculateStablefordPoints, getHandicapStrokesForHole, strokesForIndex } from "./domain/stableford";
import { resolveHoleCards } from "./domain/holeResolution";
import { deriveHoleView, bothPlayersDecided, computeBaseHoleScores, applyCardToBaseScore } from "./domain/matchHoleView";
import {
  findRivalCandidates,
  createMatch as createMatchApi,
  confirmMatchResult,
  listMatchHoles,
  listMyActiveMatches,
  listMyMatchHistory,
  confirmDeck,
  markMatchOpened,
  getMatchPlayersStatus,
} from "./lib/api/matches";
import { listCourses } from "./lib/api/courses";
import { queueMatchHoleWrite, mergeHydratedHoles } from "./lib/matchSync";
import { useMatchRealtime } from "./hooks/useMatchRealtime";

// Orden de grupos en la pantalla de selección de mazo (D18, /design-consultation
// 25 ago 2026) — por tamaño de grupo, para que el primer bloque que vea el
// jugador tenga más opciones donde elegir.
const CARD_GROUP_ORDER = ["Ofensiva", "Defensa", "Sabotaje", "Reacción"];

/* =========================================================================
   BIRDIX · Prototipo frontend
   Mobile-first · React + Tailwind (clases core) · lucide-react
   Archivo único · default export · sin props requeridas

   Sistema visual: dirección Pulse + identidad real (verde Birdix #00703a,
   Open Sans, lockup con golfistas). Documentado en branding/sistema-visual.md
   ========================================================================= */

/* ---------------------------------------------------------------------------
   0 · TOKENS DEL SISTEMA VISUAL BIRDIX
   Cualquier cambio de marca en color o tipografía empieza aquí.
   --------------------------------------------------------------------------*/

const BX = {
  // Verde Birdix
  green: "#00703a",
  greenDark: "#014F2A",
  greenLight: "#2D8E5C",
  greenFill: "#E6F4ED",
  // Coral (golfistas del lockup)
  coral: "#D67560",
  coralDark: "#A8543F",
  coralFill: "#FBEAE3",
  // Neutros
  ink: "#111827",
  graphite: "#1F2937",
  slate: "#6B7280",
  mist: "#9CA3AF",
  border: "#E5E7EB",
  surface: "#FFFFFF",
  bg: "#F9FAFB",
  bgStrong: "#F3F4F6",
  // Divisiones (cada una con su color de marca)
  bronce: "#92400E",
  plata: "#6B7280",
  oro: "#CA8A04",
  platino: "#0E7490",
  elite: "#7C3AED",
  leyenda: "#00703a",
};

// Rutas a los lockups oficiales. Si el proyecto vive en /public,
// estos paths se resuelven solos. Para Vite / CRA / Next que necesiten
// import explícito, sustituir por: import logoWordmark from '../branding/logos/...'
const LOGOS = {
  isotipo: "/branding/logos/birdix-isotipo-ix.png",
  wordmarkGreen: "/branding/logos/birdix-wordmark-blanco-sobre-verde.png",
  wordmarkWhite: "/branding/logos/birdix-wordmark-verde-sobre-blanco.png",
};

// Inyecta Open Sans desde Fontsource (jsdelivr) la primera vez que monta la app.
// Idempotente: si ya está cargada, no la duplica.
const FONT_HREFS = [
  "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.0/400.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.0/600.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.0/700.css",
];

const useBirdixFont = () => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    // Carga Fontsource (jsdelivr) una sola vez.
    FONT_HREFS.forEach((href) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
    // Aplica Open Sans a todo el documento para que también afecte a wrappers
    // que no llevan className/style explícito.
    const prev = document.body.style.fontFamily;
    document.body.style.fontFamily = BIRDIX_FONT_STACK;
    return () => {
      document.body.style.fontFamily = prev;
    };
  }, []);
};

const BIRDIX_FONT_STACK = `'Open Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

/* ---------------------------------------------------------------------------
   1 · CAPA DE PERSISTENCIA
   - Usa window.storage si existe (shared: false)
   - Fallback a localStorage
   - Fallback final a memoria (la app nunca se rompe)
   --------------------------------------------------------------------------*/
const memoryStore = {};
const STORAGE_PREFIX = "birdix:";

const storage = {
  get(key) {
    try {
      if (typeof window !== "undefined" && window.storage?.get) {
        const v = window.storage.get(STORAGE_PREFIX + key, { shared: false });
        return v ?? null;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        const v = window.localStorage.getItem(STORAGE_PREFIX + key);
        return v ? JSON.parse(v) : null;
      }
      return memoryStore[key] ?? null;
    } catch (e) {
      return memoryStore[key] ?? null;
    }
  },
  set(key, value) {
    try {
      memoryStore[key] = value;
      if (typeof window !== "undefined" && window.storage?.set) {
        window.storage.set(STORAGE_PREFIX + key, value, { shared: false });
        return true;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        return true;
      }
      return true;
    } catch (e) {
      memoryStore[key] = value;
      return false;
    }
  },
  remove(key) {
    try {
      delete memoryStore[key];
      if (typeof window !== "undefined" && window.storage?.remove) {
        window.storage.remove(STORAGE_PREFIX + key, { shared: false });
      }
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(STORAGE_PREFIX + key);
      }
    } catch (e) { }
  },
};

/* ---------------------------------------------------------------------------
   2 · CONSTANTES DE DOMINIO
   --------------------------------------------------------------------------*/

/* Colores alineados a branding/sistema-visual.md (hex oficial de cada
   división) — antes usaban degradados Tailwind stock que no coincidían.
   Pendiente técnico cerrado en DESIGN.md al construir la pantalla Resultado. */
const DIVISIONS = [
  { key: "bronce", name: "Bronce", min: 0, max: 399, hex: "#92400E", hexLight: "#C2670E", ring: "from-[#92400E] to-[#C2670E]", text: "text-amber-100" },
  { key: "plata", name: "Plata", min: 400, max: 799, hex: "#6B7280", hexLight: "#9CA3AF", ring: "from-[#6B7280] to-[#9CA3AF]", text: "text-slate-900" },
  { key: "oro", name: "Oro", min: 800, max: 1199, hex: "#CA8A04", hexLight: "#F5C542", ring: "from-[#CA8A04] to-[#F5C542]", text: "text-yellow-950" },
  { key: "platino", name: "Platino", min: 1200, max: 1599, hex: "#0E7490", hexLight: "#22D3EE", ring: "from-[#0E7490] to-[#22D3EE]", text: "text-cyan-950" },
  { key: "elite", name: "Élite", min: 1600, max: 1999, hex: "#7C3AED", hexLight: "#A78BFA", ring: "from-[#7C3AED] to-[#A78BFA]", text: "text-white" },
  { key: "leyenda", name: "Leyenda", min: 2000, max: 99999, hex: "#00703a", hexLight: "#2D8E5C", ring: "from-[#00703a] to-[#2D8E5C]", text: "text-[#014F2A]" },
];

const getDivision = (points) => {
  return DIVISIONS.find((d) => points >= d.min && points <= d.max) || DIVISIONS[0];
};

const getNextDivision = (points) => {
  const i = DIVISIONS.findIndex((d) => points >= d.min && points <= d.max);
  return i >= 0 && i < DIVISIONS.length - 1 ? DIVISIONS[i + 1] : null;
};

const FAKE_RIVALS = [
  { id: "r1", name: "Carlos Mendoza", hcp: 9, birdixHcp: 9, club: "Real Club La Moraleja", rank: 1342, division: "platino", avatar: "CM" },
  { id: "r2", name: "Marta Riera", hcp: 14, birdixHcp: 14, club: "Sotogrande", rank: 1180, division: "platino", avatar: "MR" },
  { id: "r3", name: "Diego Vela", hcp: 6, birdixHcp: 6, club: "Valderrama", rank: 1820, division: "elite", avatar: "DV" },
  { id: "r4", name: "Laura Pinto", hcp: 22, birdixHcp: 22, club: "El Saler", rank: 640, division: "plata", avatar: "LP" },
  { id: "r5", name: "Iván Castro", hcp: 11, birdixHcp: 11, club: "PGA Catalunya", rank: 980, division: "oro", avatar: "IC" },
  { id: "r6", name: "Nuria Almansa", hcp: 17, birdixHcp: 17, club: "La Reserva", rank: 720, division: "plata", avatar: "NA" },
];

const FAKE_TOP = [
  { name: "Diego Vela", points: 2140, change: 1 },
  { name: "Andrea Sanz", points: 2080, change: -1 },
  { name: "Pablo Reyes", points: 2010, change: 2 },
  { name: "Carla Estévez", points: 1955, change: 0 },
  { name: "Hugo Mateo", points: 1900, change: -2 },
];

/* Espejo local de los 3 campos reales que ya existen en Supabase
   (courses/course_holes) — puente temporal hasta que D7 reescriba
   MatchPlayScreen para leer course_holes directamente. Los `id` son los
   UUID reales: MatchesScreen (T7) crea partidas con estos mismos ids vía
   create_match, y MatchPlayScreen (sin tocar en PR1) necesita que
   getCourseById/getCourseHoles seguan encontrando el campo por ese id. */
const COURSES = [
  {
    id: "d29b8a6c-4580-48f7-9f97-30c5e30a5a28",
    name: "Golf de Salamanca - Zarapicos",
    location: "Zarapicos, Salamanca",
    scorecardStatus: "verified",
    holes: [
      { hole: 1, par: 5, strokeIndex: 7, meters: 465 },
      { hole: 2, par: 4, strokeIndex: 11, meters: 267 },
      { hole: 3, par: 4, strokeIndex: 1, meters: 367 },
      { hole: 4, par: 3, strokeIndex: 17, meters: 119 },
      { hole: 5, par: 5, strokeIndex: 15, meters: 425 },
      { hole: 6, par: 4, strokeIndex: 9, meters: 321 },
      { hole: 7, par: 4, strokeIndex: 5, meters: 328 },
      { hole: 8, par: 3, strokeIndex: 13, meters: 147 },
      { hole: 9, par: 4, strokeIndex: 3, meters: 341 },
      { hole: 10, par: 4, strokeIndex: 10, meters: 316 },
      { hole: 11, par: 5, strokeIndex: 6, meters: 462 },
      { hole: 12, par: 4, strokeIndex: 8, meters: 332 },
      { hole: 13, par: 3, strokeIndex: 4, meters: 166 },
      { hole: 14, par: 4, strokeIndex: 14, meters: 325 },
      { hole: 15, par: 4, strokeIndex: 12, meters: 259 },
      { hole: 16, par: 4, strokeIndex: 16, meters: 299 },
      { hole: 17, par: 3, strokeIndex: 18, meters: 109 },
      { hole: 18, par: 5, strokeIndex: 2, meters: 466 },
    ],
  },
  {
    id: "eb9d5063-eb94-4632-833c-a0d4d993d64b",
    name: "La Valmuza",
    location: "Salamanca",
    scorecardStatus: "verified",
    holes: [
      { hole: 1, par: 5, strokeIndex: 9, meters: 461 },
      { hole: 2, par: 3, strokeIndex: 17, meters: 115 },
      { hole: 3, par: 5, strokeIndex: 1, meters: 491 },
      { hole: 4, par: 4, strokeIndex: 5, meters: 377 },
      { hole: 5, par: 3, strokeIndex: 13, meters: 134 },
      { hole: 6, par: 4, strokeIndex: 15, meters: 308 },
      { hole: 7, par: 4, strokeIndex: 3, meters: 357 },
      { hole: 8, par: 5, strokeIndex: 7, meters: 442 },
      { hole: 9, par: 3, strokeIndex: 11, meters: 135 },
      { hole: 10, par: 5, strokeIndex: 14, meters: 471 },
      { hole: 11, par: 3, strokeIndex: 18, meters: 146 },
      { hole: 12, par: 4, strokeIndex: 10, meters: 265 },
      { hole: 13, par: 5, strokeIndex: 4, meters: 446 },
      { hole: 14, par: 4, strokeIndex: 2, meters: 338 },
      { hole: 15, par: 3, strokeIndex: 8, meters: 143 },
      { hole: 16, par: 4, strokeIndex: 16, meters: 316 },
      { hole: 17, par: 3, strokeIndex: 6, meters: 185 },
      { hole: 18, par: 5, strokeIndex: 12, meters: 445 },
    ],
  },
  {
    id: "928ba69f-d14d-4149-a519-8c9cb9df57d0",
    name: "Salamanca Forum Golf - Villamayor",
    location: "Villamayor, Salamanca",
    scorecardStatus: "verified",
    holes: [
      { hole: 1, par: 4, strokeIndex: 9, meters: 324 },
      { hole: 2, par: 5, strokeIndex: 17, meters: 464 },
      { hole: 3, par: 4, strokeIndex: 3, meters: 354 },
      { hole: 4, par: 3, strokeIndex: 7, meters: 175 },
      { hole: 5, par: 4, strokeIndex: 11, meters: 300 },
      { hole: 6, par: 4, strokeIndex: 5, meters: 361 },
      { hole: 7, par: 5, strokeIndex: 15, meters: 474 },
      { hole: 8, par: 3, strokeIndex: 13, meters: 160 },
      { hole: 9, par: 4, strokeIndex: 1, meters: 334 },
      { hole: 10, par: 3, strokeIndex: 18, meters: 127 },
      { hole: 11, par: 4, strokeIndex: 2, meters: 331 },
      { hole: 12, par: 3, strokeIndex: 16, meters: 136 },
      { hole: 13, par: 4, strokeIndex: 12, meters: 309 },
      { hole: 14, par: 4, strokeIndex: 6, meters: 335 },
      { hole: 15, par: 5, strokeIndex: 10, meters: 457 },
      { hole: 16, par: 3, strokeIndex: 14, meters: 180 },
      { hole: 17, par: 5, strokeIndex: 8, meters: 455 },
      { hole: 18, par: 4, strokeIndex: 4, meters: 346 },
    ],
  },
];

/* ---------------------------------------------------------------------------
   3 · HELPERS DE NEGOCIO
   --------------------------------------------------------------------------*/

const clampNumber = (value, min, max, fallback = min) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const calculateMatchWinner = (playerPoints, rivalPoints) => {
  if (playerPoints > rivalPoints) return "win";
  if (playerPoints < rivalPoints) return "loss";
  return "draw";
};

const initialsFromName = (name = "?") =>
  String(name)
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

// Identificador corto por jugador (D19, feedback tras la 1ª partida real):
// varios jugadores pueden compartir nombre — este código, derivado del UUID
// de su cuenta, deja distinguirlos en la búsqueda de rival y en las
// partidas. No es una columna nueva en la base de datos, solo una forma
// legible de mostrar el id que cada jugador ya tiene.
const shortPlayerCode = (id) => (id ? `#${String(id).replace(/-/g, "").slice(0, 4).toUpperCase()}` : null);

const isTeamMatch = (match) =>
  match?.matchType === "2v2" || match?.format === "2 vs 2" || match?.format === "2v2";

const toMatchPlayer = (player, slot, team) => ({
  id: player?.id || `${team}_${slot}`,
  slot,
  team,
  name: player?.name || "Jugador",
  avatar: player?.avatar || initialsFromName(player?.name),
  club: player?.club || "",
  hcp: normalizeHcp(player?.hcp),
  birdixHcp: normalizeBirdixHcp(player?.birdixHcp ?? player?.hcp),
  rank: toRankingPoints(player?.rank ?? player?.ranking ?? 1000),
  isCurrentUser: Boolean(player?.isCurrentUser),
});

const buildTeamPlayers = (profile, ranking, draft) => {
  const currentUser = toMatchPlayer(
    {
      id: "me",
      name: profile?.name || "Tú",
      avatar: initialsFromName(profile?.name || "Tú"),
      hcp: profile?.hcp,
      birdixHcp: getProfileBirdixHcp(profile),
      rank: ranking,
      club: profile?.club || "",
      isCurrentUser: true,
    },
    "player",
    "A"
  );
  const teammate = toMatchPlayer(FAKE_RIVALS.find((r) => r.id === draft.teammateId), "teammate", "A");
  const rival1 = toMatchPlayer(FAKE_RIVALS.find((r) => r.id === draft.rivalId), "rival1", "B");
  const rival2 = toMatchPlayer(FAKE_RIVALS.find((r) => r.id === draft.rival2Id), "rival2", "B");
  return [currentUser, teammate, rival1, rival2];
};

const getTeamPlayers = (match, ranking = 1000, playerBirdixHcp = 18) => {
  if (Array.isArray(match?.players) && match.players.length >= 4) {
    return match.players.map((p) =>
      toMatchPlayer(
        {
          ...p,
          rank: p.isCurrentUser ? ranking : p.rank,
          birdixHcp: p.isCurrentUser ? p.birdixHcp ?? playerBirdixHcp : p.birdixHcp,
        },
        p.slot,
        p.team
      )
    );
  }
  const fallback = {
    teammateId: FAKE_RIVALS[1]?.id,
    rivalId: match?.rivalId || FAKE_RIVALS[0]?.id,
    rival2Id: FAKE_RIVALS[2]?.id,
  };
  return buildTeamPlayers({ name: "Tú", hcp: playerBirdixHcp, birdixHcp: playerBirdixHcp }, ranking, fallback);
};

const averageRank = (players) => {
  const list = Array.isArray(players) ? players : [];
  if (!list.length) return 1000;
  return Math.round(list.reduce((sum, p) => sum + toRankingPoints(p.rank), 0) / list.length);
};

const oppositeResult = (result) => (result === "win" ? "loss" : result === "loss" ? "win" : "draw");

const getCourseById = (courseIdOrName, fallback = COURSES[0]) =>
  COURSES.find((c) => c.id === courseIdOrName || c.name === courseIdOrName) || fallback;

const getCourseHoles = (courseIdOrName, holeCount = 18) => {
  const course = getCourseById(courseIdOrName, null);
  const holes = Array.isArray(course?.holes) ? course.holes : [];
  return holes.slice(0, clampNumber(holeCount, 1, 18, 18));
};

const hasVerifiedScorecard = (course, holeCount = 18) => {
  const holes = Array.isArray(course?.holes) ? course.holes : [];
  return course?.scorecardStatus === "verified" && holes.length >= clampNumber(holeCount, 1, 18, 18);
};

const formatDate = (d) => {
  const date = new Date(d);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Hoy";
  if (sameDay(date, yest)) return "Ayer";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
};

const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");

const normalizeFinishedMatch = (match, rankingDelta = 0) => {
  const safeMatch = match || {};
  const safeDelta = Math.round(Number.isFinite(Number(rankingDelta)) ? Number(rankingDelta) : 0);
  const playerPoints = Number.isFinite(Number(safeMatch.playerPoints)) ? Number(safeMatch.playerPoints) : 0;
  const rivalPoints = Number.isFinite(Number(safeMatch.rivalPoints)) ? Number(safeMatch.rivalPoints) : 0;
  const result = safeMatch.result || calculateMatchWinner(playerPoints, rivalPoints);
  const holeScores = Array.isArray(safeMatch.holeScores)
    ? safeMatch.holeScores
    : Array.isArray(safeMatch.holes)
      ? safeMatch.holes
      : [];
  const holeCount = Array.isArray(safeMatch.holes) ? safeMatch.holes.length : safeMatch.holes;
  const course = getCourseById(safeMatch.courseId || safeMatch.course, null);
  return {
    ...safeMatch,
    id: safeMatch.id || "m_" + Date.now(),
    status: "finished",
    result,
    date: safeMatch.date || new Date().toISOString(),
    format: safeMatch.format || "1 vs 1",
    holes: clampNumber(holeCount, 1, 18, 9),
    holeScores,
    courseId: safeMatch.courseId || course?.id || null,
    course: safeMatch.course || course?.name || "Campo sin definir",
    rivalName: safeMatch.rivalName || "Rival",
    playerBirdixHcp: normalizeBirdixHcp(safeMatch.playerBirdixHcp ?? safeMatch.playerHcp),
    rivalBirdixHcp: normalizeBirdixHcp(safeMatch.rivalBirdixHcp ?? safeMatch.rivalHcp),
    rivalRank: Number.isFinite(Number(safeMatch.rivalRank)) ? Number(safeMatch.rivalRank) : 1000,
    playerPoints,
    rivalPoints,
    cardsUsed: Array.isArray(safeMatch.cardsUsed) ? safeMatch.cardsUsed.filter(Boolean) : [],
    rankingDelta: safeDelta,
    finishedAt: safeMatch.finishedAt || new Date().toISOString(),
  };
};

const getMatchHoleCount = (match) => {
  const raw = Array.isArray(match?.holes) ? match.holes.length : match?.holes;
  return clampNumber(raw, 1, 18, 9);
};

/* ---------------------------------------------------------------------------
   4 · ESTADO GLOBAL (useReducer)
   --------------------------------------------------------------------------*/

const initialState = {
  session: null, // { userId, email }
  user: null, // { id, name, email }
  profile: null, // perfil deportivo
  matches: [], // historial
  ranking: 1000, // puntos del jugador
  position: 4287, // posición global simulada
  selectedCards: [], // cartas elegidas partida activa
  activeMatch: null, // partida activa
  hydrated: false,
};

function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        ...action.payload,
        profile: action.payload?.profile
          ? { ...action.payload.profile, birdixHcp: getProfileBirdixHcp(action.payload.profile) }
          : action.payload?.profile,
        ranking: toRankingPoints(action.payload?.ranking ?? state.ranking),
        hydrated: true,
      };
    case "LOGIN":
      return { ...state, session: action.payload.session, user: action.payload.user };
    case "LOGOUT":
      return { ...initialState, hydrated: true };
    case "SET_PROFILE":
      return { ...state, profile: { ...action.payload, birdixHcp: getProfileBirdixHcp(action.payload) } };
    case "UPDATE_PROFILE":
      return { ...state, profile: { ...state.profile, ...action.payload } };
    // D22 (25 ago 2026): refresco desde Supabase al arrancar — HYDRATE ya
    // pintó rápido con lo que hubiera en localStorage; esto lo corrige con
    // los datos reales en cuanto llegan, sin pisar campos locales que no
    // vienen de Supabase (ver comentario junto al useEffect de hidratación).
    case "REFRESH_FROM_SERVER": {
      const { profile, ranking, matches } = action.payload || {};
      return {
        ...state,
        profile: profile ? { ...state.profile, ...profile, birdixHcp: getProfileBirdixHcp(profile) } : state.profile,
        ranking: Number.isFinite(Number(ranking)) ? toRankingPoints(ranking) : state.ranking,
        matches: Array.isArray(matches) ? matches : state.matches,
      };
    }
    case "SET_SELECTED_CARDS":
      return { ...state, selectedCards: action.payload };
    case "SET_ACTIVE_MATCH":
      return { ...state, activeMatch: action.payload };
    case "FINISH_MATCH": {
      const { match, rankingDelta, confirmedBirdixHcp } = action.payload || {};
      if (!match) return { ...state, selectedCards: [], activeMatch: null };
      const safeDelta = Math.round(Number.isFinite(Number(rankingDelta)) ? Number(rankingDelta) : 0);
      const finishedMatch = normalizeFinishedMatch(match, safeDelta);
      const safeRanking = Number.isFinite(Number(state.ranking)) ? Number(state.ranking) : 1000;
      const safePosition = Number.isFinite(Number(state.position)) ? Number(state.position) : 4287;
      const safeMatches = Array.isArray(state.matches) ? state.matches : [];
      const nextMatches = [finishedMatch, ...safeMatches];
      const newRanking = toRankingPoints(safeRanking + safeDelta);
      const posDelta = -Math.round(safeDelta * 3.2);
      // D20: en partida real, el hcp local nunca se adelanta al servidor —
      // solo se toca si confirmMatchResult ya trajo el valor confirmado
      // (ambos jugadores cerraron su lado). Sin eso, se deja tal cual hasta
      // que se confirme más adelante. Las partidas locales/2vs2 (sin
      // confirmación de por medio) siguen aplicando el cálculo optimista de
      // siempre, sin cambios.
      const nextProfile = state.profile
        ? {
            ...state.profile,
            birdixHcp: match.isRealMatch
              ? (Number.isFinite(Number(confirmedBirdixHcp)) ? normalizeBirdixHcp(confirmedBirdixHcp) : getProfileBirdixHcp(state.profile))
              : calculateBirdixHcpAfterMatch(state.profile, finishedMatch),
          }
        : state.profile;
      return {
        ...state,
        profile: nextProfile,
        matches: nextMatches,
        ranking: newRanking,
        position: Math.max(1, safePosition + posDelta),
        selectedCards: [],
        activeMatch: null,
      };
    }
    default:
      return state;
  }
}

/* ---------------------------------------------------------------------------
   5 · COMPONENTES PEQUEÑOS
   --------------------------------------------------------------------------*/

/* Componente unificado para los tres lockups oficiales de Birdix.
   Si el PNG no se resuelve (entorno sin assets), cae a un fallback tipográfico
   con "BIRDiX" en Open Sans 800 + el verde Birdix oficial. */
const BirdixLogo = ({ variant = "wordmark-white", height = 48, alt = "Birdix" }) => {
  const [failed, setFailed] = useState(false);
  const src =
    variant === "isotipo" ? LOGOS.isotipo :
      variant === "wordmark-green" ? LOGOS.wordmarkGreen :
        LOGOS.wordmarkWhite;

  if (failed) {
    // Fallback tipográfico: BIRDiX con i minúscula, en verde si la variante es clara
    const color = variant === "wordmark-green" ? "#FFFFFF" : BX.green;
    const isIsotipo = variant === "isotipo";
    return (
      <div
        style={{
          height,
          minWidth: isIsotipo ? height : undefined,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: variant === "wordmark-green" || variant === "isotipo" ? BX.green : "transparent",
          color,
          borderRadius: isIsotipo ? 16 : 0,
          padding: isIsotipo ? 0 : "0 8px",
          fontFamily: BIRDIX_FONT_STACK,
          fontWeight: 800,
          fontSize: isIsotipo ? height * 0.42 : height * 0.55,
          letterSpacing: "-0.02em",
        }}
        aria-label={alt}
      >
        {isIsotipo ? "iX" : (<>BIRD<span>i</span>X</>)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ height, width: "auto", display: "block" }}
    />
  );
};

/* Wrapper de compatibilidad: las llamadas antiguas a <Logo /> siguen funcionando.
   Por defecto muestra el wordmark verde sobre blanco. */
const Logo = ({ size = "md", subtitle = false }) => {
  const heights = { sm: 28, md: 44, lg: 64 };
  return (
    <div className="flex items-center gap-3" style={{ fontFamily: BIRDIX_FONT_STACK }}>
      <BirdixLogo variant="wordmark-white" height={heights[size]} />
      {subtitle && (
        <span style={{ fontSize: 11, letterSpacing: "0.18em", color: BX.green, fontWeight: 600, textTransform: "uppercase" }}>
          Golf · Competitivo
        </span>
      )}
    </div>
  );
};

const DivisionBadge = ({ points, compact = false }) => {
  const d = getDivision(points);
  return (
    <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${d.ring} ${d.text} ${compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs"} font-bold shadow-sm`}>
      <Crown size={compact ? 12 : 14} strokeWidth={2.5} />
      {d.name}
    </div>
  );
};

const Pill = ({ children, tone = "slate", icon: Icon }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-[#E6F4ED] text-[#014F2A]",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-[#FBEAE3] text-[#6B2E1F]",
    sky: "bg-sky-100 text-sky-800",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${tones[tone]} px-2.5 py-1 text-[11px] font-semibold`}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  );
};

const PrimaryButton = ({ children, onClick, disabled, icon: Icon, full = true, tone = "emerald" }) => {
  const tones = {
    emerald: "bg-[#00703a] hover:bg-[#014F2A] shadow-[#014F2A]/20",
    dark: "bg-slate-900 hover:bg-black shadow-slate-900/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${full ? "w-full" : ""} ${tones[tone]} disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl px-5 py-3.5 font-bold text-[15px] shadow-lg flex items-center justify-center gap-2 transition active:scale-[0.98]`}
    >
      {Icon && <Icon size={18} strokeWidth={2.5} />}
      {children}
    </button>
  );
};

const SecondaryButton = ({ children, onClick, icon: Icon, full = true }) => (
  <button
    onClick={onClick}
    className={`${full ? "w-full" : ""} bg-white text-slate-900 ring-1 ring-slate-200 hover:ring-slate-300 rounded-2xl px-5 py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 transition active:scale-[0.98]`}
  >
    {Icon && <Icon size={18} strokeWidth={2.5} />}
    {children}
  </button>
);

const Field = ({ label, type = "text", value, onChange, placeholder, error, icon: Icon, right }) => (
  <label className="block">
    <span className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{label}</span>
    <div className={`relative rounded-2xl bg-white ring-1 ${error ? "ring-[#D67560]/50" : "ring-slate-200"} focus-within:ring-[#00703a] focus-within:ring-2 transition`}>
      {Icon && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <Icon size={18} strokeWidth={2} />
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-transparent rounded-2xl py-3 ${Icon ? "pl-11" : "pl-4"} ${right ? "pr-12" : "pr-4"} text-[15px] text-slate-900 placeholder:text-slate-400 outline-none`}
      />
      {right && <span className="absolute right-3 top-1/2 -translate-y-1/2">{right}</span>}
    </div>
    {error && <span className="block text-[12px] text-[#A8543F] mt-1.5 font-medium">{error}</span>}
  </label>
);

const SegmentedControl = ({ options, value, onChange }) => (
  <div className="grid grid-cols-2 bg-slate-100 rounded-2xl p-1">
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => !o.disabled && onChange(o.value)}
        disabled={o.disabled}
        className={`rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-1.5 ${o.disabled
            ? "text-slate-300 cursor-not-allowed"
            : value === o.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500"
          }`}
      >
        {o.label}
        {o.disabled && <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 bg-slate-200 rounded-full px-1.5 py-0.5">Pronto</span>}
      </button>
    ))}
  </div>
);

const ChoiceGrid = ({ options, value, onChange, columns = 2 }) => (
  <div className={`grid gap-2.5 ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          onClick={() => !o.disabled && onChange(o.value)}
          disabled={o.disabled}
          className={`text-left rounded-2xl px-4 py-3.5 ring-1 transition ${o.disabled
              ? "bg-slate-50 ring-slate-200 opacity-60 cursor-not-allowed"
              : active
                ? "bg-[#E6F4ED] ring-[#00703a] ring-2"
                : "bg-white ring-slate-200 hover:ring-slate-300"
            }`}
        >
          <div className="flex items-center justify-between">
            <span className={`font-semibold text-[14px] ${active ? "text-[#014F2A]" : "text-slate-900"}`}>{o.label}</span>
            {o.disabled ? (
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-200 rounded-full px-2 py-0.5">Próximamente</span>
            ) : (
              active && <Check className="text-[#00703a]" size={18} strokeWidth={3} />
            )}
          </div>
          {o.hint && <span className="block text-[12px] text-slate-500 mt-0.5">{o.hint}</span>}
        </button>
      );
    })}
  </div>
);

const ProgressBar = ({ value, max = 100, tone = "emerald" }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const tones = {
    emerald: "bg-gradient-to-r from-[#00703a] to-[#00703a]",
    amber: "bg-gradient-to-r from-amber-400 to-yellow-300",
  };
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${tones[tone]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const EmptyState = ({ icon: Icon = Flag, title, description, action }) => (
  <div className="flex flex-col items-center text-center py-10 px-6">
    <div className="h-16 w-16 rounded-3xl bg-[#E6F4ED] flex items-center justify-center mb-4 ring-1 ring-[#E6F4ED]">
      <Icon className="text-[#00703a]" size={28} strokeWidth={2} />
    </div>
    <h3 className="font-bold text-slate-900 text-base">{title}</h3>
    <p className="text-sm text-slate-500 mt-1 max-w-xs">{description}</p>
    {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
  </div>
);

const Avatar = ({ initials, size = "md", tone = "emerald" }) => {
  const sizes = { sm: "h-9 w-9 text-xs", md: "h-12 w-12 text-sm", lg: "h-20 w-20 text-2xl" };
  const tones = {
    emerald: "from-[#00703a] to-[#014F2A]",
    slate: "from-slate-700 to-slate-900",
    amber: "from-amber-400 to-amber-600",
  };
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br ${tones[tone]} text-white font-bold flex items-center justify-center ring-2 ring-white shadow`}>
      {initials}
    </div>
  );
};

const SectionTitle = ({ children, action }) => (
  <div className="flex items-center justify-between mb-3 px-1">
    <h2 className="font-bold text-slate-900 text-[15px]">{children}</h2>
    {action}
  </div>
);

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-3xl ring-1 ring-slate-100 shadow-sm ${className}`}>{children}</div>
);

/* ---------- Birdix card visual ---------- */
const BirdixCard = ({ card, selected, used, onClick, size = "md", showDesc = false }) => {
  const Icon = card.icon;
  const sizes = {
    sm: "h-32 rounded-2xl",
    md: "h-44 rounded-3xl",
    lg: "h-56 rounded-3xl",
  };
  return (
    <button
      onClick={onClick}
      disabled={used}
      className={`group relative ${sizes[size]} w-full text-left overflow-hidden ring-1 transition-all duration-200 active:scale-[0.985]
        ${used ? "ring-slate-200 opacity-50 grayscale" : selected ? "ring-[#00703a] ring-[2px] shadow-[0_18px_42px_rgba(1,79,42,0.18)] -translate-y-0.5" : "ring-black/5 shadow-sm hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.10)]"}
        ${card.accent}`}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-transparent to-black/[0.03] pointer-events-none" />
      <div className="absolute inset-0 p-3.5 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className={`${card.chip} text-white text-[10px] font-black uppercase tracking-[0.14em] px-2 py-1 rounded-full shadow-sm`}>{card.type}</div>
          <div className="h-9 w-9 rounded-2xl bg-white/75 backdrop-blur flex items-center justify-center ring-1 ring-black/5 shadow-sm transition-transform duration-200 group-hover:scale-105">
            <Icon size={18} strokeWidth={2.5} />
          </div>
        </div>
        <div>
          <h3 className="font-black text-[15px] leading-tight tracking-tight">{card.name}</h3>
          <p className="text-[11px] font-medium mt-0.5 opacity-80">{card.short}</p>
          {showDesc && <p className="text-[10px] mt-2 opacity-70 leading-snug">{card.desc}</p>}
        </div>
      </div>
      {selected && (
        <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-[#00703a] ring-2 ring-white shadow-lg flex items-center justify-center">
          <Check className="text-white" size={14} strokeWidth={3} />
        </div>
      )}
      {used && (
        <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
          <span className="bg-white/90 text-slate-900 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">Usada</span>
        </div>
      )}
    </button>
  );
};

/* ---------- TabBar ---------- */
const TABS = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "ranking", label: "Ranking", icon: Trophy },
  { id: "profile", label: "Perfil", icon: User },
];

/* Estados de navegación alcanzables desde dentro de una de las 3 pestañas
   (Crear partida desde Inicio, Cartas desde la selección de mazo) — no
   llevan icono propio en la barra, per DESIGN.md: "un único menú fijo,
   sin excepciones ni patrón distinto". */
const isTabBarTab = (tab) => TABS.some((t) => t.id === tab);

const TabBar = ({ active, onChange, stacked = false }) => (
  <nav className={`fixed inset-x-0 z-30 pointer-events-none ${stacked ? "bottom-[76px]" : "bottom-0"}`}>
    <div className="mx-auto max-w-[900px] px-3 pb-3 pointer-events-auto">
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl ring-1 ring-slate-200 shadow-surface px-1.5 py-1.5">
        <div className="grid grid-cols-3 gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition ${isActive ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-bold tracking-wide">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </nav>
);

/* ---------- Toast ---------- */
const Toast = ({ message, onDone }) => {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="fixed top-3 inset-x-0 z-50 flex justify-center px-3 pointer-events-none">
      <div className="bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-2">
        <Sparkles size={16} />
        {message}
      </div>
    </div>
  );
};

/* ---------- Loader inline ---------- */
const LoadingLine = ({ text }) => (
  <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-sm font-medium">
    <div className="h-3 w-3 rounded-full bg-[#00703a] animate-pulse" />
    {text}
  </div>
);

/* ---------------------------------------------------------------------------
   6 · SCREEN · AUTH (Welcome + Login + Register)
   --------------------------------------------------------------------------*/

const AuthScreen = ({ onLogin, onRegister }) => {
  const [mode, setMode] = useState("welcome"); // welcome | login | register
  const [form, setForm] = useState({ name: "", lastName: "", email: "", password: "", confirm: "", accept: false });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submitLogin = async () => {
    const errs = {};
    if (!validateEmail(form.email)) errs.email = "Email no válido.";
    if (!form.password || form.password.length < 4) errs.password = "Contraseña demasiado corta.";
    if (Object.keys(errs).length) return setErrors(errs);
    setErrors({});
    setLoading(true);
    const { error } = await onLogin({ email: form.email, password: form.password });
    setLoading(false);
    if (error) setErrors({ password: error });
  };

  const submitRegister = async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Indica tu nombre.";
    if (!form.lastName.trim()) errs.lastName = "Indica tu apellido.";
    if (!validateEmail(form.email)) errs.email = "Email no válido.";
    if (!form.password || form.password.length < 6) errs.password = "Mínimo 6 caracteres.";
    if (form.password !== form.confirm) errs.confirm = "No coincide con la contraseña.";
    if (!form.accept) errs.accept = "Acepta los términos.";
    if (Object.keys(errs).length) return setErrors(errs);
    setErrors({});
    setLoading(true);
    const fullName = `${form.name.trim()} ${form.lastName.trim()}`;
    const { error } = await onRegister({ name: fullName, email: form.email, password: form.password });
    setLoading(false);
    if (error) setErrors({ email: error });
  };

  if (mode === "welcome") {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Hero */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-10 overflow-hidden">
          <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-[#00703a]/15 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-lime-200/40 blur-3xl" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <Logo size="lg" />
            <h1 className="mt-10 text-[34px] leading-[1.05] font-black tracking-tight text-slate-900">
              Compite.
              <br />
              Conecta. <span className="text-[#00703a]">Mejora.</span>
            </h1>
            <p className="mt-3 text-slate-500 text-[15px] max-w-xs">El nuevo golf competitivo.</p>

            <div className="mt-10 flex items-center gap-2 flex-wrap justify-center">
              <Pill icon={Swords} tone="emerald">1 vs 1 · 2 vs 2</Pill>
              <Pill icon={Layers} tone="amber">{CARDS.length} cartas</Pill>
              <Pill icon={Trophy} tone="sky">Ranking global</Pill>
            </div>
          </div>
        </div>

        <div className="px-5 pb-10 pt-6 space-y-3 max-w-[420px] mx-auto w-full">
          <PrimaryButton onClick={() => setMode("register")} icon={ArrowRight}>Crear cuenta</PrimaryButton>
          <SecondaryButton onClick={() => setMode("login")}>Iniciar sesión</SecondaryButton>
          <p className="text-center text-[11px] text-slate-400 pt-2">
            Al continuar aceptas nuestros Términos y Política de privacidad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-5 pt-6 pb-3 flex items-center justify-between max-w-[420px] mx-auto w-full">
        <button onClick={() => setMode("welcome")} className="h-10 w-10 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center">
          <ArrowLeft size={18} />
        </button>
        {/* Isotipo, no wordmark — este formulario es flujo operativo, no la
            bienvenida de marketing. Ver "Uso del logo" en DESIGN.md. */}
        <div className="h-8 w-8 rounded-[10px] overflow-hidden shadow-surface flex-shrink-0">
          <BirdixLogo variant="isotipo" height={32} />
        </div>
        <div className="w-10" />
      </header>

      <div className="px-5 flex-1 max-w-[420px] mx-auto w-full">
        <h1 className="text-[26px] font-black tracking-tight text-slate-900 mt-2">
          {mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta Birdix"}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {mode === "login" ? "Tu ranking te está esperando." : "Tu perfil competitivo empieza aquí."}
        </p>

        <div className="mt-7 space-y-3.5">
          {mode === "register" && (
            <Field
              label="Nombre"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="Tu nombre"
              icon={User}
              error={errors.name}
            />
          )}
          {mode === "register" && (
            <Field
              label="Apellido"
              value={form.lastName}
              onChange={(v) => setForm({ ...form, lastName: v })}
              placeholder="Tu apellido"
              icon={User}
              error={errors.lastName}
            />
          )}
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="tu@email.com"
            icon={Mail}
            error={errors.email}
          />
          <Field
            label="Contraseña"
            type={showPass ? "text" : "password"}
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="••••••••"
            icon={Lock}
            error={errors.password}
            right={
              <button onClick={() => setShowPass(!showPass)} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          {mode === "register" && (
            <Field
              label="Confirmar contraseña"
              type={showPass ? "text" : "password"}
              value={form.confirm}
              onChange={(v) => setForm({ ...form, confirm: v })}
              placeholder="••••••••"
              icon={Lock}
              error={errors.confirm}
            />
          )}

          {mode === "register" && (
            <label className="flex items-start gap-3 pt-1">
              <button
                onClick={() => setForm({ ...form, accept: !form.accept })}
                className={`mt-0.5 h-5 w-5 rounded-md flex items-center justify-center ring-1 ${form.accept ? "bg-[#00703a] ring-[#00703a]" : "bg-white ring-slate-300"
                  }`}
              >
                {form.accept && <Check className="text-white" size={14} strokeWidth={3} />}
              </button>
              <span className="text-[12px] text-slate-600 leading-snug">
                Acepto los Términos y la Política de privacidad de Birdix.
                {errors.accept && <span className="block text-[#A8543F] mt-1 font-medium">{errors.accept}</span>}
              </span>
            </label>
          )}

          {mode === "login" && (
            <button className="text-[#00703a] text-[13px] font-semibold">¿Has olvidado tu contraseña?</button>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {loading ? (
            <LoadingLine text={mode === "login" ? "Iniciando sesión…" : "Creando tu cuenta…"} />
          ) : (
            <PrimaryButton
              onClick={mode === "login" ? submitLogin : submitRegister}
              icon={ArrowRight}
            >
              {mode === "login" ? "Entrar" : "Crear cuenta"}
            </PrimaryButton>
          )}

          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="w-full text-center text-[13px] text-slate-600"
          >
            {mode === "login" ? (
              <>¿No tienes cuenta? <span className="text-[#00703a] font-bold">Crea una</span></>
            ) : (
              <>¿Ya tienes cuenta? <span className="text-[#00703a] font-bold">Inicia sesión</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   7 · SCREEN · ONBOARDING
   --------------------------------------------------------------------------*/

const OnboardingStepper = ({ user, onDone }) => {
  // ponytail: pantalla única, solo los 3 datos que Sergio pidió que se
  // usan de verdad en la app — nombre y apellidos, hándicap, campo
  // habitual. Formato y duración ya tienen valor por defecto en la
  // creación de partida (1v1 / 9 hoyos), no hace falta preguntarlos aquí.
  const [data, setData] = useState({ name: user?.name || "", hcp: "", club: "" });

  const canSubmit = data.name.trim() && data.hcp !== "" && data.club.trim();

  const submit = () => {
    if (!canSubmit) return;
    onDone({
      ...data,
      hcp: Number(data.hcp),
      birdixHcp: normalizeBirdixHcp(data.hcp),
      ranking: 1000,
      position: 4287,
      stats: { wins: 0, losses: 0, draws: 0, streak: 0, totalMatches: 0, favCard: null, bestRank: 1000 },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-5 pt-6 pb-3 max-w-[420px] mx-auto w-full" />

      <div className="px-5 flex-1 max-w-[420px] mx-auto w-full pt-2">
        <h2 className="text-[24px] font-black tracking-tight text-slate-900">Empecemos</h2>
        <p className="text-slate-500 text-sm mt-1">Para crear tu identidad en Birdix.</p>
        <div className="mt-6 space-y-3.5">
          <Field label="Nombre y apellidos" value={data.name} onChange={(v) => setData({ ...data, name: v })} placeholder="Tu nombre completo" />
          <Field label="Hándicap aproximado" type="number" value={data.hcp} onChange={(v) => setData({ ...data, hcp: v })} placeholder="18" />
          <Field label="Campo en el que sueles jugar" value={data.club} onChange={(v) => setData({ ...data, club: v })} placeholder="Nombre del club" icon={Flag} />
        </div>
      </div>

      <div className="px-5 pb-6 pt-3 max-w-[420px] mx-auto w-full">
        <PrimaryButton onClick={submit} disabled={!canSubmit} icon={ArrowRight}>
          Crear mi perfil
        </PrimaryButton>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   8 · SCREEN · HOME (Dashboard)
   --------------------------------------------------------------------------*/

const HomeScreen = ({ profile, ranking, matches, onCreate, onGoCards, onGoProfile }) => {
  const displayRanking = toRankingPoints(ranking);
  const division = getDivision(displayRanking);
  const nextDiv = getNextDivision(displayRanking);
  const progress = nextDiv ? ((displayRanking - division.min) / (nextDiv.min - division.min)) * 100 : 100;
  const last = matches[0];
  const firstName = profile?.name?.split(" ")[0] || "Jugador";

  return (
    <div className="-mx-4 sm:-mx-6 -mt-6 min-h-[calc(100vh-96px)] bg-[#FBFAF6] px-4 sm:px-6 pt-6 pb-6 space-y-6 transition-colors duration-300">
      {/* Header personal */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2.5">
          <div className="h-8 w-8 rounded-[10px] overflow-hidden shadow-surface flex-shrink-0 mt-0.5">
            <BirdixLogo variant="isotipo" height={32} />
          </div>
          <div>
            <p className="text-[#00703a] text-[11px] uppercase tracking-[0.18em] font-black">Birdix Clubhouse</p>
            <h1 className="text-[30px] font-black tracking-tight text-slate-950 leading-tight mt-1">Hola, {firstName}</h1>
            <p className="text-slate-500 text-[13px] font-semibold mt-1">Tu ronda competitiva empieza aquí.</p>
          </div>
        </div>
        <button onClick={onGoProfile} className="rounded-full active:scale-95 transition-transform duration-150">
          <Avatar initials={firstName.charAt(0).toUpperCase()} />
        </button>
      </div>

      {/* Hero ranking */}
      <Card className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-white via-white to-[#F2F7EF] ring-black/5 shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-[#00703a]" />
        <div className="relative p-6">
          <div className="flex items-center justify-between">
            <DivisionBadge points={displayRanking} />
          </div>
          <div className="mt-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Ranking global</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-[56px] tracking-tight text-slate-950 leading-none">{displayRanking}</span>
                <span className="text-slate-500 text-sm font-black uppercase tracking-wider">pts</span>
              </div>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Formato</p>
              <p className="text-slate-950 font-black mt-1">{profile?.format === "2v2" ? "2 vs 2" : "1 vs 1"}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-white/80 ring-1 ring-black/5 p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {nextDiv ? `Hacia ${nextDiv.name}` : "Máxima división"}
              </span>
              <span className="text-[11px] font-bold text-slate-900">
                {nextDiv ? `${nextDiv.min - displayRanking} pts` : "Leyenda"}
              </span>
            </div>
            <ProgressBar value={progress} max={100} />
          </div>
        </div>
      </Card>

      {/* CTAs */}
      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={onCreate}
          className="glow-behind w-full rounded-[24px] bg-gradient-to-br from-[#2D8E5C] via-[#00703a] to-[#014F2A] px-5 py-4 text-white shadow-glow-green flex items-center justify-between active:scale-[0.985] transition-all duration-200"
        >
          <span className="flex items-center gap-2 font-black text-[15px]"><Plus size={18} strokeWidth={2.5} />Crear partida</span>
          <ArrowRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Último resultado */}
      <div>
        <SectionTitle>Último resultado</SectionTitle>
        {last ? (
          <MatchCard match={last} compact />
        ) : (
          <Card className="rounded-[28px] ring-black/5 shadow-sm">
            <EmptyState
              icon={Swords}
              title="Aún no tienes partidas"
              description="Crea tu primera partida y empieza tu trayectoria en Birdix."
            />
          </Card>
        )}
      </div>

      {/* Acceso rápido */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onGoCards} className="text-left rounded-[28px] bg-gradient-to-br from-slate-950 to-slate-800 text-white p-4 shadow-surface ring-1 ring-white/10 active:scale-[0.99] transition-all duration-200">
          <div className="flex items-center justify-between">
            <Layers size={22} strokeWidth={2.5} />
            <ChevronRight size={18} className="opacity-70" />
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-wider text-[#6EE7B7] font-semibold">Mi mazo</p>
          <p className="font-display text-[19px]">{CARDS.length} cartas</p>
        </button>
        <button onClick={onGoProfile} className="text-left rounded-[28px] bg-white ring-1 ring-black/5 shadow-surface p-4 active:scale-[0.99] transition-all duration-200">
          <div className="flex items-center justify-between">
            <User size={22} strokeWidth={2.5} className="text-slate-700" />
            <ChevronRight size={18} className="text-slate-400" />
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-wider text-[#00703a] font-semibold">Mi perfil</p>
          <p className="font-display text-[19px] text-slate-900">Estadísticas</p>
        </button>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   9 · MATCH CARD (para historial y home)
   --------------------------------------------------------------------------*/

const MatchCard = ({ match, compact = false, onClick }) => {
  const holeCount = getMatchHoleCount(match);
  const rankingDelta = Math.round(Number(match.rankingDelta) || 0);
  const resultTone =
    match.result === "win"
      ? { bg: "bg-[#E6F4ED]", border: "ring-[#00703a]/30", chip: "bg-[#00703a] text-white", label: "Victoria" }
      : match.result === "loss"
        ? { bg: "bg-[#FBEAE3]", border: "ring-[#D67560]/30", chip: "bg-[#D67560] text-white", label: "Derrota" }
        : { bg: "bg-slate-50", border: "ring-slate-200", chip: "bg-slate-700 text-white", label: "Empate" };

  return (
    <button onClick={onClick} className={`w-full text-left ${resultTone.bg} rounded-3xl ring-1 ${resultTone.border} p-4 transition active:scale-[0.99]`}>
      <div className="flex items-center justify-between">
        <span className={`${resultTone.chip} text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full`}>{resultTone.label}</span>
        <span className="text-[12px] text-slate-500 font-semibold">{formatDate(match.date)}</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">vs</p>
          <p className="font-bold text-slate-900 text-[15px] leading-tight">
            {match.rivalName}
            {match.rivalId && <span className="text-slate-400 font-semibold"> {shortPlayerCode(match.rivalId)}</span>}
          </p>
          <p className="text-[12px] text-slate-500 mt-0.5">{match.format} · {holeCount} hoyos · {match.course}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Puntos</p>
          <p className="font-black text-slate-900 text-[22px] leading-none">
            {match.playerPoints}<span className="text-slate-400 text-base"> · {match.rivalPoints}</span>
          </p>
        </div>
      </div>
      {!compact && (
        <div className="mt-3 pt-3 border-t border-slate-200/70 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {match.cardsUsed?.slice(0, 3).map((c, i) => {
              const card = CARDS.find((x) => x.id === c);
              if (!card) return null;
              const Icon = card.icon;
              return (
                <span key={i} className={`${card.chip} h-6 w-6 rounded-full flex items-center justify-center text-white`}>
                  <Icon size={12} strokeWidth={2.5} />
                </span>
              );
            })}
            {match.cardsUsed?.length > 3 && <span className="text-[11px] text-slate-500 font-semibold">+{match.cardsUsed.length - 3}</span>}
          </div>
          <div className={`flex items-center gap-1 text-[12px] font-bold ${rankingDelta >= 0 ? "text-[#00703a]" : "text-[#A8543F]"}`}>
            {rankingDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {rankingDelta >= 0 ? "+" : ""}{rankingDelta} pts
          </div>
        </div>
      )}
    </button>
  );
};

/* ---------------------------------------------------------------------------
   10 · SCREEN · MATCHES (lista + creación + partida activa)
   --------------------------------------------------------------------------*/

const MatchesScreen = ({
  matches,
  activeMatch,
  selectedCards,
  profile,
  userId,
  ranking,
  onCreateMatch,
  onSelectCards,
  onOpenActive,
}) => {
  const [view, setView] = useState("list"); // list | create | cards
  const [courses, setCourses] = useState([]);
  const [coursesError, setCoursesError] = useState(null);
  const [draft, setDraft] = useState({
    format: profile?.format || "1v1",
    holes: profile?.holes || "9",
    course: "",
    teammateId: FAKE_RIVALS[1]?.id || "",
    rivalId: FAKE_RIVALS[0]?.id || "",
    rival2Id: FAKE_RIVALS[2]?.id || "",
  });
  // 1vs1 real: buscar rival por nombre entre profiles reales, sustituye a
  // FAKE_RIVALS (T7). El 2vs2 de abajo sigue local-only con FAKE_RIVALS —
  // fuera de alcance de PR1, ya deshabilitado en el selector de formato.
  const [selectedRival, setSelectedRival] = useState(null);
  const [rivalQuery, setRivalQuery] = useState("");
  const [rivalResults, setRivalResults] = useState([]);
  const [rivalSearching, setRivalSearching] = useState(false);
  const [rivalSearchError, setRivalSearchError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [cardPicks, setCardPicks] = useState([]);
  const [cardModal, setCardModal] = useState(null);
  const [showHowCardsWork, setShowHowCardsWork] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCourses()
      .then((rows) => {
        if (cancelled) return;
        setCourses(rows);
        setDraft((d) => (d.course ? d : { ...d, course: rows[0]?.id || "" }));
      })
      .catch((err) => {
        if (!cancelled) setCoursesError(err?.message || "No se pudieron cargar los campos.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = rivalQuery.trim();
    if (!trimmed) {
      setRivalResults([]);
      setRivalSearchError(null);
      setRivalSearching(false);
      return;
    }
    setRivalSearching(true);
    const timer = setTimeout(() => {
      findRivalCandidates(trimmed, { excludeUserId: userId })
        .then((rows) => {
          setRivalResults(rows);
          setRivalSearchError(null);
        })
        .catch((err) => setRivalSearchError(err?.message || "No se pudo buscar rival."))
        .finally(() => setRivalSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [rivalQuery, userId]);

  const required = draft.holes === "9" ? 2 : 4;
  const selectedCardIds = Array.isArray(selectedCards) ? selectedCards : [];
  const selectedCourse = getCourseById(draft.course);
  // Boolean(draft.course) primero: si listCourses() falla y draft.course se
  // queda vacío, getCourseById("") caería al campo por defecto (fallback del
  // propio helper) y dejaría crear una partida contra un campo que el
  // jugador nunca eligió — hay que bloquear explícitamente, no confiar en el
  // fallback silencioso del helper.
  const selectedCourseReady = Boolean(draft.course) && hasVerifiedScorecard(selectedCourse, Number(draft.holes));
  const draftIsTeamMatch = draft.format === "2v2";
  const teamSelectionIds = [draft.teammateId, draft.rivalId, draft.rival2Id].filter(Boolean);
  const teamSelectionReady = teamSelectionIds.length === 3 && new Set(teamSelectionIds).size === 3;
  const canContinueToCards = selectedCourseReady && (draftIsTeamMatch ? teamSelectionReady : Boolean(selectedRival));

  const startCreate = () => {
    setView("create");
  };

  const goToCardPick = () => {
    setCardPicks([]);
    setView("cards");
  };

  const confirmMatch = async () => {
    if (!draft.course) return; // ver nota en selectedCourseReady — no confiar en el fallback silencioso
    const course = getCourseById(draft.course);
    if (!hasVerifiedScorecard(course, Number(draft.holes))) return;

    // 2vs2 sigue local-only con FAKE_RIVALS — fuera de alcance de PR1, ya
    // deshabilitado en el selector de formato, nunca se llega aquí en la práctica.
    if (draftIsTeamMatch) {
      if (!teamSelectionReady) return;
      const rival = FAKE_RIVALS.find((r) => r.id === draft.rivalId);
      const rival2 = FAKE_RIVALS.find((r) => r.id === draft.rival2Id);
      const players = buildTeamPlayers(profile, ranking, draft);
      const teamA = players.filter((p) => p.team === "A");
      const teamB = players.filter((p) => p.team === "B");
      onCreateMatch({
        id: "m_" + Date.now(),
        matchType: "2v2",
        format: "2 vs 2",
        holes: Number(draft.holes),
        courseId: course.id,
        course: course.name,
        date: new Date().toISOString(),
        playerHcp: normalizeHcp(profile?.hcp),
        playerBirdixHcp: getProfileBirdixHcp(profile),
        rivalId: rival?.id,
        rivalName: teamB.map((p) => p.name).join(" / "),
        rivalHcp: rival?.hcp,
        rivalBirdixHcp: getRivalBirdixHcp(rival),
        rivalRank: averageRank(teamB),
        teammateId: draft.teammateId,
        rival2Id: rival2?.id,
        teams: {
          A: { name: "Tu equipo", playerIds: teamA.map((p) => p.id) },
          B: { name: "Equipo rival", playerIds: teamB.map((p) => p.id) },
        },
        players,
        status: "pending",
        selectedCards: cardPicks,
      });
      onSelectCards(cardPicks);
      setView("list");
      return;
    }

    if (!selectedRival) return;
    setCreating(true);
    setCreateError(null);
    try {
      const match = await createMatchApi({
        courseId: course.id,
        courseName: course.name,
        rivalId: selectedRival.id,
        rivalName: selectedRival.full_name,
        holesCount: Number(draft.holes),
        selectedCards: cardPicks,
      });
      onCreateMatch({
        ...match,
        matchType: "1v1",
        format: "1 vs 1",
        date: new Date().toISOString(),
        playerHcp: normalizeHcp(profile?.hcp),
        playerBirdixHcp: getProfileBirdixHcp(profile),
        rivalHcp: match.rivalBirdixHcp,
        status: "pending",
        selectedCards: cardPicks,
        isRealMatch: true,
        playerSide: "player_a",
      });
      onSelectCards(cardPicks);
      setView("list");
    } catch (err) {
      // D6: exigir cobertura al crear, error claro + reintentar manual (este
      // mismo botón), sin outbox — la creación es una acción única, no algo
      // que reintentar solo en segundo plano como los golpes/cartas.
      setCreateError(err?.message || "No se pudo crear la partida. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setCreating(false);
    }
  };

  const toggleCard = (cardId) => {
    setCardPicks((curr) => {
      if (curr.includes(cardId)) return curr.filter((c) => c !== cardId);
      if (curr.length >= required) return curr;
      return [...curr, cardId];
    });
  };

  const renderPlayerPicker = (label, keyName) => (
    <div>
      <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2.5">{label}</span>
      <div className="space-y-2.5">
        {FAKE_RIVALS.map((r) => {
          const active = draft[keyName] === r.id;
          const disabled = draftIsTeamMatch && !active && [draft.teammateId, draft.rivalId, draft.rival2Id].includes(r.id);
          return (
            <button
              key={r.id}
              disabled={disabled}
              onClick={() => setDraft({ ...draft, [keyName]: r.id })}
              className={`w-full flex items-center gap-3 p-3 rounded-[24px] ring-1 transition-all duration-200 active:scale-[0.99] ${active
                ? "ring-[#00703a]/40 ring-2 bg-[#E6F4ED] shadow-[0_12px_28px_rgba(1,79,42,0.10)]"
                : disabled
                  ? "ring-slate-100 bg-slate-50 opacity-45 cursor-not-allowed"
                  : "ring-black/5 bg-white hover:ring-[#00703a]/20 hover:shadow-sm"
                }`}
            >
              <Avatar initials={r.avatar} size="md" tone={active ? "emerald" : "slate"} />
              <div className="text-left flex-1">
                <p className="font-black text-slate-950 text-[14px] leading-tight">{r.name}</p>
                <p className="text-[12px] text-slate-500">Birdix HCP {formatBirdixHcp(getRivalBirdixHcp(r))} · {r.club}</p>
              </div>
              <div className="text-right">
                <DivisionBadge points={r.rank} compact />
                <p className="text-[11px] text-slate-500 mt-1 font-semibold">{r.rank} pts</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderRivalSearch = () => (
    <div>
      <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2.5">Rival</span>
      {selectedRival ? (
        <button
          onClick={() => {
            setSelectedRival(null);
            setRivalQuery("");
          }}
          className="w-full flex items-center gap-3 p-3 rounded-[24px] ring-2 ring-[#00703a]/40 bg-[#E6F4ED] shadow-[0_12px_28px_rgba(1,79,42,0.10)] transition-all duration-200 active:scale-[0.99]"
        >
          <Avatar initials={initialsFromName(selectedRival.full_name)} size="md" tone="emerald" />
          <div className="text-left flex-1">
            <p className="font-black text-slate-950 text-[14px] leading-tight">
              {selectedRival.full_name} <span className="text-slate-400 font-bold">{shortPlayerCode(selectedRival.id)}</span>
            </p>
            <p className="text-[12px] text-slate-500">Birdix HCP {formatBirdixHcp(selectedRival.birdix_hcp)}</p>
          </div>
          <span className="text-[11px] text-slate-400 font-bold">Cambiar</span>
        </button>
      ) : (
        <>
          <Field label="Buscar por nombre" value={rivalQuery} onChange={setRivalQuery} placeholder="Nombre del rival" icon={Search} />
          {rivalSearchError && <p className="text-[12px] text-[#A8543F] font-semibold mt-2">{rivalSearchError}</p>}
          {rivalSearching && <p className="text-[12px] text-slate-400 font-semibold mt-2">Buscando…</p>}
          {!rivalSearching && rivalQuery.trim() && rivalResults.length === 0 && !rivalSearchError && (
            <p className="text-[12px] text-slate-400 font-semibold mt-2">Sin resultados para "{rivalQuery.trim()}".</p>
          )}
          <div className="space-y-2.5 mt-2.5">
            {rivalResults.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRival(r);
                  setRivalResults([]);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-[24px] ring-1 ring-black/5 bg-white hover:ring-[#00703a]/20 hover:shadow-sm transition-all duration-200 active:scale-[0.99]"
              >
                <Avatar initials={initialsFromName(r.full_name)} size="md" tone="slate" />
                <div className="text-left flex-1">
                  <p className="font-black text-slate-950 text-[14px] leading-tight">
                    {r.full_name} <span className="text-slate-400 font-bold">{shortPlayerCode(r.id)}</span>
                  </p>
                  <p className="text-[12px] text-slate-500">Birdix HCP {formatBirdixHcp(r.birdix_hcp)}</p>
                </div>
                <DivisionBadge points={r.points} compact />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  /* ----- Vista lista ----- */
  if (view === "list") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-[26px] font-black tracking-tight text-slate-900">Partidas</h1>
          <button onClick={startCreate} className="h-11 w-11 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg">
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>

        {activeMatch && (
          <Card className="ring-[#00703a]/30 ring-2">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <Pill tone="emerald" icon={CircleDot}>Partida activa</Pill>
                <span className="text-[12px] text-slate-500 font-semibold">
                  {formatDate(activeMatch.date || new Date().toISOString())} · {(activeMatch.date || "").slice(11, 16) || "--:--"}
                </span>
              </div>
              <h3 className="font-black text-slate-900 text-lg mt-2">
                {isTeamMatch(activeMatch) ? (
                  "Tu equipo vs Equipo rival"
                ) : (
                  <>
                    vs {activeMatch.rivalName || "Rival"}
                    {activeMatch.rivalId && <span className="text-slate-400 font-bold"> {shortPlayerCode(activeMatch.rivalId)}</span>}
                  </>
                )}
              </h3>
              <p className="text-[13px] text-slate-500">{activeMatch.format || "1 vs 1"} · {getMatchHoleCount(activeMatch)} hoyos · {activeMatch.course || "Campo sin definir"}</p>
              {isTeamMatch(activeMatch) ? (
                <p className="text-[12px] text-slate-500 mt-1">
                  {(activeMatch.players || []).filter((p) => p.team === "A").map((p) => p.name).join(" + ")} · vs · {(activeMatch.players || []).filter((p) => p.team === "B").map((p) => p.name).join(" + ")}
                </p>
              ) : (
                <p className="text-[12px] text-slate-500 mt-1">Birdix HCP {formatBirdixHcp(activeMatch.playerBirdixHcp ?? profile?.birdixHcp ?? profile?.hcp)} · Rival {formatBirdixHcp(activeMatch.rivalBirdixHcp ?? activeMatch.rivalHcp)}</p>
              )}
              <div className="mt-3 flex items-center gap-1.5">
                {selectedCardIds.map((id) => {
                  const c = CARDS.find((x) => x.id === id);
                  if (!c) return null;
                  const Icon = c.icon;
                  return (
                    <span key={id} className={`${c.chip} text-white text-[11px] font-bold rounded-full px-2.5 py-1 flex items-center gap-1`}>
                      <Icon size={12} strokeWidth={2.5} />
                      {c.name}
                    </span>
                  );
                })}
              </div>
              <div className="mt-4">
                <PrimaryButton icon={Flag} onClick={onOpenActive}>Jugar ahora</PrimaryButton>
              </div>
            </div>
          </Card>
        )}

      </div>
    );
  }

  /* ----- Vista creación ----- */
  if (view === "create") {
    return (
      <div className="-mx-4 sm:-mx-6 -mt-6 min-h-[calc(100vh-96px)] bg-[#F5FBF7] px-4 sm:px-6 pt-6 pb-6 space-y-5 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="h-10 w-10 rounded-full bg-white ring-1 ring-black/5 shadow-sm flex items-center justify-center active:scale-95 transition">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00703a] font-black">Nueva partida</p>
            <h1 className="text-[26px] font-black tracking-tight text-slate-950 leading-tight">Configura el duelo</h1>
          </div>
        </div>

        <Card className="p-5 space-y-5 rounded-[30px] ring-black/5 shadow-[0_20px_55px_rgba(1,79,42,0.08)]">
          <div>
            <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2">Formato</span>
            <SegmentedControl
              options={[{ value: "1v1", label: "1 vs 1" }, { value: "2v2", label: "2 vs 2", disabled: true }]}
              value={draft.format}
              onChange={(v) => setDraft({ ...draft, format: v })}
            />
          </div>
          <div>
            <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2">Duración</span>
            <SegmentedControl
              options={[{ value: "9", label: "9 hoyos" }, { value: "18", label: "18 hoyos" }]}
              value={draft.holes}
              onChange={(v) => setDraft({ ...draft, holes: v })}
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4 rounded-[30px] ring-black/5 shadow-sm">
          <div>
            <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2">Campo</span>
            <select
              value={draft.course}
              onChange={(e) => setDraft({ ...draft, course: e.target.value })}
              disabled={!courses.length}
              className="w-full bg-white rounded-[22px] ring-1 ring-black/5 py-3.5 px-4 text-[15px] font-semibold text-slate-950 shadow-sm outline-none focus:ring-[#00703a] focus:ring-2 transition disabled:opacity-50"
            >
              {courses.length ? (
                courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              ) : (
                <option value="">{coursesError ? "No se pudieron cargar los campos" : "Cargando campos…"}</option>
              )}
            </select>
            {coursesError && <p className="text-[11px] text-[#A8543F] mt-2 font-semibold">{coursesError}</p>}
            {!coursesError && courses.length > 0 && (
              <p className="text-[11px] text-slate-500 mt-2 font-semibold">{selectedCourse.location}</p>
            )}
          </div>
        </Card>

        <Card className="p-5 space-y-5 rounded-[30px] ring-black/5 shadow-sm">
          {draftIsTeamMatch ? (
            <>
              <div className="rounded-[24px] bg-[#E6F4ED] ring-1 ring-[#00703a]/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#014F2A] font-black">Equipo A</p>
                <p className="text-[13px] text-[#014F2A] font-bold mt-0.5">Tú + compañero seleccionado</p>
              </div>
              {renderPlayerPicker("Compañero", "teammateId")}
              {renderPlayerPicker("Rival 1", "rivalId")}
              {renderPlayerPicker("Rival 2", "rival2Id")}
              {!teamSelectionReady && (
                <p className="text-[12px] text-[#A8543F] font-semibold">Elige tres jugadores distintos para crear la partida 2 vs 2.</p>
              )}
            </>
          ) : (
            renderRivalSearch()
          )}
        </Card>

        <button
          onClick={goToCardPick}
          disabled={!canContinueToCards}
          className="w-full rounded-[24px] bg-[#00703a] px-5 py-4 text-white shadow-[0_18px_36px_rgba(1,79,42,0.20)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between active:scale-[0.985] transition-all duration-200"
        >
          <span className="flex items-center gap-2 font-black text-[15px]"><Layers size={18} strokeWidth={2.5} />Elegir cartas ({required})</span>
          <ArrowRight size={18} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  /* ----- Vista selección de cartas ----- */
  if (view === "cards") {
    const deckComplete = cardPicks.length === required;
    const deckRingDeg = Math.max(0, Math.min(360, (cardPicks.length / required) * 360));
    return (
      <div className="-mx-4 sm:-mx-6 -mt-6 min-h-[calc(100vh-96px)] bg-gradient-to-b from-[#F3F4F6] via-[#FAF8F1] to-[#FAF8F1] px-4 sm:px-6 pt-6 pb-6 space-y-5 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("create")} className="h-10 w-10 rounded-full bg-white shadow-surface flex items-center justify-center active:scale-95 transition">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00703a] font-black">Mazo privado</p>
            <h1 className="text-[26px] font-black tracking-tight text-slate-950 leading-tight">Elige tus cartas</h1>
            <p className="text-[13px] text-slate-500 font-semibold mt-0.5">Selección secreta · el rival no las verá hasta que las uses.</p>
          </div>
        </div>

        <div className={deckComplete ? "glow-behind" : ""} style={deckComplete ? { "--glow-color": "var(--glow-green)", borderRadius: 30 } : undefined}>
          <Card className="p-5 rounded-[30px] bg-white ring-black/5 shadow-surface">
            <div className="flex items-center gap-4">
              <div
                className="relative h-16 w-16 flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-300"
                style={{ background: `conic-gradient(${deckComplete ? "#00703a" : "#CA8A04"} ${deckRingDeg}deg, #E5E7EB ${deckRingDeg}deg 360deg)` }}
              >
                <div className="h-[52px] w-[52px] rounded-full bg-white flex items-center justify-center">
                  <p className="font-display text-[17px] text-slate-950 leading-none">{cardPicks.length}/{required}</p>
                </div>
              </div>
              <div className="flex-1">
                <span className="text-[11px] uppercase tracking-[0.16em] font-black text-slate-500">Selección</span>
                <p className="text-[14px] font-bold text-slate-900 mt-0.5">{deckComplete ? "Mazo completo" : `Elige ${required - cardPicks.length} más`}</p>
                <div className="mt-2"><Pill tone="emerald" icon={EyeOff}>Privadas</Pill></div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {CARDS.map((c) => (
            <BirdixCard
              key={c.id}
              card={c}
              selected={cardPicks.includes(c.id)}
              onClick={() => {
                if (cardPicks.includes(c.id) || cardPicks.length < required) {
                  toggleCard(c.id);
                } else {
                  setCardModal(c);
                }
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-center pt-1">
          <button onClick={() => setShowHowCardsWork(true)} className="text-[#00703a] text-[13px] font-black active:scale-[0.99] transition">
            ¿Cómo funcionan las cartas?
          </button>
        </div>

        <div className="sticky bottom-24 pt-2 space-y-2">
          {createError && (
            <p className="text-[12px] text-[#A8543F] font-semibold text-center px-2">{createError}</p>
          )}
          <button
            onClick={confirmMatch}
            disabled={cardPicks.length !== required || creating}
            className="w-full rounded-[24px] bg-[#00703a] px-5 py-4 text-white shadow-[0_18px_36px_rgba(1,79,42,0.22)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between active:scale-[0.985] transition-all duration-200"
          >
            <span className="flex items-center gap-2 font-black text-[15px]">
              <Check size={18} strokeWidth={2.5} />
              {creating ? "Creando…" : createError ? "Reintentar" : "Confirmar partida"}
            </span>
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        </div>

        {cardModal && <CardModal card={cardModal} onClose={() => setCardModal(null)} />}
        {showHowCardsWork && <HowCardsWorkModal onClose={() => setShowHowCardsWork(false)} />}
      </div>
    );
  }
};

/**
 * Explica el mecanismo de las cartas (D25, 27 ago 2026; reescrita en D26
 * tras feedback directo del fundador — la primera versión resultaba lioso).
 * Antes reutilizaba CardModal con la primera carta del mazo por accidente,
 * así que en vez de explicar el sistema mostraba la ficha de "Segundo
 * Golpe" sin venir a cuento. Solo texto, sin enlace de salida — "Ver las
 * cartas" sacaba de la pantalla de creación de partida y perdía la
 * selección en curso.
 */
const HowCardsWorkModal = ({ onClose }) => (
  <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={onClose}>
    <div className="bg-white rounded-3xl max-w-[420px] w-full overflow-hidden ring-1 ring-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="p-5 flex items-start justify-between">
        <h3 className="font-black text-slate-900 text-lg">¿Cómo funcionan las cartas?</h3>
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
          <X size={18} />
        </button>
      </div>
      <div className="px-5 pb-5 space-y-3">
        {[
          "Eliges tus cartas en secreto — ni tu rival sabe cuáles son hasta que las juegues.",
          "Antes de cada hoyo, y antes de tu primer golpe, decides si juegas una carta o no.",
          "En cuanto los dos habéis decidido, se revelan y ambos sabéis qué cartas se han jugado.",
          "El efecto se aplica solo a tu puntuación — 2 cartas (Driver Prohibido, Palo Prohibido) no la tocan: sois los jugadores quienes os encargáis de cumplirlas en el campo.",
          "9 hoyos → 2 cartas. 18 hoyos → 4 cartas. Máximo 1 carta por hoyo, siempre.",
        ].map((line, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-[#E6F4ED] text-[#00703a] text-[12px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
            <p className="text-slate-700 text-[14px] leading-relaxed">{line}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ConfirmDialog = ({ title, message, confirmLabel = "Salir", cancelLabel = "Seguir jugando", onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
    <div className="bg-white rounded-3xl w-full max-w-[360px] p-5 shadow-surface" onClick={(e) => e.stopPropagation()}>
      <h3 className="font-black text-slate-900 text-lg mb-1.5">{title}</h3>
      <p className="text-[13px] text-slate-500 mb-5">{message}</p>
      <div className="flex flex-col gap-2">
        <button onClick={onConfirm} className="w-full rounded-2xl bg-[#D67560] text-white font-bold text-[14px] py-3 active:scale-[0.98] transition">
          {confirmLabel}
        </button>
        <button onClick={onCancel} className="w-full rounded-2xl bg-slate-100 text-slate-900 font-bold text-[14px] py-3 active:scale-[0.98] transition">
          {cancelLabel}
        </button>
      </div>
    </div>
  </div>
);

const CardModal = ({ card, onClose }) => {
  const Icon = card.icon;
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-[420px] w-full overflow-hidden ring-1 ring-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`p-5 ${card.accent}`}>
          <div className="flex items-start justify-between">
            <div className={`${card.chip} text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full`}>{card.type}</div>
            <button onClick={onClose} className="h-9 w-9 rounded-full bg-white/70 backdrop-blur flex items-center justify-center">
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-white/70 backdrop-blur flex items-center justify-center ring-1 ring-black/5">
              <Icon size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="font-black text-[20px] leading-tight">{card.name}</h3>
              <p className="text-[12px] opacity-80">{card.short}</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <p className="text-slate-700 text-[14px] leading-relaxed">{card.desc}</p>
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   11 · SCREEN · CARDS (mazo completo)
   --------------------------------------------------------------------------*/

const CardsScreen = ({ onBack }) => {
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return CARDS;
    return CARDS.filter((c) => c.type.toLowerCase() === filter);
  }, [filter]);

  return (
    <div className="space-y-5">
      <div>
        {onBack && (
          <button onClick={onBack} className="h-9 w-9 -ml-1 mb-2 rounded-full bg-white shadow-surface flex items-center justify-center text-slate-700">
            <ArrowLeft size={18} />
          </button>
        )}
        <h1 className="text-[26px] font-black tracking-tight text-slate-900">Cartas Birdix</h1>
        <p className="text-[13px] text-slate-500 mt-1">Tu mazo oficial. {CARDS.length} cartas. Estrategia infinita.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { v: "all", l: "Todas" },
          { v: "ofensiva", l: "Ofensiva" },
          { v: "defensa", l: "Defensa" },
          { v: "sabotaje", l: "Sabotaje" },
          { v: "reacción", l: "Reacción" },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition ${filter === f.v ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-700"
              }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((c) => (
          <BirdixCard key={c.id} card={c} onClick={() => setModal(c)} />
        ))}
      </div>

      {modal && <CardModal card={modal} onClose={() => setModal(null)} />}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   12 · SCREEN · RANKING
   --------------------------------------------------------------------------*/

const RankingScreen = ({ profile, ranking, position }) => {
  const displayRanking = toRankingPoints(ranking);
  const division = getDivision(displayRanking);
  const nextDiv = getNextDivision(displayRanking);
  const progress = nextDiv ? ((displayRanking - division.min) / (nextDiv.min - division.min)) * 100 : 100;
  const firstName = profile?.name?.split(" ")[0] || "Tú";

  const playerEntry = { name: profile?.name || "Tú", points: displayRanking, change: 0, you: true };
  const around = useMemo(() => {
    const base = [
      { name: "Sergio Lara", points: displayRanking + 80, change: 1 },
      { name: "Eva Núñez", points: displayRanking + 35, change: -1 },
      playerEntry,
      { name: "Tomás Ruiz", points: Math.max(0, displayRanking - 22), change: 2 },
      { name: "Clara Gil", points: Math.max(0, displayRanking - 60), change: -3 },
    ];
    return base.sort((a, b) => b.points - a.points);
  }, [displayRanking, profile]);

  return (
    <div className="space-y-5">
      <h1 className="text-[26px] font-black tracking-tight text-slate-900">Ranking</h1>

      <Card className="shadow-surface">
        <div className={`p-5 bg-gradient-to-br ${division.ring} ${division.text} rounded-3xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown size={18} strokeWidth={2.5} />
              <span className="font-bold uppercase tracking-wider text-[12px]">División {division.name}</span>
            </div>
            <span className="font-bold text-[12px]">#{position.toLocaleString("es-ES")}</span>
          </div>
          <p className="font-display text-[48px] leading-none mt-5">{displayRanking}</p>
          <p className="text-[12px] font-semibold opacity-80 mt-1">puntos de ranking</p>
          {nextDiv && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-1.5 text-[11px] font-bold">
                <span>Hacia {nextDiv.name}</span>
                <span>{nextDiv.min - displayRanking} pts</span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/15 overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Ladder de divisiones — dónde estás en el recorrido completo del Rango */}
      <Card className="p-4 shadow-surface">
        <div className="flex items-center justify-between">
          {DIVISIONS.map((d, i) => {
            const isCurrent = d.key === division.key;
            const isPast = displayRanking > d.max;
            return (
              <React.Fragment key={d.key}>
                {i > 0 && <div className="flex-1 h-px mx-1" style={{ background: isPast || isCurrent ? DIVISIONS[i - 1].hex : "#E5E7EB" }} />}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div
                    className="rounded-full flex items-center justify-center transition-all"
                    style={{
                      width: isCurrent ? 34 : 22,
                      height: isCurrent ? 34 : 22,
                      background: isCurrent || isPast ? d.hex : "#E5E7EB",
                      boxShadow: isCurrent ? `0 0 0 4px ${d.hex}22` : "none",
                    }}
                  >
                    {isCurrent && <Crown size={14} className="text-white" strokeWidth={2.5} />}
                  </div>
                  <p className={`text-[8px] font-black uppercase tracking-wide ${isCurrent ? "text-slate-900" : "text-slate-400"}`}>{d.name}</p>
                  <p className="text-[7px] text-slate-400 font-bold">{d.min}+</p>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      <div>
        <SectionTitle>Top jugadores</SectionTitle>
        <Card className="overflow-hidden shadow-surface">
          {FAKE_TOP.map((p, i) => (
            <div key={p.name} className={`flex items-center gap-3 p-3.5 ${i < FAKE_TOP.length - 1 ? "border-b border-slate-100" : ""}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center font-black text-[12px] ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-50 text-slate-500"}`}>
                {i + 1}
              </div>
              <Avatar initials={p.name.split(" ").map((x) => x[0]).join("")} size="sm" tone={i === 0 ? "amber" : "slate"} />
              <div className="flex-1">
                <p className="font-bold text-slate-900 text-[14px]">{p.name}</p>
                <p className="text-[11px] text-slate-500 font-semibold">{getDivision(p.points).name}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-[17px] text-slate-900">{p.points}</p>
                <span className={`text-[11px] font-bold inline-flex items-center gap-0.5 ${p.change > 0 ? "text-[#00703a]" : p.change < 0 ? "text-[#A8543F]" : "text-slate-500"}`}>
                  {p.change > 0 ? <TrendingUp size={11} /> : p.change < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                  {Math.abs(p.change)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionTitle>Cerca de ti</SectionTitle>
        <Card className="overflow-hidden shadow-surface">
          {around.map((p, i) => (
            <div key={i} className={`flex items-center gap-3 p-3.5 ${p.you ? "bg-[#E6F4ED]" : ""} ${i < around.length - 1 ? "border-b border-slate-100" : ""}`}>
              <div className="h-8 w-8 rounded-full flex items-center justify-center font-black text-[12px] bg-slate-50 text-slate-500">
                {position + (i - 2)}
              </div>
              <Avatar initials={p.you ? firstName.charAt(0).toUpperCase() : p.name.split(" ").map((x) => x[0]).join("")} size="sm" tone={p.you ? "emerald" : "slate"} />
              <div className="flex-1">
                <p className={`font-bold text-[14px] ${p.you ? "text-[#014F2A]" : "text-slate-900"}`}>{p.you ? `${p.name} (tú)` : p.name}</p>
                <p className="text-[11px] text-slate-500 font-semibold">{getDivision(p.points).name}</p>
              </div>
              <p className="font-display text-[17px] text-slate-900">{p.points}</p>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   13 · SCREEN · PROFILE
   --------------------------------------------------------------------------*/

const ProfileScreen = ({ profile, userId, matches, ranking, onLogout }) => {
  const displayRanking = toRankingPoints(ranking);
  const nextDivision = getNextDivision(displayRanking);
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const draws = matches.filter((m) => m.result === "draw").length;
  const total = matches.length;
  const winRate = total ? Math.round((wins / total) * 100) : 0;

  // racha actual: cuenta seguida de victorias desde el principio
  let streak = 0;
  for (const m of matches) {
    if (m.result === "win") streak++;
    else break;
  }

  // Carta más usada
  const cardCount = {};
  matches.forEach((m) => m.cardsUsed?.forEach((c) => (cardCount[c] = (cardCount[c] || 0) + 1)));
  const favCardId = Object.entries(cardCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const favCard = favCardId ? CARDS.find((c) => c.id === favCardId) : null;

  const initials = (profile?.name || "?").split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  const division = getDivision(displayRanking);
  const divisionProgress = nextDivision ? ((displayRanking - division.min) / (nextDivision.min - division.min)) * 100 : 100;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-black tracking-tight text-slate-900">Perfil</h1>
      </div>

      <Card className="p-5 shadow-surface">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 flex-shrink-0 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(${division.hex} 0deg 320deg, #E5E7EB 320deg 360deg)` }}>
            <div className="h-[52px] w-[52px] rounded-full bg-white flex items-center justify-center">
              <Avatar initials={initials} size="md" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="font-black text-slate-900 text-xl leading-tight">
              {profile?.name}
              {userId && <span className="text-slate-400 font-bold text-[14px]"> {shortPlayerCode(userId)}</span>}
            </h2>
            <p className="text-[13px] text-slate-500">{profile?.club}</p>
            {userId && <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Tu código de jugador — compártelo si hay más de un {profile?.name?.split(" ")[0] || "jugador"} en la búsqueda</p>}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="font-display text-[13px] px-2.5 py-1 rounded-full" style={{ background: `${division.hex}1a`, color: division.hex }}>{division.name}</span>
              <Pill tone="slate">Hándicap Birdix {formatBirdixHcp(getProfileBirdixHcp(profile))}</Pill>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-2xl p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Ranking</p>
            <p className="font-display text-[19px] text-slate-900 mt-0.5">{displayRanking}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Racha</p>
            <p className="font-display text-[19px] text-slate-900 mt-0.5">{streak}🔥</p>
          </div>
        </div>
      </Card>

      <div>
        <SectionTitle>Estadísticas</SectionTitle>
        <Card className="p-4 shadow-surface">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "PJ", value: total },
              { label: "V", value: wins, tone: "text-[#00703a]" },
              { label: "D", value: losses, tone: "text-[#A8543F]" },
              { label: "E", value: draws, tone: "text-slate-700" },
            ].map((s) => (
              <div key={s.label}>
                <p className={`font-black text-xl ${s.tone || "text-slate-900"}`}>{s.value}</p>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">% Victoria</span>
              <span className="font-bold text-slate-900 text-[13px]">{winRate}%</span>
            </div>
            <ProgressBar value={winRate} max={100} />
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                {nextDivision ? `Progreso a ${nextDivision.name}` : "Máxima división"}
              </span>
              <span className="font-bold text-slate-900 text-[13px]">
                {nextDivision ? `${nextDivision.min - displayRanking} pts` : "Leyenda"}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${divisionProgress}%`, background: division.hex }} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Formato favorito</p>
              <p className="font-bold text-slate-900 mt-0.5">{profile?.format === "2v2" ? "2 vs 2" : "1 vs 1"}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Mejor racha</p>
              <p className="font-bold text-slate-900 mt-0.5">{Math.max(streak, 0)} victorias</p>
            </div>
          </div>
        </Card>
      </div>

      {favCard && (
        <div>
          <SectionTitle>Carta más usada</SectionTitle>
          <BirdixCard card={favCard} size="md" showDesc />
        </div>
      )}

      <div>
        <SectionTitle>Historial reciente</SectionTitle>
        {matches.length === 0 ? (
          <Card><EmptyState icon={Swords} title="Sin partidas registradas" description="Tu historial aparecerá aquí." /></Card>
        ) : (
          <div className="space-y-3">{matches.slice(0, 5).map((m) => <MatchCard key={m.id} match={m} />)}</div>
        )}
      </div>

      <button
        onClick={onLogout}
        className="w-full bg-white text-[#A8543F] ring-1 ring-[#D67560]/30 hover:bg-[#FBEAE3] rounded-2xl py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 transition"
      >
        <LogOut size={18} strokeWidth={2.5} />
        Cerrar sesión
      </button>

      <p className="text-center text-[11px] text-slate-400 pt-2">Birdix · v0.1 prototipo</p>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   14 · SCREEN · STABLEFORD (registrar resultado hoyo por hoyo)
   --------------------------------------------------------------------------*/

const ScoreInput = ({ label, value, onChange, min = 1, max = 12, tone = "default" }) => {
  const hasValue = hasStrokeInput(value);
  const safeValue = hasValue ? clampNumber(value, min, max, min) : "";
  const stepBase = hasValue ? safeValue : min;
  const primary = tone === "primary";
  return (
    <div className={`flex items-center justify-between rounded-2xl gap-3 ${primary ? "bg-[#E6F4ED] px-4 py-3.5 shadow-surface" : "bg-slate-50 px-3 py-2.5"}`}>
      <span className={`uppercase tracking-wider font-semibold ${primary ? "text-[13px] text-[#014F2A] font-black" : "text-[12px] text-slate-500"}`}>{label}</span>
      <div className={`flex items-center shrink-0 ${primary ? "gap-3" : "gap-2"}`}>
        <button
          type="button"
          aria-label={`Reducir ${label}`}
          onClick={() => onChange(clampNumber(stepBase - 1, min, max, min))}
          className={`rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition ${primary ? "h-11 w-11" : "h-9 w-9"}`}
        >
          <Minus size={primary ? 16 : 14} strokeWidth={3} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={safeValue}
          onChange={(e) => onChange(e.target.value === "" ? "" : clampNumber(e.target.value, min, max, stepBase))}
          className={`rounded-xl bg-white ring-1 ring-slate-200 text-center outline-none focus:ring-2 focus:ring-[#00703a] ${primary ? "h-11 w-16 font-display text-[24px] text-slate-950" : "h-9 w-12 font-black text-lg text-slate-900"}`}
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          onClick={() => onChange(clampNumber(stepBase + 1, min, max, min))}
          className={`rounded-full bg-[#00703a] text-white flex items-center justify-center active:scale-95 transition ${primary ? "h-11 w-11" : "h-9 w-9"}`}
        >
          <Plus size={primary ? 16 : 14} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

const TeamStablefordScreen = ({ match, selectedCards, ranking, playerBirdixHcp, onFinish, onCancel }) => {
  const total = getMatchHoleCount(match);
  const matchCourse = getCourseById(match?.courseId || match?.course, null);
  const courseReady = hasVerifiedScorecard(matchCourse, total);
  const courseHoles = courseReady ? getCourseHoles(matchCourse.id, total) : [];
  const selectedCardIds = Array.isArray(selectedCards) ? selectedCards : [];
  const players = useMemo(() => getTeamPlayers(match, ranking, playerBirdixHcp), [match, ranking, playerBirdixHcp]);
  const teamA = useMemo(() => players.filter((p) => p.team === "A"), [players]);
  const teamB = useMemo(() => players.filter((p) => p.team === "B"), [players]);
  const currentUser = players.find((p) => p.isCurrentUser) || teamA[0];
  const defaultTargetId = teamB[0]?.id || "";
  const [hole, setHole] = useState(0);
  const [holes, setHoles] = useState(() =>
    courseReady
      ? Array.from({ length: total }, (_, i) => {
        const courseHole = courseHoles[i];
        return {
          par: courseHole.par,
          strokeIndex: courseHole.strokeIndex,
          meters: courseHole.meters,
          scores: Object.fromEntries(players.map((p) => [p.id, ""])),
          cardId: null,
          cardTargetId: defaultTargetId,
          penalty: false,
        };
      })
      : []
  );
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    setHole((h) => clampNumber(h, 0, total - 1, 0));
  }, [total]);

  const usedCardIds = holes.map((h, i) => (i === hole ? null : h.cardId)).filter(Boolean);

  const computed = useMemo(() => {
    const runningByPlayer = Object.fromEntries(players.map((p) => [p.id, 0]));
    const baselineHcp = players.length ? Math.min(...players.map((p) => normalizeBirdixHcp(p.birdixHcp))) : 0;
    let runningTeamA = 0;
    let runningTeamB = 0;

    return holes.map((h, i) => {
      const par = clampNumber(h.par, 3, 6, 4);
      const strokeIndex = clampNumber(h.strokeIndex, 1, 18, (courseHoles[i] || {}).strokeIndex || i + 1);
      const scores = {};

      players.forEach((p) => {
        const raw = h.scores?.[p.id];
        const hasScore = hasStrokeInput(raw);
        const strokes = hasScore ? clampNumber(raw, 1, 12, par) : null;
        const hcpStroke = strokesForIndex(Math.max(0, normalizeBirdixHcp(p.birdixHcp) - baselineHcp), strokeIndex);
        const net = hasScore ? strokes - hcpStroke : null;
        const netDiff = hasScore ? net - par : null;
        const base = hasScore ? calculateStablefordPoints(net, par) : 0;
        scores[p.id] = { ...p, hasScore, strokes, hcpStroke, net, netDiff, base, delta: 0, points: base };
      });

      const card = h.cardId ? CARDS.find((c) => c.id === h.cardId) : null;
      const self = scores[currentUser?.id];
      const target = scores[h.cardTargetId] || scores[defaultTargetId];
      let note = null;

      if (card && self) {
        if (!self.hasScore) {
          note = `${card.name}: introduce tus golpes`;
        } else {
          switch (card.id) {
            case "double":
              self.delta += self.base > 0 ? self.base : 0;
              note = self.base > 0 ? "Todo o Nada: tus puntos x2" : "Todo o Nada: sin puntos que duplicar";
              break;
            case "steal":
              if (target?.hasScore && self.base > target.base) {
                self.delta += 1;
                target.delta -= 1;
                note = `Roba Punto: +1 / ${target.name} -1`;
              } else {
                note = "Roba Punto: no activa";
              }
              break;
            case "safe-hole":
              self.delta += self.base === 0 ? 1 : 0;
              note = self.base === 0 ? "Hoyo Seguro: +1" : "Hoyo Seguro: ya sumas";
              break;
            case "birdix-prize":
              if (self.netDiff <= -2) {
                self.delta += 3;
                note = "Premio Birdix: +3";
              } else if (self.netDiff === -1) {
                self.delta += 2;
                note = "Premio Birdix: +2";
              } else {
                note = "Premio Birdix: sin birdie neto";
              }
              break;
            case "comeback":
              if (target?.hasScore && runningTeamA < runningTeamB && self.base > target.base) {
                self.delta += 2;
                note = "Remontada: +2";
              } else {
                note = "Remontada: no activa";
              }
              break;
            case "no-driver":
            case "no-club":
            case "block":
              note = target ? `${card.name}: objetivo ${target.name}` : `${card.name}: sin objetivo`;
              break;
            default:
              note = `${card.name}: sin efecto de puntos`;
          }
        }
      }

      players.forEach((p) => {
        scores[p.id].points = Math.max(0, scores[p.id].base + scores[p.id].delta);
        runningByPlayer[p.id] += scores[p.id].points;
      });

      const teamAHole = teamA.reduce((sum, p) => sum + (scores[p.id]?.points || 0), 0);
      const teamBHole = teamB.reduce((sum, p) => sum + (scores[p.id]?.points || 0), 0);
      runningTeamA += teamAHole;
      runningTeamB += teamBHole;

      return {
        par,
        strokeIndex,
        scores,
        note,
        teamAHole,
        teamBHole,
        runningTeamA,
        runningTeamB,
        runningByPlayer: { ...runningByPlayer },
      };
    });
  }, [holes, players, teamA, teamB, courseHoles, currentUser?.id, defaultTargetId]);

  const final = computed[computed.length - 1];
  const teamATotal = final?.runningTeamA || 0;
  const teamBTotal = final?.runningTeamB || 0;

  if (!courseReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="px-5 pt-5 pb-3 max-w-[900px] mx-auto w-full">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center">
            <X size={18} />
          </button>
        </header>
        <div className="px-5 flex-1 max-w-[900px] mx-auto w-full flex items-center">
          <Card className="p-5 w-full">
            <EmptyState
              icon={Flag}
              title="Tarjeta oficial pendiente"
              description={`${matchCourse?.name || match?.course || "Este campo"} estará disponible cuando tengamos par e índice de dificultad verificados.`}
              action={<SecondaryButton onClick={onCancel}>Volver a partidas</SecondaryButton>}
            />
          </Card>
        </div>
      </div>
    );
  }

  const current = holes[hole] || holes[0] || { par: 4, strokeIndex: 1, scores: {}, cardId: null, cardTargetId: defaultTargetId, penalty: false };
  const cur = computed[hole] || computed[0] || { par: 4, strokeIndex: 1, scores: {}, teamAHole: 0, teamBHole: 0, runningTeamA: 0, runningTeamB: 0, runningByPlayer: {}, note: null };

  const updateHole = (patch) => {
    setHoles((arr) =>
      arr.map((h, i) => {
        if (i !== hole) return h;
        const next = { ...h, ...patch };
        const par = clampNumber(next.par, 3, 6, 4);
        const scores = Object.fromEntries(
          players.map((p) => {
            const value = next.scores?.[p.id] ?? "";
            return [p.id, value === "" ? "" : clampNumber(value, 1, 12, par)];
          })
        );
        return { ...next, par, scores };
      })
    );
  };

  const updatePlayerScore = (playerId, value) => {
    updateHole({ scores: { ...(current.scores || {}), [playerId]: value } });
  };

  const finish = () => {
    if (isFinishing) return;
    setIsFinishing(true);
    const result = calculateMatchWinner(teamATotal, teamBTotal);
    const teamBResult = oppositeResult(result);
    const teamAAvg = averageRank(teamA);
    const teamBAvg = averageRank(teamB);
    const teamADelta = calculateEloDelta(teamAAvg, teamBAvg, result);
    const teamBDelta = calculateEloDelta(teamBAvg, teamAAvg, teamBResult);
    const rankedPlayers = players.map((p) => {
      const playerResult = p.team === "A" ? result : teamBResult;
      const delta = p.team === "A" ? teamADelta : teamBDelta;
      return {
        ...p,
        totalPoints: final?.runningByPlayer?.[p.id] || 0,
        result: playerResult,
        recordDelta: {
          wins: playerResult === "win" ? 1 : 0,
          losses: playerResult === "loss" ? 1 : 0,
          draws: playerResult === "draw" ? 1 : 0,
        },
        rankingDelta: delta,
        rankAfter: toRankingPoints(p.rank + delta),
        streakAfter: playerResult === "win" ? 1 : 0,
      };
    });
    const finalMatch = {
      ...match,
      id: match?.id || "m_" + Date.now(),
      matchType: "2v2",
      format: "2 vs 2",
      holes: total,
      course: match?.course || "Campo sin definir",
      date: match?.date || new Date().toISOString(),
      status: "finished",
      result,
      rivalName: teamB.map((p) => p.name).join(" / ") || "Equipo rival",
      playerPoints: teamATotal,
      rivalPoints: teamBTotal,
      teamPoints: { A: teamATotal, B: teamBTotal },
      teamRankingDelta: { A: teamADelta, B: teamBDelta },
      players: rankedPlayers,
      cardsUsed: holes.map((h) => h.cardId).filter(Boolean),
      rankingDelta: teamADelta,
      holeScores: holes.map((h, i) => ({ ...h, ...(computed[i] || {}) })),
      finishedAt: new Date().toISOString(),
    };
    onFinish(finalMatch, teamADelta);
  };

  const selectedCard = current.cardId ? CARDS.find((c) => c.id === current.cardId) : null;
  const SelectedCardIcon = selectedCard?.icon;

  return (
    <div className="min-h-screen bg-[#F7FAF7] flex flex-col">
      <header className="px-5 pt-5 pb-4 max-w-[900px] mx-auto w-full sticky top-0 z-20 bg-[#F7FAF7]/95 backdrop-blur">
        <div className="flex items-center justify-between">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center active:scale-95 transition">
            <X size={18} />
          </button>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00703a] font-black">Partida 2 vs 2</p>
            <p className="font-black text-slate-950 text-[17px] leading-tight mt-0.5">Tu equipo vs Equipo rival</p>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Stableford · Birdix HCP</p>
          </div>
          <div className="h-10 w-10" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 items-stretch">
          <div className="bg-white rounded-[22px] ring-1 ring-[#00703a]/15 shadow-sm p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Equipo A</p>
            <p className="font-black text-[#00703a] text-2xl leading-none mt-1">{teamATotal}</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mt-1">pts</p>
            <p className="text-[10px] text-slate-500 font-semibold mt-1 truncate">{teamA.map((p) => p.name.split(" ")[0]).join(" + ")}</p>
          </div>
          <div className="text-center rounded-[22px] bg-slate-950 text-white px-2.5 py-3 shadow-md shadow-slate-900/10">
            <p className="text-[10px] uppercase tracking-wider text-white/55 font-semibold">Hoyo</p>
            <p className="font-black text-2xl leading-none mt-1">{hole + 1}<span className="text-sm text-white/45">/{total}</span></p>
            <p className="text-[10px] text-[#6EE7B7] font-bold mt-1">Index {cur.strokeIndex}</p>
          </div>
          <div className="bg-white rounded-[22px] ring-1 ring-[#A8543F]/15 shadow-sm p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Equipo B</p>
            <p className="font-black text-[#A8543F] text-2xl leading-none mt-1">{teamBTotal}</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mt-1">pts</p>
            <p className="text-[10px] text-slate-500 font-semibold mt-1 truncate">{teamB.map((p) => p.name.split(" ")[0]).join(" + ")}</p>
          </div>
        </div>
      </header>

      <div className="px-5 flex-1 max-w-[900px] mx-auto w-full space-y-4 pb-32">
        <Card className="p-5 space-y-4 ring-slate-200 shadow-surface">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Tarjeta del hoyo {hole + 1}</span>
            <div className="flex items-center gap-1.5">
              <Pill tone="slate" icon={Flag}>Par {current.par}</Pill>
              <Pill tone="slate">Index {cur.strokeIndex}</Pill>
            </div>
          </div>

          <ScoreInput label="Par" value={current.par} onChange={(v) => updateHole({ par: v })} min={3} max={6} />

          <div className="grid grid-cols-1 gap-2">
            {players.map((p) => {
              const score = cur.scores?.[p.id] || {};
              return (
                <div key={p.id} className={`rounded-[22px] p-3 ring-1 ${p.team === "A" ? "bg-[#E6F4ED]/80 ring-[#00703a]/10" : "bg-[#FBEAE3]/70 ring-[#A8543F]/10"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[14px] font-black text-slate-950 leading-tight">{p.name}</p>
                      <p className="text-[11px] text-slate-500 font-semibold">B-HCP {formatBirdixHcp(p.birdixHcp)}</p>
                    </div>
                    <Pill tone={score.hcpStroke > 0 ? "emerald" : "slate"}>{score.hcpStroke > 0 ? `Recibe +${score.hcpStroke}` : "Sin golpe"}</Pill>
                  </div>
                  <ScoreInput label="Golpes" value={current.scores?.[p.id] ?? ""} onChange={(v) => updatePlayerScore(p.id, v)} />
                </div>
              );
            })}
          </div>

          <button
            onClick={() => updateHole({ penalty: !current.penalty })}
            aria-label="Alternar penalización"
            title="Alternar penalización"
            className={`w-full flex items-center justify-end rounded-2xl px-3 py-2.5 ring-1 transition ${current.penalty ? "bg-[#FBEAE3] ring-[#D67560]/30" : "bg-slate-50 ring-slate-100"
              }`}
          >
            <span className={`h-5 w-9 rounded-full flex items-center transition ${current.penalty ? "bg-[#D67560] justify-end" : "bg-slate-300 justify-start"} p-0.5`}>
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
          </button>
        </Card>

        <Card className="p-5 ring-slate-200 shadow-surface">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Carta del hoyo</span>
            <button onClick={() => setShowCardPicker(true)} className="rounded-full bg-[#E6F4ED] px-3 py-1.5 text-[#00703a] text-[12px] font-black active:scale-95 transition">{current.cardId ? "Cambiar" : "Elegir"}</button>
          </div>
          {selectedCard ? (
            <div className={`mt-3 ${selectedCard.accent} rounded-[22px] p-3.5 ring-1 ring-black/5`}>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-white/75 flex items-center justify-center shadow-sm">{SelectedCardIcon && <SelectedCardIcon size={18} strokeWidth={2.5} />}</div>
                <div className="flex-1">
                  <p className="font-black text-[15px] leading-tight">{selectedCard.name}</p>
                  <p className="text-[11px] opacity-80">{selectedCard.short}</p>
                </div>
                <button onClick={() => updateHole({ cardId: null, cardTargetId: defaultTargetId })} className="h-8 w-8 rounded-full bg-white/80 shadow-sm flex items-center justify-center active:scale-95 transition"><X size={14} /></button>
              </div>
              {cardNeedsTarget(selectedCard.id) && (
                <label className="block mt-3">
                  <span className="block text-[10px] uppercase tracking-wider font-bold opacity-70 mb-1">Objetivo</span>
                  <select
                    value={current.cardTargetId || defaultTargetId}
                    onChange={(e) => updateHole({ cardTargetId: e.target.value })}
                    className="w-full rounded-xl bg-white/80 px-3 py-2 text-[13px] font-bold outline-none"
                  >
                    {teamB.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <button onClick={() => setShowCardPicker(true)} className="mt-3 w-full rounded-[22px] bg-slate-50 ring-1 ring-slate-100 px-4 py-4 text-left active:scale-[0.99] transition">
              <p className="text-[13px] font-black text-slate-900">Sin carta seleccionada</p>
              <p className="text-[12px] text-slate-500 mt-0.5">Disponibles: {Math.max(0, selectedCardIds.length - usedCardIds.length)}</p>
            </button>
          )}
        </Card>

        <Card className="p-5 bg-slate-950 text-white ring-slate-900 shadow-lg shadow-slate-900/10">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.16em] text-[#6EE7B7] font-black">Stableford equipos</span>
            <Info size={14} className="opacity-50" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[{ label: "Equipo A", players: teamA, total: cur.runningTeamA, tone: "text-[#6EE7B7]" }, { label: "Equipo B", players: teamB, total: cur.runningTeamB, tone: "text-[#F4B2A6]" }].map((team) => (
              <div key={team.label} className="rounded-2xl bg-white/[0.06] px-3 py-3 ring-1 ring-white/10">
                <p className={`text-[11px] uppercase tracking-wider font-semibold ${team.tone}`}>{team.label}</p>
                <p className="font-black text-4xl leading-none mt-1">{team.total}</p>
                <div className="mt-2 space-y-1.5">
                  {team.players.map((p) => {
                    const s = cur.scores?.[p.id] || {};
                    return (
                      <div key={p.id} className="text-[11px] text-white/65">
                        <span className="font-bold text-white/85">{p.name.split(" ")[0]}</span> · {s.hasScore ? `${s.points} pts · gross ${s.strokes} · net ${s.net}` : "sin golpes"}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl bg-white/[0.06] px-3 py-2 text-[12px] text-white/75 font-bold">
            Hoyo: {cur.teamAHole} - {cur.teamBHole}
          </div>
          {cur?.note && (
            <div className="mt-3 rounded-2xl bg-[#00703a]/20 px-3 py-2 text-[12px] text-[#6EE7B7] font-bold flex items-center gap-1.5">
              <Sparkles size={12} /> {cur.note}
            </div>
          )}
        </Card>

        <Card className="p-3 ring-slate-200 shadow-surface">
          <div className="grid grid-cols-9 gap-1 text-center">
            {holes.slice(0, Math.min(9, total)).map((h, i) => (
              <button key={i} onClick={() => setHole(i)} className={`rounded-xl py-1.5 transition active:scale-95 ${i === hole ? "bg-[#00703a] text-white shadow-sm" : "bg-slate-100 text-slate-700"}`}>
                <p className="text-[10px] font-bold">Hoyo</p>
                <p className="text-[13px] font-black">{i + 1}</p>
              </button>
            ))}
          </div>
          {total > 9 && (
            <div className="grid grid-cols-9 gap-1 text-center mt-1">
              {holes.slice(9).map((h, i) => (
                <button key={i + 9} onClick={() => setHole(i + 9)} className={`rounded-xl py-1.5 transition active:scale-95 ${i + 9 === hole ? "bg-[#00703a] text-white shadow-sm" : "bg-slate-100 text-slate-700"}`}>
                  <p className="text-[10px] font-bold">Hoyo</p>
                  <p className="text-[13px] font-black">{i + 10}</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl ring-1 ring-slate-100 z-30 shadow-[0_-12px_30px_rgba(15,23,42,0.08)]">
        <div className="max-w-[900px] mx-auto px-5 py-3 flex items-center gap-2">
          <button onClick={() => setHole(Math.max(0, hole - 1))} disabled={hole === 0} className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center disabled:opacity-30 active:scale-95 transition">
            <ChevronLeft size={20} />
          </button>
          {hole < total - 1 ? (
            <PrimaryButton onClick={() => setHole(hole + 1)} icon={ArrowRight}>Siguiente hoyo</PrimaryButton>
          ) : (
            <PrimaryButton onClick={finish} icon={Trophy} tone="dark" disabled={isFinishing}>
              {isFinishing ? "Guardando…" : "Finalizar partida"}
            </PrimaryButton>
          )}
        </div>
      </div>

      {showCardPicker && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-3" onClick={() => setShowCardPicker(false)}>
          <div className="bg-white rounded-3xl w-full max-w-[420px] p-4 ring-1 ring-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-slate-900 text-lg">Usar carta en hoyo {hole + 1}</h3>
              <button onClick={() => setShowCardPicker(false)} className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <p className="text-[12px] text-slate-500 mb-3">Las cartas las juega el usuario actual. Las ofensivas pueden elegir rival.</p>
            <div className="grid grid-cols-2 gap-3">
              {selectedCardIds
                .filter((id) => {
                  const c = CARDS.find((x) => x.id === id);
                  if (!c) return false;
                  if (usedCardIds.includes(id) && current.cardId !== id) return true;
                  const priorA = hole > 0 ? computed[hole - 1]?.runningTeamA || 0 : 0;
                  const priorB = hole > 0 ? computed[hole - 1]?.runningTeamB || 0 : 0;
                  return isCardPlayable(c, { isBehind: priorA < priorB });
                })
                .map((id) => {
                const c = CARDS.find((x) => x.id === id);
                if (!c) return null;
                const used = usedCardIds.includes(id) && current.cardId !== id;
                return (
                  <BirdixCard
                    key={id}
                    card={c}
                    selected={current.cardId === id}
                    used={used}
                    onClick={() => {
                      updateHole({ cardId: id, cardTargetId: cardNeedsTarget(id) ? current.cardTargetId || defaultTargetId : defaultTargetId });
                      setShowCardPicker(false);
                    }}
                    size="sm"
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MatchPlayScreen = ({ match, selectedCards, ranking, playerBirdixHcp, onFinish, onCancel }) => {
  const total = getMatchHoleCount(match);
  const rivalName = match?.rivalName || "Rival";
  const playerMatchHcp = normalizeBirdixHcp(match?.playerBirdixHcp ?? playerBirdixHcp ?? match?.playerHcp);
  const rivalMatchHcp = normalizeBirdixHcp(match?.rivalBirdixHcp ?? match?.rivalHcp);
  const matchCourse = getCourseById(match?.courseId || match?.course, null);
  const courseReady = hasVerifiedScorecard(matchCourse, total);
  const courseHoles = courseReady ? getCourseHoles(matchCourse.id, total) : [];
  const selectedCardIds = Array.isArray(selectedCards) ? selectedCards : [];
  const [hole, setHole] = useState(0);
  const [holes, setHoles] = useState(() =>
    courseReady
      ? Array.from({ length: total }, (_, i) => {
        const courseHole = courseHoles[i];
        return {
          par: courseHole.par,
          strokeIndex: courseHole.strokeIndex,
          meters: courseHole.meters,
          strokes: "",
          rivalStrokes: "",
          cardId: null,
          penalty: false,
        };
      })
      : []
  );
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [revealCard, setRevealCard] = useState(null);
  const [showHoleDetail, setShowHoleDetail] = useState(false);

  useEffect(() => {
    setHole((h) => clampNumber(h, 0, total - 1, 0));
  }, [total]);

  useEffect(() => {
    if (!revealCard) return;
    const t = setTimeout(() => setRevealCard(null), 1100);
    return () => clearTimeout(t);
  }, [revealCard]);

  const usedCardIds = holes.map((h, i) => (i === hole ? null : h.cardId)).filter(Boolean);

  // Puntos Stableford calculados por hoyo con golpes recibidos por Birdix HCP.
  const computed = useMemo(() => {
    let runningPlayer = 0;
    let runningRival = 0;
    const rows = holes.map((h, i) => {
      const par = clampNumber(h.par, 3, 6, 4);
      const strokeIndex = clampNumber(h.strokeIndex, 1, 18, (courseHoles[i] || {}).strokeIndex || i + 1);
      const playerHasScore = hasStrokeInput(h.strokes);
      const rivalHasScore = hasStrokeInput(h.rivalStrokes);
      const strokes = playerHasScore ? clampNumber(h.strokes, 1, 12, par) : null;
      const rivalStrokes = rivalHasScore ? clampNumber(h.rivalStrokes, 1, 12, par) : null;
      const hcpStrokes = getHandicapStrokesForHole(playerMatchHcp, rivalMatchHcp, strokeIndex);
      const playerNet = playerHasScore ? strokes - hcpStrokes.player : null;
      const rivalNet = rivalHasScore ? rivalStrokes - hcpStrokes.rival : null;
      const playerNetDiff = playerHasScore ? playerNet - par : null;
      const rivalNetDiff = rivalHasScore ? rivalNet - par : null;
      const playerBase = playerHasScore ? calculateStablefordPoints(playerNet, par) : 0;
      const rivalBase = rivalHasScore ? calculateStablefordPoints(rivalNet, par) : 0;
      const card = h.cardId ? CARDS.find((c) => c.id === h.cardId) : null;
      const fx = applyStablefordCardEffect(card, {
        playerHasScore,
        rivalHasScore,
        playerBase,
        rivalBase,
        playerNetDiff,
        rivalNetDiff,
        hasPenalty: h.penalty,
        isBehind: runningPlayer < runningRival,
      });
      const playerHole = Math.max(0, playerBase + (fx.delta || 0));
      const rivalHole = Math.max(0, rivalBase + (fx.rivalDelta || 0));
      runningPlayer += playerHole;
      runningRival += rivalHole;
      return {
        par,
        strokeIndex,
        strokes,
        rivalStrokes,
        playerHasScore,
        rivalHasScore,
        playerHcpStroke: hcpStrokes.player,
        rivalHcpStroke: hcpStrokes.rival,
        playerNet,
        rivalNet,
        playerNetDiff,
        rivalNetDiff,
        playerBase,
        rivalBase,
        playerCardDelta: fx.delta || 0,
        rivalCardDelta: fx.rivalDelta || 0,
        note: fx.note,
        playerHole,
        rivalHole,
        runningPlayer,
        runningRival,
      };
    });
    return rows;
  }, [holes, playerMatchHcp, rivalMatchHcp]);

  const final = computed[computed.length - 1];
  const playerTotal = final?.runningPlayer || 0;
  const rivalTotal = final?.runningRival || 0;

  if (!courseReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="px-5 pt-5 pb-3 max-w-[900px] mx-auto w-full">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center">
            <X size={18} />
          </button>
        </header>
        <div className="px-5 flex-1 max-w-[900px] mx-auto w-full flex items-center">
          <Card className="p-5 w-full">
            <EmptyState
              icon={Flag}
              title="Tarjeta oficial pendiente"
              description={`${matchCourse?.name || match?.course || "Este campo"} estará disponible cuando tengamos par e índice de dificultad verificados.`}
              action={<SecondaryButton onClick={onCancel}>Volver a partidas</SecondaryButton>}
            />
          </Card>
        </div>
      </div>
    );
  }

  const finish = () => {
    if (isFinishing) return;
    setIsFinishing(true);
    const result = calculateMatchWinner(playerTotal, rivalTotal);
    const rankingDelta = calculateEloDelta(ranking, match?.rivalRank || 1000, result);
    const finalMatch = {
      ...match,
      id: match?.id || "m_" + Date.now(),
      format: match?.format || "1 vs 1",
      holes: total,
      course: match?.course || "Campo sin definir",
      date: match?.date || new Date().toISOString(),
      rivalName,
      playerHcp: match?.playerHcp ?? playerMatchHcp,
      rivalHcp: match?.rivalHcp ?? rivalMatchHcp,
      playerBirdixHcp: playerMatchHcp,
      rivalBirdixHcp: rivalMatchHcp,
      rivalRank: match?.rivalRank || 1000,
      status: "finished",
      result,
      playerPoints: playerTotal,
      rivalPoints: rivalTotal,
      cardsUsed: holes.map((h) => h.cardId).filter(Boolean),
      rankingDelta,
      holeScores: holes.map((h, i) => ({ ...h, ...(computed[i] || {}) })),
      finishedAt: new Date().toISOString(),
    };
    onFinish(finalMatch, rankingDelta);
  };

  const current = holes[hole] || holes[0] || { par: 4, strokeIndex: 1, strokes: "", rivalStrokes: "", cardId: null, penalty: false };
  const cur = computed[hole] || computed[0] || { par: 4, strokeIndex: 1, strokes: null, rivalStrokes: null, playerHasScore: false, rivalHasScore: false, playerHcpStroke: 0, rivalHcpStroke: 0, playerNet: null, rivalNet: null, playerBase: 0, rivalBase: 0, playerCardDelta: 0, rivalCardDelta: 0, playerHole: 0, rivalHole: 0, runningPlayer: 0, runningRival: 0 };

  const updateHole = (patch) => {
    setHoles((arr) =>
      arr.map((h, i) => {
        if (i !== hole) return h;
        const next = { ...h, ...patch };
        const par = clampNumber(next.par, 3, 6, 4);
        return {
          ...next,
          par,
          strokes: next.strokes === "" ? "" : clampNumber(next.strokes, 1, 12, par),
          rivalStrokes: next.rivalStrokes === "" ? "" : clampNumber(next.rivalStrokes, 1, 12, par),
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3F4F6] via-[#F7FAF7] to-white flex flex-col">
      <header className="px-5 pt-5 pb-4 max-w-[900px] mx-auto w-full sticky top-0 z-20 bg-gradient-to-b from-[#F3F4F6] to-[#F3F4F6]/85 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white shadow-surface flex items-center justify-center active:scale-95 transition">
            <X size={18} />
          </button>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00703a] font-black">Partida en curso</p>
            <p className="font-black text-slate-950 text-[16px] leading-tight mt-0.5">vs {rivalName}</p>
          </div>
          <div className="h-10 w-10" />
        </div>

        {/* Marcador unificado — un único objeto, no 3 cajas sueltas */}
        <div className="rounded-[26px] bg-gradient-to-br from-slate-900 to-slate-950 shadow-[0_20px_44px_rgba(15,23,42,0.28)] px-1 py-4 flex items-stretch">
          <div className="flex-1 text-center px-2">
            <p className="text-[10px] uppercase tracking-wider text-[#6EE7B7] font-bold">Tú</p>
            <p className="font-display text-[30px] text-white leading-none mt-1.5">{playerTotal}</p>
            <p className="text-[9px] text-white/35 font-bold mt-1">HCP {formatBirdixHcp(playerMatchHcp)}</p>
          </div>
          <div className="w-px bg-white/10 my-1" />
          <div className="flex-[1.3] text-center px-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1 text-white/40">
              <Flag size={10} />
              <p className="text-[9px] uppercase tracking-widest font-bold">Hoyo</p>
            </div>
            <p className="font-display text-[34px] text-white leading-none mt-0.5">
              {hole + 1}<span className="text-white/30 text-[15px]">/{total}</span>
            </p>
            <p className="text-[9px] text-white/40 font-semibold mt-1">Par {current.par} · Índice {cur.strokeIndex}</p>
          </div>
          <div className="w-px bg-white/10 my-1" />
          <div className="flex-1 text-center px-2">
            <p className="text-[10px] uppercase tracking-wider text-[#F4B2A6] font-bold">{rivalName.split(" ")[0]}</p>
            <p className="font-display text-[30px] text-white leading-none mt-1.5">{rivalTotal}</p>
            <p className="text-[9px] text-white/35 font-bold mt-1">HCP {formatBirdixHcp(rivalMatchHcp)}</p>
          </div>
        </div>
      </header>

      <div className="px-5 flex-1 max-w-[900px] mx-auto w-full space-y-4 pb-32">
        {/* Puntos del hoyo — el mini-resultado de cada hoyo, con el mismo lenguaje
            de resplandor que la pantalla de Resultado final: es un pago emocional
            en miniatura, se repite cada hoyo, se lo gana el mismo tratamiento. */}
        <div className="glow-behind rounded-[30px]" style={{ "--glow-color": "var(--glow-green)" }}>
          <Card className="p-6 rounded-[30px] bg-white ring-black/5 shadow-surface text-center">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Puntos del hoyo</span>
              <button onClick={() => setShowHoleDetail((v) => !v)} className="flex items-center gap-1 text-[11px] text-slate-400 font-bold active:scale-95 transition">
                Detalle <ChevronRight size={12} className={`transition-transform ${showHoleDetail ? "rotate-90" : ""}`} />
              </button>
            </div>
            <div className="flex items-center justify-center gap-7 mt-3">
              <div>
                <p className="font-display text-[64px] text-[#00703a] leading-none">{cur?.playerHole}</p>
                <p className="text-[11px] text-slate-500 font-bold mt-1.5">Tú</p>
              </div>
              <p className="font-display text-[26px] text-slate-300 mt-2">–</p>
              <div>
                <p className="font-display text-[64px] text-[#A8543F] leading-none">{cur?.rivalHole}</p>
                <p className="text-[11px] text-slate-500 font-bold mt-1.5">{rivalName.split(" ")[0]}</p>
              </div>
            </div>

            {cur?.note && (
              <div className="mt-4 inline-flex mx-auto rounded-full bg-[#E6F4ED] px-3.5 py-1.5 text-[12px] text-[#014F2A] font-bold items-center gap-1.5">
                <Sparkles size={12} /> {cur.note}
              </div>
            )}

            {showHoleDetail && (
              <div className="mt-4 grid grid-cols-2 gap-2.5 text-left">
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Tú</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {cur.playerHasScore ? `bruto ${cur.strokes} · neto ${cur.playerNet}${cur.playerHcpStroke ? ` · +${cur.playerHcpStroke} hcp` : ""}` : "Sin golpes"}
                  </p>
                  {cur.playerCardDelta ? <p className="text-[11px] text-[#00703a] font-bold mt-0.5">carta {cur.playerCardDelta >= 0 ? "+" : ""}{cur.playerCardDelta}</p> : null}
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Rival</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {cur.rivalHasScore ? `bruto ${cur.rivalStrokes} · neto ${cur.rivalNet}${cur.rivalHcpStroke ? ` · +${cur.rivalHcpStroke} hcp` : ""}` : "Sin golpes"}
                  </p>
                  {cur.rivalCardDelta ? <p className="text-[11px] text-[#A8543F] font-bold mt-0.5">carta {cur.rivalCardDelta >= 0 ? "+" : ""}{cur.rivalCardDelta}</p> : null}
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5 space-y-3 ring-slate-200 shadow-surface">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Golpes del hoyo</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateHole({ par: clampNumber(current.par - 1, 3, 6, 4) })}
                className="text-[11px] font-bold text-slate-500 bg-slate-50 rounded-full px-2.5 py-1 active:scale-95 transition"
              >
                Par {current.par}
              </button>
            </div>
          </div>

          <ScoreInput label="Tus golpes" value={current.strokes} onChange={(v) => updateHole({ strokes: v })} tone="primary" />
          <ScoreInput label="Golpes rival" value={current.rivalStrokes} onChange={(v) => updateHole({ rivalStrokes: v })} />

          {(cur.playerHcpStroke > 0 || cur.rivalHcpStroke > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-2xl px-3 py-2 text-center ring-1 ${cur.playerHcpStroke > 0 ? "bg-[#E6F4ED] text-[#00703a] ring-[#00703a]/10" : "bg-slate-50 text-slate-400 ring-slate-100"}`}>
                <p className="text-[10px] uppercase tracking-wider font-bold">Tú</p>
                <p className="text-[12px] font-black">{cur.playerHcpStroke > 0 ? `Recibes +${cur.playerHcpStroke}` : "Sin golpe"}</p>
              </div>
              <div className={`rounded-2xl px-3 py-2 text-center ring-1 ${cur.rivalHcpStroke > 0 ? "bg-[#FBEAE3] text-[#A8543F] ring-[#A8543F]/10" : "bg-slate-50 text-slate-400 ring-slate-100"}`}>
                <p className="text-[10px] uppercase tracking-wider font-bold">Rival</p>
                <p className="text-[12px] font-black">{cur.rivalHcpStroke > 0 ? `Recibe +${cur.rivalHcpStroke}` : "Sin golpe"}</p>
              </div>
            </div>
          )}

          <button
            onClick={() => updateHole({ penalty: !current.penalty })}
            className={`w-full flex items-center justify-between rounded-2xl px-3 py-2.5 ring-1 transition ${current.penalty ? "bg-[#FBEAE3] ring-[#D67560]/30" : "bg-slate-50 ring-slate-100"
              }`}
          >
            <span className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold">¿Has tenido penalización?</span>
            <span className={`h-5 w-9 rounded-full flex items-center transition ${current.penalty ? "bg-[#D67560] justify-end" : "bg-slate-300 justify-start"} p-0.5`}>
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
          </button>
        </Card>

        {current.cardId ? (
          (() => {
            const c = CARDS.find((x) => x.id === current.cardId);
            if (!c) {
              return (
                <div className="rounded-[22px] bg-white ring-1 ring-slate-200 shadow-surface p-3.5 flex items-center justify-between">
                  <p className="text-[12px] text-slate-500 font-semibold">Esta carta ya no está disponible.</p>
                  <button onClick={() => updateHole({ cardId: null })} className="text-[#00703a] text-[12px] font-bold">Quitar</button>
                </div>
              );
            }
            const Icon = c.icon;
            return (
              <div className={`${c.accent} rounded-[22px] p-4 ring-1 ring-black/5 shadow-surface flex items-center gap-3`}>
                <div className="h-11 w-11 rounded-2xl bg-white/75 shadow-sm flex items-center justify-center"><Icon size={18} strokeWidth={2.5} /></div>
                <div className="flex-1">
                  <p className="text-[9px] uppercase tracking-wider font-bold opacity-70">Carta jugada</p>
                  <p className="font-black text-[15px] leading-tight">{c.name}</p>
                </div>
                <button onClick={() => setShowCardPicker(true)} className="text-[11px] font-black underline underline-offset-2 opacity-80">Cambiar</button>
                <button onClick={() => updateHole({ cardId: null })} className="h-8 w-8 rounded-full bg-white/80 shadow-sm flex items-center justify-center active:scale-95 transition"><X size={14} /></button>
              </div>
            );
          })()
        ) : (
          <button onClick={() => setShowCardPicker(true)} className="w-full rounded-[22px] bg-white ring-1 ring-dashed ring-[#D67560]/40 shadow-surface px-4 py-4 text-left active:scale-[0.99] transition flex items-center justify-between">
            <div>
              <p className="text-[13px] font-black text-slate-900">🃏 Jugar una carta</p>
              <p className="text-[12px] text-slate-500 mt-0.5">{Math.max(0, selectedCardIds.length - usedCardIds.length)} disponibles este hoyo</p>
            </div>
            <ChevronRight size={16} className="text-[#D67560]" />
          </button>
        )}

        {/* Tu mazo — referencia rápida de qué te queda por jugar en la partida */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2 px-1">Tu mazo</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {selectedCardIds.map((id) => {
              const c = CARDS.find((x) => x.id === id);
              if (!c) return null;
              const Icon = c.icon;
              const isCurrent = current.cardId === id;
              const isUsed = usedCardIds.includes(id) && !isCurrent;
              return (
                <button
                  key={id}
                  onClick={() => setShowCardPicker(true)}
                  className={`flex-shrink-0 h-16 w-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition active:scale-95 ${isUsed ? "bg-slate-100 opacity-50" : c.accent
                    } ${isCurrent ? "ring-2 ring-[#00703a] shadow-glow-green" : "ring-1 ring-black/5 shadow-surface"}`}
                >
                  <Icon size={16} strokeWidth={2.5} />
                  <p className="text-[8px] font-black text-center leading-tight px-1">{c.name}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mini scorecard */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2 px-1">Marcador de la ronda</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {holes.map((h, i) => (
              <button
                key={i}
                onClick={() => setHole(i)}
                className={`flex-shrink-0 h-14 w-11 rounded-2xl flex flex-col items-center justify-center transition active:scale-95 ${i === hole
                  ? "bg-[#00703a] text-white shadow-glow-green"
                  : h.cardId
                    ? "bg-white ring-1 ring-[#D67560]/30 text-slate-700 shadow-surface"
                    : "bg-white ring-1 ring-slate-100 text-slate-500 shadow-surface"
                  }`}
              >
                <p className={`text-[9px] font-bold ${i === hole ? "text-white/60" : "text-slate-400"}`}>{i + 1}</p>
                <p className="text-[13px] font-display leading-none mt-0.5">
                  {computed[i]?.playerHasScore ? computed[i].playerHole : "–"}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl ring-1 ring-slate-100 z-30 shadow-[0_-12px_30px_rgba(15,23,42,0.08)]">
        <div className="max-w-[900px] mx-auto px-5 py-3 flex items-center gap-2">
          <button
            onClick={() => setHole(Math.max(0, hole - 1))}
            disabled={hole === 0}
            className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"
          >
            <ChevronLeft size={20} />
          </button>
          {hole < total - 1 ? (
            <PrimaryButton onClick={() => setHole(hole + 1)} icon={ArrowRight}>Siguiente hoyo</PrimaryButton>
          ) : (
            <PrimaryButton onClick={finish} icon={Trophy} tone="dark" disabled={isFinishing}>
              {isFinishing ? "Guardando…" : "Finalizar partida"}
            </PrimaryButton>
          )}
        </div>
      </div>

      {showCardPicker && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-3" onClick={() => setShowCardPicker(false)}>
          <div className="bg-white rounded-3xl w-full max-w-[420px] p-4 ring-1 ring-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-slate-900 text-lg">Usar carta en hoyo {hole + 1}</h3>
              <button onClick={() => setShowCardPicker(false)} className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <p className="text-[12px] text-slate-500 mb-3">Selecciona una de tus cartas disponibles.</p>
            <div className="grid grid-cols-2 gap-3">
              {selectedCardIds
                .filter((id) => {
                  const c = CARDS.find((x) => x.id === id);
                  if (!c) return false;
                  if (usedCardIds.includes(id) && current.cardId !== id) return true;
                  const priorPlayer = hole > 0 ? computed[hole - 1]?.runningPlayer || 0 : 0;
                  const priorRival = hole > 0 ? computed[hole - 1]?.runningRival || 0 : 0;
                  return isCardPlayable(c, { isBehind: priorPlayer < priorRival });
                })
                .map((id) => {
                const c = CARDS.find((x) => x.id === id);
                if (!c) return null;
                const used = usedCardIds.includes(id) && current.cardId !== id;
                return (
                  <BirdixCard
                    key={id}
                    card={c}
                    selected={current.cardId === id}
                    used={used}
                    onClick={() => {
                      updateHole({ cardId: id });
                      setShowCardPicker(false);
                      setRevealCard(c);
                    }}
                    size="sm"
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {revealCard && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setRevealCard(null)}
        >
          <div className="glow-behind" style={{ "--glow-color": "var(--glow-coral)" }}>
            <div
              className={`w-[180px] h-[240px] rounded-[26px] ${revealCard.accent} flex flex-col items-center justify-center text-center px-4 shadow-2xl`}
              style={{ animation: "birdix-card-flip 380ms cubic-bezier(.2,.8,.2,1) both" }}
            >
              <div className="h-12 w-12 rounded-2xl bg-white/70 backdrop-blur flex items-center justify-center mb-3">
                <revealCard.icon size={22} strokeWidth={2.5} />
              </div>
              <p className="font-display text-[19px] leading-tight">{revealCard.name}</p>
              <p className="text-[10px] uppercase tracking-wider opacity-70 font-bold mt-1">{revealCard.type}</p>
            </div>
          </div>
          <p className="absolute bottom-16 text-white/90 text-[13px] font-bold">¡Carta jugada! Toca para continuar.</p>
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   14.2 · SCREEN · PARTIDA REAL 1vs1 A 2 DISPOSITIVOS
   Construido en /plan-eng-review de D7 (21/23 ago 2026, T3-T9).

   Sustituye a MatchPlayScreen solo para match.isRealMatch — cada jugador
   lleva su propio móvil, sincronizado vía Supabase Realtime sobre
   match_holes. MatchPlayScreen se queda intacto para 2vs2 (local, fuera de
   alcance) y para cualquier partida antigua sin isRealMatch.

   Principios de esta pantalla (D8-D16, ver DESIGN.md "Estado de conexión"):
   - Cartas: privadas por dispositivo, escritas pronto pero ocultas en
     pantalla hasta que ambos confirman (Escudo es la única excepción —
     visible en cuanto se juega, ver deriveHoleView).
   - Golpes: cruzados (marco el golpe de mi rival) con fallback de
     auto-registro si mi rival no lo ha apuntado.
   - Resolución: cada cliente calcula y escribe SOLO su propio lado —
     simétrico, funciona igual si el rival está momentáneamente offline.
   - Nunca bloquea: se puede avanzar de hoyo con el actual sin resolver.
   --------------------------------------------------------------------------*/

/* Retomar la partida donde se dejó. Al recargar la página en mitad de una
   partida, el hoyo actual volvía siempre al primero aunque hubiera varios
   jugados: los datos seguían en Supabase, pero la pantalla te dejaba en otro
   sitio. Se vuelve al primer hoyo sin golpes propios apuntados; si ya están
   todos, al último. Solo se aplica en la hidratación inicial — un UPDATE del
   rival por Realtime nunca te mueve de hoyo mientras juegas. */
const findResumeHole = (rows, mySide, total) => {
  const byNumber = new Map((rows || []).map((r) => [r.hole_number, r]));
  for (let i = 0; i < total; i++) {
    if (!hasStrokeInput(byNumber.get(i + 1)?.[`${mySide}_strokes`])) return i;
  }
  return Math.max(total - 1, 0);
};

const RealMatchPlayScreen = ({ match, userId, ranking, playerBirdixHcp, onFinish, onCancel }) => {
  const total = getMatchHoleCount(match);
  const rivalName = match?.rivalName || "Rival";
  const playerMatchHcp = normalizeBirdixHcp(match?.playerBirdixHcp ?? playerBirdixHcp);
  const rivalMatchHcp = normalizeBirdixHcp(match?.rivalBirdixHcp ?? match?.rivalHcp);
  const mySide = match?.playerSide === "player_b" ? "player_b" : "player_a";
  const rivalSide = mySide === "player_a" ? "player_b" : "player_a";
  const matchCourse = getCourseById(match?.courseId || match?.course, null);
  const courseHoles = matchCourse ? getCourseHoles(matchCourse.id, total) : [];
  const required = total === 9 ? 2 : 4;

  const [deck, setDeck] = useState(Array.isArray(match?.selectedCards) ? match.selectedCards.filter(Boolean) : []);
  const [deckPicks, setDeckPicks] = useState([]);
  const [confirmingDeck, setConfirmingDeck] = useState(false);
  const [deckError, setDeckError] = useState(null);

  const [rowsByHole, setRowsByHole] = useState({});
  const [loadingHoles, setLoadingHoles] = useState(true);
  const [hole, setHole] = useState(0);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [revealCard, setRevealCard] = useState(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [rivalStrokesInput, setRivalStrokesInput] = useState("");
  const [selfStrokesOpen, setSelfStrokesOpen] = useState(false);
  const [selfStrokesInput, setSelfStrokesInput] = useState("");
  const [secondShotPrompt, setSecondShotPrompt] = useState(false);
  const [secondShotInput, setSecondShotInput] = useState("");
  const [revealSheetHole, setRevealSheetHole] = useState(null);
  const revealSheetShownRef = useRef({});
  const resolvedSignatures = useRef({});
  // Hoyos para los que ya ha llegado un UPDATE de Realtime desde que se
  // montó esta pantalla — protege a la hidratación inicial (más abajo) de
  // pisar un dato que ya sabemos más fresco con una foto REST más vieja.
  const realtimeSeenRef = useRef(new Set());
  // Solo la primera hidratación reposiciona el hoyo (ver findResumeHole).
  const resumedRef = useRef(false);

  // Nota: sin el efecto de "clampear hole si total cambia" que tiene
  // MatchPlayScreen — aquí `total` sale de match.holes, fijo desde que se
  // crea la partida, nunca cambia durante la vida de este componente.

  useEffect(() => {
    if (!revealCard) return;
    const t = setTimeout(() => setRevealCard(null), 1100);
    return () => clearTimeout(t);
  }, [revealCard]);

  // Sala de espera del creador (D23, 25 ago 2026): quien crea la partida
  // entra aquí directo (ya no vuelve a la lista) y espera a que el rival
  // haya abierto la partida al menos una vez — señal de "se ha unido" más
  // temprana que confirmar mazo, y la única que no exige tocar nada nuevo
  // en Supabase salvo esta misma marca. Se marca mi propia apertura al
  // montar (no-op si ya estaba marcada) y, solo si soy quien creó la
  // partida, se sondea cada 3s hasta ver que el rival también la abrió.
  const [rivalOpened, setRivalOpened] = useState(mySide !== "player_a");
  useEffect(() => {
    if (userId) markMatchOpened({ matchId: match.id, userId }).catch(() => {});
  }, [match.id, userId]);
  useEffect(() => {
    if (mySide !== "player_a" || rivalOpened) return undefined;
    let cancelled = false;
    const check = () => {
      getMatchPlayersStatus(match.id)
        .then((rows) => {
          if (cancelled) return;
          const rival = rows.find((r) => r.side === rivalSide);
          if (rival?.opened_at) setRivalOpened(true);
        })
        .catch(() => {
          // Sin cobertura — se reintenta en el próximo tick, sin romper la
          // espera ni mostrar un error por algo que se resuelve solo.
        });
    };
    check();
    const intervalId = setInterval(check, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [mySide, rivalOpened, match.id, rivalSide]);

  // Hidratación inicial: lo que ya existiera en match_holes antes de que
  // este dispositivo abriera la partida (holes que el rival ya empezó, o
  // una sesión anterior propia).
  useEffect(() => {
    let cancelled = false;
    listMatchHoles(match.id)
      .then((rows) => {
        if (cancelled) return;
        setRowsByHole((prev) => mergeHydratedHoles(prev, rows, realtimeSeenRef.current));
        if (!resumedRef.current) {
          resumedRef.current = true;
          setHole(findResumeHole(rows, mySide, total));
        }
        setLoadingHoles(false);
      })
      .catch(() => setLoadingHoles(false));
    return () => {
      cancelled = true;
    };
  }, [match.id]);

  // Realtime — cada UPDATE de match_holes de esta partida (mío o del
  // rival) llega aquí y se funde en el estado local.
  const { status: connectionStatus } = useMatchRealtime(match.id, {
    onChange: (payload) => {
      const row = payload?.new;
      if (!row) return;
      realtimeSeenRef.current.add(row.hole_number);
      setRowsByHole((prev) => ({ ...prev, [row.hole_number]: row }));
    },
  });

  // Escritura optimista: funde el patch en el estado local YA, antes de que
  // vuelva el eco de Realtime, y lo encola hacia Supabase (queueMatchHoleWrite
  // ya fusiona/deduplica, ver matchSync.js). Sin esto, tus propias acciones
  // (golpes, carta jugada) no se ven en tu propia pantalla hasta que el
  // UPDATE vuelve confirmado — en cobertura de campo, varios segundos.
  const writeHolePatch = (hn, patch) => {
    setRowsByHole((prev) => ({
      ...prev,
      [hn]: { ...(prev[hn] || { hole_number: hn }), ...patch },
    }));
    queueMatchHoleWrite({ matchId: match.id, holeNumber: hn, patch });
  };

  const holeNumber = hole + 1;
  const rawRow = rowsByHole[holeNumber] || { hole_number: holeNumber };
  const view = deriveHoleView(rawRow, mySide);
  const currentCourseHole = courseHoles[hole] || { par: 4, strokeIndex: hole + 1, meters: null };
  const usedCardIds = deck.filter((id) => {
    if (id === view.my.card) return false;
    return Object.values(rowsByHole).some((r) => r[`${mySide}_card`] === id);
  });

  // Resolución conjunta: cada cliente calcula y escribe solo su propio
  // lado en cuanto tiene ambos golpes crudos y ambos jugadores han
  // decidido su jugada del hoyo (D10, D12). Se vuelve a resolver si algo
  // relevante cambia después (p.ej. Segundo Golpe cambia mi golpe tras una
  // primera resolución) — la firma evita bucles y recálculos de más.
  useEffect(() => {
    Object.keys(rowsByHole).forEach((hnKey) => {
      const hn = Number(hnKey);
      const row = rowsByHole[hn];
      const v = deriveHoleView(row, mySide);
      const bothStrokes = hasStrokeInput(row[`${mySide}_strokes`]) && hasStrokeInput(row[`${rivalSide}_strokes`]);
      const decided = bothPlayersDecided(v);
      if (!bothStrokes || !decided) return;

      const signature = [row[`${mySide}_card`], row[`${mySide}_strokes`], row[`${rivalSide}_card`], row[`${rivalSide}_strokes`]].join("|");
      if (resolvedSignatures.current[hn] === signature) return;
      resolvedSignatures.current[hn] = signature;

      const idx = hn - 1;
      const courseHole = courseHoles[idx] || { par: 4, strokeIndex: hn };
      const base = computeBaseHoleScores({
        par: courseHole.par,
        strokeIndex: courseHole.strokeIndex,
        playerAHcp: mySide === "player_a" ? playerMatchHcp : rivalMatchHcp,
        playerBHcp: mySide === "player_a" ? rivalMatchHcp : playerMatchHcp,
        playerAStrokes: row.player_a_strokes,
        playerBStrokes: row.player_b_strokes,
      });
      const myBase = base[mySide === "player_a" ? "playerA" : "playerB"];
      const rivalBase = base[mySide === "player_a" ? "playerB" : "playerA"];

      const resolution = resolveHoleCards({
        playerCard: row[`${mySide}_card`] || null,
        playerChoiceMade: v.my.cardConfirmed || v.my.holeSubmitted,
        rivalCard: row[`${rivalSide}_card`] || null,
        rivalChoiceMade: v.rival.cardConfirmed || v.rival.holeSubmitted,
      });

      let priorMe = 0;
      let priorRival = 0;
      for (let i = 0; i < idx; i++) {
        const r = rowsByHole[i + 1];
        if (!r) continue;
        priorMe += r[`${mySide}_stableford`] || 0;
        priorRival += r[`${rivalSide}_stableford`] || 0;
      }

      const myCard = row[`${mySide}_card`] ? CARDS.find((c) => c.id === row[`${mySide}_card`]) : null;
      const fx = applyCardToBaseScore(myCard, {
        base: myBase.base,
        rivalBase: rivalBase.base,
        netDiff: myBase.netDiff,
        rivalNetDiff: rivalBase.netDiff,
        hasScore: myBase.hasScore,
        rivalHasScore: rivalBase.hasScore,
        isBehind: priorMe < priorRival,
        cancelledByBlock: resolution.playerCancelled,
      });
      const myFinalStableford = Math.max(0, myBase.base + (fx.delta || 0));

      const patch = {
        [`${mySide}_hcp_strokes`]: myBase.hcpStrokes,
        [`${mySide}_net`]: myBase.net,
        [`${mySide}_stableford`]: myFinalStableford,
        [`${mySide}_card_applied`]: true,
      };
      if (resolution.playerCancelled) {
        patch[`${mySide}_card_cancelled_reason`] = "Anulada por Bloqueo rival";
      }
      if ((v.my.cardConfirmed || v.my.holeSubmitted) && (v.rival.cardConfirmed || v.rival.holeSubmitted) && !row.cards_revealed) {
        patch.cards_revealed = true;
      }
      writeHolePatch(hn, patch);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsByHole, mySide, rivalSide, playerMatchHcp, rivalMatchHcp, match.id]);

  // Cierra mi ventana de elección de este hoyo en cuanto mi propio golpe
  // llega (lo cruce mi rival o lo apunte yo de fallback, da igual quién lo
  // escribió) si todavía no había elegido carta — Decision 4: "cuando los
  // dos han elegido, o entra el primer golpe, lo que ocurra primero". Sin
  // esto, un hoyo sin carta de ninguno de los 2 nunca llegaría a
  // bothPlayersDecided() y jamás se resolvería.
  const submittedHolesRef = useRef({});
  useEffect(() => {
    Object.keys(rowsByHole).forEach((hnKey) => {
      const hn = Number(hnKey);
      const row = rowsByHole[hn];
      if (submittedHolesRef.current[hn]) return;
      const alreadySubmitted = Boolean(row[`${mySide}_hole_submitted`]);
      const alreadyChoseCard = Boolean(row[`${mySide}_card_confirmed`]);
      if (alreadySubmitted || alreadyChoseCard) {
        submittedHolesRef.current[hn] = true;
        return;
      }
      if (!hasStrokeInput(row[`${mySide}_strokes`])) return;
      submittedHolesRef.current[hn] = true;
      writeHolePatch(hn, { [`${mySide}_hole_submitted`]: true });
    });
  }, [rowsByHole, mySide, match.id]);

  // Marcador — totales corriendo y qué hoyos siguen pendientes de resolver.
  const holeSummaries = useMemo(() => {
    const rows = Array.from({ length: total }, (_, i) => {
      const hn = i + 1;
      const row = rowsByHole[hn] || { hole_number: hn };
      const v = deriveHoleView(row, mySide);
      const started = hasStrokeInput(row[`${mySide}_strokes`]) || hasStrokeInput(row[`${rivalSide}_strokes`]) || Boolean(v.my.card);
      const pending = started && !v.my.cardApplied;
      return { holeNumber: hn, view: v, pending };
    });
    return rows.reduce((acc, r) => {
      const prev = acc[acc.length - 1];
      const runningMe = (prev?.runningMe || 0) + (r.view.my.stableford || 0);
      const runningRival = (prev?.runningRival || 0) + (r.view.rival.stableford || 0);
      acc.push({ ...r, runningMe, runningRival });
      return acc;
    }, []);
  }, [rowsByHole, mySide, rivalSide, total]);

  const playerTotal = holeSummaries[holeSummaries.length - 1]?.runningMe || 0;
  const rivalTotal = holeSummaries[holeSummaries.length - 1]?.runningRival || 0;
  const currentPending = holeSummaries[hole]?.pending || false;
  const priorSummary = hole > 0 ? holeSummaries[hole - 1] : null;
  const isBehind = priorSummary ? priorSummary.runningMe < priorSummary.runningRival : false;

  // Hoja de revelación del efecto (D18/D19, /design-consultation 25 ago
  // 2026): se abre sola, una única vez por hoyo, en el instante exacto en
  // que ambos han decidido Y el hoyo termina de resolverse — nunca antes,
  // rompería el equilibrio de Bloqueo (depende de que nadie vea la jugada
  // del rival hasta que los dos hayan decidido la suya). Si navegas a otro
  // hoyo antes de que resuelva, no reaparece retroactivamente al volver:
  // solo dispara mientras sigues viendo el hoyo que se acaba de resolver.
  useEffect(() => {
    const summary = holeSummaries[hole];
    if (!summary || summary.pending) return;
    const v = summary.view;
    if (!v.cardsRevealed || !v.my.cardApplied) return;
    if (!v.my.card && !v.rival.card) return; // nada que revelar, hoyo sin cartas
    if (revealSheetShownRef.current[summary.holeNumber]) return;
    revealSheetShownRef.current[summary.holeNumber] = true;
    setRevealSheetHole(summary.holeNumber);
  }, [holeSummaries, hole]);

  if (!matchCourse) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="px-5 pt-5 pb-3 max-w-[900px] mx-auto w-full">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center">
            <X size={18} />
          </button>
        </header>
        <div className="px-5 flex-1 max-w-[900px] mx-auto w-full flex items-center">
          <Card className="p-5 w-full">
            <EmptyState icon={Flag} title="Campo no encontrado" description="No se pudo cargar la tarjeta de este campo." action={<SecondaryButton onClick={onCancel}>Volver a partidas</SecondaryButton>} />
          </Card>
        </div>
      </div>
    );
  }

  // Sala de espera (D23): solo el creador pasa por aquí, y solo hasta que
  // el rival haya abierto la partida al menos una vez.
  if (!rivalOpened) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F3F4F6] via-[#FAF8F1] to-[#FAF8F1] flex flex-col">
        <header className="px-5 pt-5 pb-3 max-w-[900px] mx-auto w-full">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white shadow-surface flex items-center justify-center active:scale-95 transition">
            <X size={18} />
          </button>
        </header>
        <div className="px-5 flex-1 max-w-[900px] mx-auto w-full flex flex-col items-center justify-center text-center pb-16">
          <div className="h-16 w-16 rounded-2xl bg-white shadow-surface flex items-center justify-center mb-5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#9CA3AF] animate-pulse" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#00703a] font-black">Partida creada</p>
          <h1 className="text-[24px] font-black tracking-tight text-slate-950 leading-tight mt-1.5">
            Esperando a {rivalName.split(" ")[0]}
          </h1>
          <p className="text-[13px] text-slate-500 font-semibold mt-2 max-w-[280px]">
            En cuanto {rivalName.split(" ")[0]} abra la partida en su móvil, pasáis directos a jugar.
          </p>
          <Card className="mt-6 p-4 rounded-[24px] ring-black/5 shadow-sm w-full max-w-[280px] text-left">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-black">{matchCourse.name}</p>
            <p className="text-[13px] text-slate-700 font-bold mt-1">{total} hoyos · vs {rivalName} {match?.rivalId && <span className="text-slate-400 font-semibold">{shortPlayerCode(match.rivalId)}</span>}</p>
          </Card>
        </div>
      </div>
    );
  }

  // Selección de mazo (D9, revertida por D26 el 27 ago 2026): si todavía no
  // he elegido mis cartas para esta partida (p.ej. soy el rival, la partida
  // ya la creó el otro jugador), hace falta elegir antes de jugar. El mazo
  // es realmente secreto — match_player_decks solo deja leer tu propia
  // fila (RLS), el rival nunca ve qué cartas elegiste hasta que las juegues.
  if (deck.length !== required) {
    const deckComplete = deckPicks.length === required;
    const confirmDeckPicks = async () => {
      if (deckPicks.length !== required) return;
      setConfirmingDeck(true);
      setDeckError(null);
      try {
        await confirmDeck({ matchId: match.id, userId, selectedCards: deckPicks });
        setDeck(deckPicks);
      } catch (err) {
        setDeckError(err?.message || "No se pudo guardar tu mazo. Inténtalo de nuevo.");
      } finally {
        setConfirmingDeck(false);
      }
    };
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F3F4F6] via-[#FAF8F1] to-[#FAF8F1] px-4 sm:px-6 pt-6 pb-6 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white shadow-surface flex items-center justify-center active:scale-95 transition">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00703a] font-black">
              vs {rivalName} {match?.rivalId && <span className="opacity-60">{shortPlayerCode(match.rivalId)}</span>}
            </p>
            <h1 className="text-[26px] font-black tracking-tight text-slate-950 leading-tight">Elige tus cartas</h1>
            <p className="text-[13px] text-slate-500 font-semibold mt-0.5">Elige en secreto — ni tu rival sabrá qué cartas tienes hasta que las juegues.</p>
          </div>
        </div>
        <Card className="p-5 rounded-[30px] bg-white ring-black/5 shadow-surface space-y-2.5">
          <div className="flex gap-2">
            {Array.from({ length: required }).map((_, i) => (
              <div key={i} className={`flex-1 h-2 rounded-full transition-colors ${i < deckPicks.length ? "bg-[#00703a]" : "bg-slate-200"}`} />
            ))}
          </div>
          <p className="text-[13px] font-bold text-slate-900">{deckPicks.length}/{required} elegidas</p>
        </Card>
        {CARD_GROUP_ORDER.map((groupType) => {
          const groupCards = CARDS.filter((c) => c.type === groupType);
          if (!groupCards.length) return null;
          return (
            <div key={groupType}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{groupType}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                {groupCards.map((c) => (
                  <BirdixCard
                    key={c.id}
                    card={c}
                    selected={deckPicks.includes(c.id)}
                    onClick={() =>
                      setDeckPicks((curr) => {
                        if (curr.includes(c.id)) return curr.filter((x) => x !== c.id);
                        if (curr.length >= required) return curr;
                        return [...curr, c.id];
                      })
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
        {deckError && <p className="text-[12px] text-[#A8543F] font-semibold text-center">{deckError}</p>}
        <button
          onClick={confirmDeckPicks}
          disabled={!deckComplete || confirmingDeck}
          className="w-full rounded-[24px] bg-[#00703a] px-5 py-4 text-white shadow-[0_18px_36px_rgba(1,79,42,0.22)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between active:scale-[0.985] transition-all duration-200"
        >
          <span className="flex items-center gap-2 font-black text-[15px]">
            <Check size={18} strokeWidth={2.5} />
            {confirmingDeck ? "Guardando…" : "Confirmar mazo"}
          </span>
          <ArrowRight size={18} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  if (loadingHoles) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-slate-500 font-semibold text-sm">Cargando partida…</p>
      </div>
    );
  }

  const finish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    const result = calculateMatchWinner(playerTotal, rivalTotal);
    const rankingDelta = calculateEloDelta(ranking, match?.rivalRank || 1000, result);
    const finalMatch = {
      ...match,
      format: match?.format || "1 vs 1",
      holes: total,
      course: matchCourse?.name || match?.course,
      date: match?.date || new Date().toISOString(),
      rivalName,
      playerHcp: match?.playerHcp ?? playerMatchHcp,
      rivalHcp: match?.rivalHcp ?? rivalMatchHcp,
      playerBirdixHcp: playerMatchHcp,
      rivalBirdixHcp: rivalMatchHcp,
      rivalRank: match?.rivalRank || 1000,
      status: "finished",
      result,
      playerPoints: playerTotal,
      rivalPoints: rivalTotal,
      cardsUsed: holeSummaries.map((s) => s.view.my.card).filter(Boolean),
      rankingDelta,
      holeScores: holeSummaries,
      finishedAt: new Date().toISOString(),
      isRealMatch: true,
      playerSide: mySide,
    };
    await onFinish(finalMatch, rankingDelta);
  };

  // Se guarda solo al introducir los golpes (queueMatchHoleWrite ya fusiona
  // escrituras repetidas del mismo hoyo, ver matchSync.js) — "Siguiente
  // hoyo" ya no hace de botón de guardado, solo avanza.
  const setAndSaveRivalStrokes = (raw) => {
    setRivalStrokesInput(raw);
    if (!hasStrokeInput(raw)) return;
    const par = clampNumber(currentCourseHole.par, 3, 6, 4);
    const clamped = clampNumber(raw, 1, 12, par);
    writeHolePatch(holeNumber, { [`${rivalSide}_strokes`]: clamped, [`${rivalSide}_strokes_marker`]: userId });
  };

  // Navegar de hoyo limpia los buffers locales de golpes — si no, un valor
  // a medio escribir en el hoyo anterior se cuela como valor inicial del
  // siguiente hoyo (ambos aún no tienen golpes registrados casi siempre).
  const goToHole = (i) => {
    setHole(clampNumber(i, 0, total - 1, hole));
    setRivalStrokesInput("");
    setSelfStrokesInput("");
    setSelfStrokesOpen(false);
    setRevealSheetHole(null); // no reaparece al volver — solo dispara justo al resolver
  };

  const setAndSaveSelfStrokes = (raw) => {
    setSelfStrokesInput(raw);
    if (!hasStrokeInput(raw)) return;
    const par = clampNumber(currentCourseHole.par, 3, 6, 4);
    const clamped = clampNumber(raw, 1, 12, par);
    writeHolePatch(holeNumber, { [`${mySide}_strokes`]: clamped, [`${mySide}_strokes_marker`]: userId });
  };

  const playCard = (cardId) => {
    writeHolePatch(holeNumber, { [`${mySide}_card`]: cardId, [`${mySide}_card_confirmed`]: true, [`${mySide}_hole_submitted`]: true });
    setShowCardPicker(false);
    const c = CARDS.find((x) => x.id === cardId);
    if (c) setRevealCard(c);
  };

  const submitSecondShot = () => {
    if (!hasStrokeInput(secondShotInput)) return;
    const par = clampNumber(currentCourseHole.par, 3, 6, 4);
    const clamped = clampNumber(secondShotInput, 1, 12, par);
    writeHolePatch(holeNumber, {
      [`${mySide}_strokes`]: clamped,
      [`${mySide}_card`]: "second-shot",
      [`${mySide}_card_confirmed`]: true,
      [`${mySide}_hole_submitted`]: true,
    });
    setSecondShotInput("");
    setSecondShotPrompt(false);
  };

  const cardStatusPill = (() => {
    if (!view.my.card) return null;
    const c = CARDS.find((x) => x.id === view.my.card);
    if (!c) return null;
    if (view.my.cardCancelledReason) return { c, label: "Anulada por Bloqueo" };
    if (!view.cardsRevealed) return { c, label: "En privado — esperando al rival" };
    return { c, label: null };
  })();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3F4F6] via-[#F7FAF7] to-white flex flex-col">
      <header className="px-5 pt-5 pb-4 max-w-[900px] mx-auto w-full sticky top-0 z-20 bg-gradient-to-b from-[#F3F4F6] to-[#F3F4F6]/85 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onCancel} className="h-10 w-10 rounded-full bg-white shadow-surface flex items-center justify-center active:scale-95 transition">
            <X size={18} />
          </button>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00703a] font-black">Partida en curso</p>
            <p className="font-black text-slate-950 text-[16px] leading-tight mt-0.5">
              vs {rivalName} {match?.rivalId && <span className="text-slate-400 font-bold">{shortPlayerCode(match.rivalId)}</span>}
            </p>
          </div>
          {/* Indicador de reconexión (DESIGN.md "Estado de conexión") — hueco
              de simetría ya reservado, sin texto ambiental. */}
          <div className="h-10 w-10 flex items-center justify-center">
            {connectionStatus === "reconnecting" && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#9CA3AF] animate-pulse" aria-label="Reconectando" />
            )}
          </div>
        </div>

        <div className="rounded-[26px] bg-gradient-to-br from-slate-900 to-slate-950 shadow-[0_20px_44px_rgba(15,23,42,0.28)] px-1 py-4 flex items-stretch">
          <div className="flex-1 text-center px-2">
            <p className="text-[10px] uppercase tracking-wider text-[#6EE7B7] font-bold">Tú</p>
            <p className="font-display text-[30px] text-white leading-none mt-1.5">{playerTotal}</p>
            <p className="text-[9px] text-white/35 font-bold mt-1">HCP {formatBirdixHcp(playerMatchHcp)}</p>
          </div>
          <div className="w-px bg-white/10 my-1" />
          <div className="flex-[1.3] text-center px-2 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1 text-white/40">
              <Flag size={10} />
              <p className="text-[9px] uppercase tracking-widest font-bold">Hoyo</p>
            </div>
            <p className="font-display text-[34px] text-white leading-none mt-0.5">
              {holeNumber}<span className="text-white/30 text-[15px]">/{total}</span>
            </p>
            <p className="text-[9px] text-white/40 font-semibold mt-1">Par {currentCourseHole.par} · Índice {currentCourseHole.strokeIndex}</p>
          </div>
          <div className="w-px bg-white/10 my-1" />
          <div className="flex-1 text-center px-2">
            <p className="text-[10px] uppercase tracking-wider text-[#F4B2A6] font-bold">{rivalName.split(" ")[0]}</p>
            <p className="font-display text-[30px] text-white leading-none mt-1.5">{rivalTotal}</p>
            <p className="text-[9px] text-white/35 font-bold mt-1">HCP {formatBirdixHcp(rivalMatchHcp)}</p>
          </div>
        </div>
      </header>

      <div className="px-5 flex-1 max-w-[900px] mx-auto w-full space-y-4 pb-32">
        <div className="glow-behind rounded-[30px]" style={{ "--glow-color": "var(--glow-green)" }}>
          <Card className="p-6 rounded-[30px] bg-white ring-black/5 shadow-surface text-center">
            <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Puntos del hoyo</span>
            {currentPending ? (
              <p className="text-[13px] text-slate-400 font-bold mt-4">Pendiente — esperando a que se resuelva</p>
            ) : (
              <div className="flex items-center justify-center gap-7 mt-3">
                <div>
                  <p className="font-display text-[64px] text-[#00703a] leading-none">{view.my.stableford}</p>
                  <p className="text-[11px] text-slate-500 font-bold mt-1.5">Tú</p>
                </div>
                <p className="font-display text-[26px] text-slate-300 mt-2">–</p>
                <div>
                  <p className="font-display text-[64px] text-[#A8543F] leading-none">{view.rival.stableford}</p>
                  <p className="text-[11px] text-slate-500 font-bold mt-1.5">{rivalName.split(" ")[0]}</p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Carta en juego (D18, /design-consultation 25 ago 2026) — elevada
            a banda de ancho completo justo debajo de "Puntos del hoyo": las
            cartas son el corazón de Birdix, no una funcionalidad más, así
            que su estado pesa más que los golpes en la jerarquía visual. El
            pulso reutiliza el mismo lenguaje ya definido para el indicador
            de conexión (DESIGN.md) en vez de inventar una animación nueva. */}
        {cardStatusPill ? (
          <div className={`${cardStatusPill.c.accent} rounded-[22px] p-4 ring-1 ring-black/5 shadow-surface flex items-center gap-3`}>
            <div className="h-11 w-11 rounded-2xl bg-white/75 shadow-sm flex items-center justify-center flex-shrink-0"><cardStatusPill.c.icon size={19} strokeWidth={2.5} /></div>
            <div className="flex-1">
              <p className="text-[9px] uppercase tracking-wider font-bold opacity-70">Carta en juego</p>
              <p className="font-black text-[16px] leading-tight">{cardStatusPill.c.name}</p>
              {cardStatusPill.label && (
                <p className="text-[11px] font-bold opacity-80 mt-0.5 flex items-center gap-1.5">
                  {!view.cardsRevealed && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-pulse" />}
                  {cardStatusPill.label}
                </p>
              )}
            </div>
          </div>
        ) : (
          <button onClick={() => setShowCardPicker(true)} className="w-full rounded-[22px] bg-white ring-1 ring-dashed ring-[#D67560]/40 shadow-surface px-4 py-4 text-left active:scale-[0.99] transition flex items-center justify-between">
            <div>
              <p className="text-[13px] font-black text-slate-900">🃏 Jugar una carta</p>
              <p className="text-[12px] text-slate-500 mt-0.5">{Math.max(0, deck.length - usedCardIds.length)} disponibles este hoyo</p>
            </div>
            <ChevronRight size={16} className="text-[#D67560]" />
          </button>
        )}

        <Card className="p-5 space-y-3 ring-slate-200 shadow-surface">
          <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black">Golpes del hoyo</span>
          <ScoreInput
            label={`Golpes de ${rivalName.split(" ")[0]}`}
            value={hasStrokeInput(rivalStrokesInput) ? rivalStrokesInput : (view.rival.strokes ?? "")}
            onChange={setAndSaveRivalStrokes}
            tone="primary"
          />

          {hasStrokeInput(view.my.strokes) ? (
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5 flex items-center justify-between">
              <p className="text-[12px] text-slate-600 font-semibold">Tus golpes: <span className="font-black text-slate-900">{view.my.strokes}</span></p>
            </div>
          ) : selfStrokesOpen ? (
            <ScoreInput label="Tus golpes (apuntados por ti)" value={selfStrokesInput} onChange={setAndSaveSelfStrokes} />
          ) : (
            <button onClick={() => setSelfStrokesOpen(true)} className="text-[12px] text-slate-400 font-bold underline underline-offset-2 text-left">
              {rivalName.split(" ")[0]} no ha apuntado tus golpes todavía — apuntarlos yo
            </button>
          )}
        </Card>

        {view.cardsRevealed && view.rival.card && (
          <div className="rounded-[18px] bg-slate-50 ring-1 ring-slate-100 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Carta del rival</p>
            <p className="text-[13px] font-black text-slate-700 mt-0.5">
              {CARDS.find((c) => c.id === view.rival.card)?.name || view.rival.card}
              {view.rival.cardCancelledReason ? " — anulada por tu Bloqueo" : ""}
            </p>
          </div>
        )}

        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2 px-1">Tu mazo</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {deck.map((id) => {
              const c = CARDS.find((x) => x.id === id);
              if (!c) return null;
              const isCurrent = view.my.card === id;
              const isUsed = usedCardIds.includes(id) && !isCurrent;
              return (
                <button
                  key={id}
                  onClick={() => !view.my.card && setShowCardPicker(true)}
                  className={`flex-shrink-0 h-16 w-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition active:scale-95 ${isUsed ? "bg-slate-100 opacity-50" : c.accent} ${isCurrent ? "ring-2 ring-[#00703a] shadow-glow-green" : "ring-1 ring-black/5 shadow-surface"}`}
                >
                  <c.icon size={16} strokeWidth={2.5} />
                  <p className="text-[8px] font-black text-center leading-tight px-1">{c.name}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-black mb-2 px-1">Marcador de la ronda</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {holeSummaries.map((s, i) => (
              <button
                key={i}
                onClick={() => goToHole(i)}
                className={`flex-shrink-0 h-14 w-11 rounded-2xl flex flex-col items-center justify-center transition active:scale-95 ${i === hole
                  ? "bg-[#00703a] text-white shadow-glow-green"
                  : s.pending
                    ? "bg-white ring-1 ring-[#CA8A04]/30 text-slate-700 shadow-surface"
                    : "bg-white ring-1 ring-slate-100 text-slate-500 shadow-surface"
                  }`}
              >
                <p className={`text-[9px] font-bold ${i === hole ? "text-white/60" : "text-slate-400"}`}>{i + 1}</p>
                <p className="text-[13px] font-display leading-none mt-0.5">
                  {s.pending ? "…" : s.view.my.cardApplied ? s.view.my.stableford : "–"}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl ring-1 ring-slate-100 z-30 shadow-[0_-12px_30px_rgba(15,23,42,0.08)]">
        <div className="max-w-[900px] mx-auto px-5 py-3 flex items-center gap-2">
          <button
            onClick={() => goToHole(hole - 1)}
            disabled={hole === 0}
            className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"
          >
            <ChevronLeft size={20} />
          </button>
          {hole < total - 1 ? (
            <PrimaryButton onClick={() => goToHole(hole + 1)} icon={ArrowRight}>Siguiente hoyo</PrimaryButton>
          ) : (
            <PrimaryButton onClick={finish} icon={Trophy} tone="dark" disabled={isFinishing}>
              {isFinishing ? "Guardando…" : "Finalizar partida"}
            </PrimaryButton>
          )}
        </div>
      </div>

      {showCardPicker && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-3" onClick={() => setShowCardPicker(false)}>
          <div className="bg-white rounded-3xl w-full max-w-[420px] p-4 ring-1 ring-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-slate-900 text-lg">Usar carta en hoyo {holeNumber}</h3>
              <button onClick={() => setShowCardPicker(false)} className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <p className="text-[12px] text-slate-500 mb-3">Selección privada — el rival no la verá hasta que ambos hayáis decidido.</p>
            <div className="grid grid-cols-2 gap-3">
              {deck
                .filter((id) => {
                  if (usedCardIds.includes(id)) return false;
                  const c = CARDS.find((x) => x.id === id);
                  if (!c) return false;
                  if (id === "second-shot") {
                    if (!hasStrokeInput(view.my.strokes)) return false; // reacción: solo tras tu golpe
                  } else if (view.my.holeSubmitted) {
                    return false; // Decision 4: ventana cerrada — solo Segundo Golpe sigue jugable tras tu golpe
                  }
                  return isCardPlayable(c, { isBehind, alreadyPlayedThisHole: Boolean(view.my.card), rivalShieldActive: view.rival.card === "shield" });
                })
                .map((id) => {
                  const c = CARDS.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <BirdixCard
                      key={id}
                      card={c}
                      selected={view.my.card === id}
                      onClick={() => {
                        if (id === "second-shot") {
                          setShowCardPicker(false);
                          setSecondShotPrompt(true);
                        } else {
                          playCard(id);
                        }
                      }}
                      size="sm"
                    />
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {secondShotPrompt && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-3" onClick={() => setSecondShotPrompt(false)}>
          <div className="bg-white rounded-3xl w-full max-w-[420px] p-5 ring-1 ring-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-slate-900 text-lg mb-1">Segundo Golpe</h3>
            <p className="text-[12px] text-slate-500 mb-3">Repites el golpe — el segundo cuenta como definitivo, aunque salga peor.</p>
            <ScoreInput label="Golpes totales tras repetir" value={secondShotInput} onChange={setSecondShotInput} />
            <div className="mt-3">
              <PrimaryButton onClick={submitSecondShot} disabled={!hasStrokeInput(secondShotInput)}>Confirmar Segundo Golpe</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {revealCard && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setRevealCard(null)}>
          <div className="glow-behind" style={{ "--glow-color": "var(--glow-coral)" }}>
            <div
              className={`w-[180px] h-[240px] rounded-[26px] ${revealCard.accent} flex flex-col items-center justify-center text-center px-4 shadow-2xl`}
              style={{ animation: "birdix-card-flip 380ms cubic-bezier(.2,.8,.2,1) both" }}
            >
              <div className="h-12 w-12 rounded-2xl bg-white/70 backdrop-blur flex items-center justify-center mb-3">
                <revealCard.icon size={22} strokeWidth={2.5} />
              </div>
              <p className="font-display text-[19px] leading-tight">{revealCard.name}</p>
              <p className="text-[10px] uppercase tracking-wider opacity-70 font-bold mt-1">{revealCard.type}</p>
            </div>
          </div>
          <p className="absolute bottom-16 text-white/90 text-[13px] font-bold">¡Carta jugada! Toca para continuar.</p>
        </div>
      )}

      {/* Hoja de revelación del efecto (D18/D19, /design-consultation 25 ago
          2026) — el "flip seco y con peso" que DESIGN.md ya reservaba a
          revelar carta, aplicado por primera vez al flujo de 2 dispositivos.
          Solo llega a abrirse cuando bothPlayersDecided ya era true y el
          hoyo terminó de resolverse (ver el useEffect que arma revealSheetHole
          más arriba) — nunca antes de que el rival haya decidido su jugada. */}
      {revealSheetHole && (() => {
        const summary = holeSummaries.find((s) => s.holeNumber === revealSheetHole);
        if (!summary) return null;
        const v = summary.view;
        const myCard = v.my.card ? CARDS.find((c) => c.id === v.my.card) : null;
        const rivalCard = v.rival.card ? CARDS.find((c) => c.id === v.rival.card) : null;
        return (
          <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-3" onClick={() => setRevealSheetHole(null)}>
            <div className="bg-white rounded-t-[28px] w-full max-w-[420px] p-5 pb-6 ring-1 ring-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-center text-[10px] uppercase tracking-[0.14em] text-slate-400 font-black">Hoyo {revealSheetHole} resuelto</p>
              <div className="flex items-center gap-2.5 mt-4">
                <div className={`flex-1 rounded-2xl p-3 text-center ${myCard ? myCard.accent : "bg-slate-50"}`}>
                  {myCard ? (
                    <>
                      <div className="h-9 w-9 rounded-xl bg-white/70 flex items-center justify-center mx-auto mb-1.5"><myCard.icon size={16} strokeWidth={2.5} /></div>
                      <p className="text-[9px] uppercase tracking-wider font-bold opacity-60">Tú</p>
                      <p className="text-[12px] font-black mt-0.5 leading-tight">{myCard.name}{v.my.cardCancelledReason ? " (anulada)" : ""}</p>
                    </>
                  ) : (
                    <p className="text-[12px] text-slate-400 font-bold py-3.5">Sin carta</p>
                  )}
                </div>
                <span className="text-[11px] font-black text-slate-400">VS</span>
                <div className={`flex-1 rounded-2xl p-3 text-center ${rivalCard ? rivalCard.accent : "bg-slate-50"}`}>
                  {rivalCard ? (
                    <>
                      <div className="h-9 w-9 rounded-xl bg-white/70 flex items-center justify-center mx-auto mb-1.5"><rivalCard.icon size={16} strokeWidth={2.5} /></div>
                      <p className="text-[9px] uppercase tracking-wider font-bold opacity-60">{rivalName.split(" ")[0]}</p>
                      <p className="text-[12px] font-black mt-0.5 leading-tight">{rivalCard.name}{v.rival.cardCancelledReason ? " (anulada)" : ""}</p>
                    </>
                  ) : (
                    <p className="text-[12px] text-slate-400 font-bold py-3.5">Sin carta</p>
                  )}
                </div>
              </div>
              <div className="text-center mt-5 mb-5">
                <p className="font-display text-[44px] text-[#00703a] leading-none">{v.my.stableford}</p>
                <p className="text-[11px] text-slate-500 font-bold mt-1">
                  Tus puntos netos este hoyo{myCard && !v.my.cardCancelledReason ? ` — con ${myCard.name}` : ""}
                </p>
              </div>
              <PrimaryButton onClick={() => setRevealSheetHole(null)} icon={Check}>Continuar</PrimaryButton>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   14.5 · SCREEN · RESULTADO (el pago emocional de la partida)
   --------------------------------------------------------------------------*/

const MatchResultScreen = ({ match, rankingBefore, rankingAfter, onDone }) => {
  const [displayRank, setDisplayRank] = useState(rankingBefore);
  const division = getDivision(rankingAfter);
  const beforeDivision = getDivision(rankingBefore);
  const promoted = division.key !== beforeDivision.key && rankingAfter > rankingBefore;
  const relegated = division.key !== beforeDivision.key && rankingAfter < rankingBefore;
  const delta = rankingAfter - rankingBefore;
  const result = match?.result || "draw";
  const resultLabel = result === "win" ? "Victoria" : result === "loss" ? "Derrota" : "Empate";
  const resultColor = result === "win" ? "text-[#00703a]" : result === "loss" ? "text-[#A8543F]" : "text-slate-500";
  const ringProgress = Math.max(4, Math.min(360, ((rankingAfter - division.min) / Math.max(1, division.max - division.min)) * 360));

  useEffect(() => {
    const from = rankingBefore;
    const to = rankingAfter;
    const duration = 900;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayRank(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rankingBefore, rankingAfter]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3F4F6] to-[#F9FAFB] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-28">
        <div className="h-9 w-9 rounded-[10px] overflow-hidden shadow-surface mb-4">
          <BirdixLogo variant="isotipo" height={36} />
        </div>

        <p className={`text-[11px] uppercase tracking-[0.18em] font-black ${resultColor}`}>
          {result === "win" ? "🏆 " : ""}
          {resultLabel}
        </p>

        <div className="glow-behind mt-5" style={{ "--glow-color": `${division.hex}55`, borderRadius: "9999px" }}>
          <div
            className="h-28 w-28 rounded-full flex items-center justify-center shadow-[0_18px_36px_rgba(0,0,0,0.15)]"
            style={{ background: `conic-gradient(${division.hex} 0deg ${ringProgress}deg, #E5E7EB ${ringProgress}deg 360deg)` }}
          >
            <div className="h-[88px] w-[88px] rounded-full bg-white flex flex-col items-center justify-center">
              <p className="font-display text-[16px] leading-none" style={{ color: division.hex }}>{division.name}</p>
            </div>
          </div>
        </div>

        <p className="font-display text-[52px] text-slate-950 leading-none mt-5">{displayRank}</p>
        <span className={`mt-2 inline-block text-[13px] font-black px-3 py-1 rounded-full ${delta >= 0 ? "bg-[#E6F4ED] text-[#014F2A]" : "bg-[#FBEAE3] text-[#A8543F]"}`}>
          {delta >= 0 ? "+" : ""}{delta} pts
        </span>

        {(promoted || relegated) && (
          <p className="mt-3 text-[13px] font-bold text-slate-700">
            {promoted ? `¡Subes a ${division.name}!` : `Bajas a ${division.name}`}
          </p>
        )}

        <p className="mt-4 text-[13px] text-slate-500 font-semibold">
          Stableford neto <span className="text-slate-900 font-black">{match?.playerPoints ?? 0} – {match?.rivalPoints ?? 0}</span>
        </p>

        {/* Hándicap Birdix (D20, 25 ago 2026) — solo en partidas reales. Nunca
            un número optimista: hasta que confirmMatchResult diga que los 2
            jugadores han cerrado su lado, no hay número que enseñar. */}
        {match?.isRealMatch && (
          <div className="mt-5 w-full max-w-[280px] rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm px-4 py-3.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-black">Hándicap Birdix</p>
            {!match.hcpConfirmation?.applied ? (
              <p className="text-[13px] text-slate-500 font-semibold mt-1.5">
                Esperando a que {(match.rivalName || "tu rival").split(" ")[0]} confirme el resultado.
              </p>
            ) : match.hcpConfirmation.hcpCalibrating ? (
              <>
                <p className="text-[13px] text-slate-700 font-bold mt-1.5">
                  Calibrando — partida {match.hcpConfirmation.realMatchesPlayed}/{REAL_HCP_CALIBRATION_MATCHES}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Se ajusta de golpe al completar {REAL_HCP_CALIBRATION_MATCHES} partidas reales.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 mt-1.5">
                <span className="font-display text-[20px] text-slate-900">{formatBirdixHcp(match.playerBirdixHcp)}</span>
                <ArrowRight size={14} className="text-slate-400" />
                <span
                  className="font-display text-[20px]"
                  style={{
                    color:
                      match.hcpConfirmation.newBirdixHcp < match.playerBirdixHcp
                        ? "#00703a"
                        : match.hcpConfirmation.newBirdixHcp > match.playerBirdixHcp
                          ? "#A8543F"
                          : "#111827",
                  }}
                >
                  {formatBirdixHcp(match.hcpConfirmation.newBirdixHcp)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl ring-1 ring-slate-100 px-5 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)]">
        <div className="max-w-[900px] mx-auto">
          <PrimaryButton onClick={onDone} icon={Home}>Volver al inicio</PrimaryButton>
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   15 · APP ROOT
   --------------------------------------------------------------------------*/

export default function BirdixApp() {
  useBirdixFont();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [tab, setTab] = useState("home");
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState(null);
  const [bootDone, setBootDone] = useState(false);
  const [pendingExitTab, setPendingExitTab] = useState(null);
  const [resultMatch, setResultMatch] = useState(null);
  const finishingRef = useRef(false);

  /* La barra de navegación es la misma en las 7 pantallas, sin excepción
     (DESIGN.md) — pero si hay una partida en curso, tocar una pestaña pide
     confirmación antes de sacarte, en vez de perder el progreso sin avisar. */
  const handleTabBarChange = (nextTab) => {
    if (playing && state.activeMatch) {
      setPendingExitTab(nextTab);
      return;
    }
    setTab(nextTab);
  };

  const confirmExitMatch = () => {
    setPlaying(false);
    setTab(pendingExitTab);
    setPendingExitTab(null);
  };

  /* --- Hidratación inicial ---
     La sesión (quién eres) viene de Supabase Auth, de verdad. El perfil
     enriquecido (edad, ciudad, preferencias de onboarding...) sigue en
     local por ahora — todavía no tiene columnas en la tabla `profiles`.
     ponytail: migrar eso cuando decidamos qué campos nos importan de verdad. */
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const profile = storage.get("profile");
        const matches = storage.get("matches") || [];
        const ranking = storage.get("ranking") ?? 1000;
        const position = storage.get("position") ?? 4287;
        const selectedCards = storage.get("selectedCards") || [];
        const activeMatch = storage.get("activeMatch") || null;

        const { data: { session: authSession } } = await supabase.auth.getSession();
        const session = authSession
          ? { userId: authSession.user.id, email: authSession.user.email, since: Date.parse(authSession.user.created_at) }
          : null;
        const user = authSession
          ? { id: authSession.user.id, email: authSession.user.email, name: profile?.name || authSession.user.email.split("@")[0] }
          : null;

        dispatch({
          type: "HYDRATE",
          payload: { session, user, profile, matches, ranking, position, selectedCards, activeMatch },
        });

        // D22: HYDRATE de arriba ya pintó rápido con lo último que hubiera
        // en localStorage de ESTE dispositivo — eso es lo único que hacía
        // hasta hoy, y es la causa de que un segundo móvil (o el mismo tras
        // perder caché) mostrara perfil/historial desactualizados aunque
        // Supabase sí tuviera lo real. Esto lo corrige en cuanto llega, sin
        // bloquear el primer pintado.
        if (authSession) {
          Promise.all([
            supabase.from("profiles").select("*").eq("id", authSession.user.id).single(),
            listMyMatchHistory(authSession.user.id),
          ])
            .then(([{ data: row }, history]) => {
              dispatch({
                type: "REFRESH_FROM_SERVER",
                payload: {
                  profile: row ? { name: row.full_name, hcp: row.birdix_hcp, birdixHcp: row.birdix_hcp } : null,
                  ranking: row?.points,
                  matches: history,
                },
              });
            })
            .catch(() => {
              // Sin cobertura al arrancar — se queda con la caché local; en
              // cuanto haya red, el próximo arranque se refresca solo.
            });
        }

        const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
          if (!newSession) dispatch({ type: "LOGOUT" });
        });
        unsub = () => sub.subscription.unsubscribe();
      } catch (e) {
        dispatch({ type: "HYDRATE", payload: {} });
      }
    })();
    const t = setTimeout(() => setBootDone(true), 350);
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);

  /* --- Descubrir partida activa real (D7) ---
     Sin esto, el rival (quien no creó la partida) nunca se entera de que
     existe: activeMatch hoy solo lo pone quien la crea, localmente. Se
     comprueba al arrancar y cada vez que se entra en la pestaña de
     partidas mientras no haya ninguna activa — cubre tanto "abro la app y
     ya me habían retado" como "mi rival me acaba de crear la partida
     mientras yo ya estaba dentro". */
  useEffect(() => {
    if (!state.hydrated || !state.user?.id || state.activeMatch) return;
    if (tab !== "matches" && tab !== "home") return;
    let cancelled = false;
    listMyActiveMatches(state.user.id)
      .then((rows) => {
        if (cancelled || !rows.length) return;
        dispatch({ type: "SET_ACTIVE_MATCH", payload: rows[0] });
      })
      .catch(() => {
        // Sin partida activa real, o sin cobertura — no es un error que
        // haya que mostrar, simplemente no hay nada nuevo que descubrir.
      });
    return () => {
      cancelled = true;
    };
  }, [state.hydrated, state.user?.id, state.activeMatch, tab]);

  /* --- Persistencia --- */
  useEffect(() => {
    if (!state.hydrated) return;
    try {
      storage.set("session", state.session);
      storage.set("user", state.user);
      storage.set("profile", state.profile);
      storage.set("matches", state.matches);
      storage.set("ranking", state.ranking);
      storage.set("position", state.position);
      storage.set("selectedCards", state.selectedCards);
      storage.set("activeMatch", state.activeMatch);
    } catch (e) { }
  }, [state]);

  /* --- Guard de ciclo de vida de partida --- */
  useEffect(() => {
    if (!state.hydrated) return;
    if (!state.activeMatch && playing) {
      setPlaying(false);
    }
    if (!state.activeMatch && finishingRef.current) {
      finishingRef.current = false;
      setTab("home");
    }
  }, [state.hydrated, state.activeMatch, playing]);

  /* --- Acciones de auth (Supabase real) --- */
  const handleLogin = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : error.message };

    const { data: row } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    const user = { id: data.user.id, email: data.user.email, name: row?.full_name || email.split("@")[0] };
    const session = { userId: data.user.id, email: data.user.email, since: Date.now() };
    const profile = row
      ? { ...storage.get("profile"), name: row.full_name, hcp: row.birdix_hcp, birdixHcp: row.birdix_hcp, ranking: row.points }
      : storage.get("profile");

    dispatch({ type: "HYDRATE", payload: { session, user, profile, ranking: row?.points ?? state.ranking } });
    setToast("Bienvenido de vuelta");
    return { error: null };
  };

  const handleRegister = async ({ name, email, password }) => {
    // El perfil (fila en `profiles`) lo crea un trigger en la base de datos
    // al insertarse en auth.users — no depende de que haya sesión activa
    // en el cliente (importante si la confirmación de email está activada).
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) return { error: error.message === "User already registered" ? "Ya existe una cuenta con ese email." : error.message };

    if (!data.session) {
      setToast("Cuenta creada · revisa tu email para confirmarla");
      return { error: "Te hemos enviado un email de confirmación. Confírmalo y vuelve a iniciar sesión." };
    }

    const user = { id: data.user.id, email, name };
    const session = { userId: data.user.id, email, since: Date.now() };
    dispatch({ type: "LOGIN", payload: { session, user } });
    setToast("Cuenta creada · vamos al perfil");
    return { error: null };
  };

  const handleOnboardingDone = (profile) => {
    dispatch({ type: "SET_PROFILE", payload: profile });
    setTab("home");
    setToast("Perfil listo · ¡a jugar!");
    // Best-effort: sincroniza lo que sí tiene columna real en Supabase.
    if (state.user?.id) {
      supabase
        .from("profiles")
        .update({ birdix_hcp: normalizeBirdixHcp(profile.hcp), full_name: profile.name })
        .eq("id", state.user.id)
        .then(({ error }) => { if (error) console.error("No se pudo sincronizar el perfil con Supabase:", error); });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    try {
      storage.remove("session");
      storage.remove("user");
      storage.remove("profile");
      storage.remove("matches");
      storage.remove("ranking");
      storage.remove("position");
      storage.remove("selectedCards");
      storage.remove("activeMatch");
    } catch (e) { }
    dispatch({ type: "LOGOUT" });
    setTab("home");
  };

  // D23 (25 ago 2026): entrar directo a la partida en vez de volver a la
  // lista — antes, tras crear, el jugador aterrizaba en Partidas y tenía
  // que volver a tocar la tarjeta de "Partida activa" para entrar, lo que
  // se sentía como "entro y salgo" de la pantalla de creación.
  const handleCreateMatch = (match) => {
    dispatch({ type: "SET_ACTIVE_MATCH", payload: match });
    setPlaying(true);
  };

  // D20 (25 ago 2026): el hcp real de una partida real nunca se enseña
  // optimista — se espera a confirmMatchResult (mi confirmación + la del
  // rival, si ya llegó) antes de decidir qué pinta MatchResultScreen. La
  // llamada en sí es rápida (un roundtrip, "¿cuántas confirmaciones hay
  // ahora?"), no una espera indefinida a que el rival actúe en el futuro —
  // si el rival aún no ha confirmado, esto vuelve con applied:false al
  // momento y la pantalla lo refleja como "esperando".
  const handleFinishMatch = async (match, rankingDelta) => {
    const safeDelta = Math.round(Number.isFinite(Number(rankingDelta)) ? Number(rankingDelta) : 0);
    const finishedMatch = normalizeFinishedMatch(match, safeDelta);
    const rankingBefore = toRankingPoints(state.ranking);
    finishingRef.current = true;

    let hcpConfirmation = null;
    if (match?.isRealMatch && state.user?.id) {
      try {
        hcpConfirmation = await confirmMatchResult({
          matchId: finishedMatch.id,
          userId: state.user.id,
          playerSide: match.playerSide || "player_a",
          holes: finishedMatch.holes,
          result: finishedMatch.result,
          playerPoints: finishedMatch.playerPoints,
          rivalPoints: finishedMatch.rivalPoints,
        });
      } catch (err) {
        setToast(err?.message || "No se pudo confirmar el resultado. Se reintentará más adelante.");
      }
    }
    finishedMatch.hcpConfirmation = hcpConfirmation;

    dispatch({
      type: "FINISH_MATCH",
      payload: {
        match: finishedMatch,
        rankingDelta: safeDelta,
        confirmedBirdixHcp: hcpConfirmation?.applied ? hcpConfirmation.newBirdixHcp : undefined,
      },
    });
    setPlaying(false);
    setResultMatch({ match: finishedMatch, rankingBefore, rankingAfter: toRankingPoints(rankingBefore + safeDelta) });
  };

  /* --- Renderizado de pantallas --- */

  // Estado de boot
  if (!state.hydrated || !bootDone) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-[#00703a] flex items-center justify-center shadow-lg shadow-[#014F2A]/20 animate-pulse">
            <CircleDot className="text-white" size={28} strokeWidth={2.5} />
          </div>
          <p className="mt-4 text-slate-500 font-semibold text-sm">Cargando Birdix…</p>
        </div>
      </div>
    );
  }

  // Sin sesión → auth
  if (!state.session) {
    return (
      <>
        <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />
        <Toast message={toast} onDone={() => setToast(null)} />
      </>
    );
  }

  // Sesión sin perfil → onboarding
  if (!state.profile) {
    return (
      <>
        <OnboardingStepper user={state.user} onDone={handleOnboardingDone} />
        <Toast message={toast} onDone={() => setToast(null)} />
      </>
    );
  }

  // Partida activa en curso (modo jugar)
  if (playing && state.activeMatch) {
    return (
      <>
        {isTeamMatch(state.activeMatch) ? (
          <TeamStablefordScreen
            match={state.activeMatch}
            selectedCards={state.selectedCards}
            ranking={state.ranking}
            playerBirdixHcp={state.profile?.birdixHcp ?? state.profile?.hcp}
            onFinish={handleFinishMatch}
            onCancel={() => setPlaying(false)}
          />
        ) : state.activeMatch.isRealMatch ? (
          <RealMatchPlayScreen
            match={state.activeMatch}
            userId={state.user?.id}
            ranking={state.ranking}
            playerBirdixHcp={state.profile?.birdixHcp ?? state.profile?.hcp}
            onFinish={handleFinishMatch}
            onCancel={() => setPlaying(false)}
          />
        ) : (
          <MatchPlayScreen
            match={state.activeMatch}
            selectedCards={state.selectedCards}
            ranking={state.ranking}
            playerBirdixHcp={state.profile?.birdixHcp ?? state.profile?.hcp}
            onFinish={handleFinishMatch}
            onCancel={() => setPlaying(false)}
          />
        )}
        <TabBar active={null} onChange={handleTabBarChange} stacked />
        {pendingExitTab && (
          <ConfirmDialog
            title="¿Seguro?"
            message="Perderás el progreso de esta partida si sales ahora."
            confirmLabel="Salir de la partida"
            cancelLabel="Seguir jugando"
            onConfirm={confirmExitMatch}
            onCancel={() => setPendingExitTab(null)}
          />
        )}
        <Toast message={toast} onDone={() => setToast(null)} />
      </>
    );
  }

  // Resultado — el pago emocional de la partida, antes de volver a Inicio
  if (resultMatch) {
    return (
      <>
        <MatchResultScreen
          match={resultMatch.match}
          rankingBefore={resultMatch.rankingBefore}
          rankingAfter={resultMatch.rankingAfter}
          onDone={() => {
            setResultMatch(null);
            setTab("home");
          }}
        />
        <TabBar active="home" onChange={(t) => { setResultMatch(null); setTab(t); }} stacked />
      </>
    );
  }

  const appBackground =
    tab === "home" ? "#FBFAF6" :
      tab === "matches" ? "#F5FBF7" :
        tab === "cards" ? "#FAF8F1" :
          tab === "ranking" ? "#F7F7F4" :
            tab === "profile" ? "#F8FAF8" :
              "#F8FAFC";

  return (
    <div className="min-h-screen text-slate-900 antialiased transition-colors duration-300" style={{ background: appBackground }}>
      <Toast message={toast} onDone={() => setToast(null)} />

      <main className="mx-auto max-w-[900px] px-4 sm:px-6 pt-6 pb-32">
        {tab === "home" && (
          <HomeScreen
            profile={state.profile}
            ranking={state.ranking}
            matches={state.matches}
            onCreate={() => setTab("matches")}
            onGoCards={() => setTab("cards")}
            onGoProfile={() => setTab("profile")}
          />
        )}
        {tab === "matches" && (
          <MatchesScreen
            matches={state.matches}
            activeMatch={state.activeMatch}
            selectedCards={state.selectedCards}
            profile={state.profile}
            userId={state.user?.id}
            ranking={state.ranking}
            onCreateMatch={handleCreateMatch}
            onSelectCards={(cards) => dispatch({ type: "SET_SELECTED_CARDS", payload: cards })}
            onOpenActive={() => {
              if (state.activeMatch) setPlaying(true);
            }}
          />
        )}
        {tab === "cards" && <CardsScreen onBack={() => setTab("home")} />}
        {tab === "ranking" && (
          <RankingScreen profile={state.profile} ranking={state.ranking} position={state.position} />
        )}
        {tab === "profile" && (
          <ProfileScreen
            profile={state.profile}
            userId={state.user?.id}
            matches={state.matches}
            ranking={state.ranking}
            onLogout={handleLogout}
          />
        )}
      </main>

      <TabBar active={isTabBarTab(tab) ? tab : null} onChange={handleTabBarChange} />
    </div>
  );
}
