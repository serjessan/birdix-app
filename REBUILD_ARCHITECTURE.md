# Birdix — Documento de arquitectura para la reconstrucción

Fecha: 4 agosto 2026
Autor: Cowork (Claude), a partir del prototipo `App.jsx` y del proyecto Supabase real.
Propósito: que Claude Code (con gstack) tenga todo el contexto necesario para arrancar
`/office-hours` y `/plan-eng-review` (o `/autoplan`) sin tener que redescubrir nada de esto.

**No construir nada a partir de este documento sin pasar antes por `/office-hours` y
`/plan-eng-review` en Claude Code.** Este documento es el input de esas fases, no un
sustituto.

---

## 1. Qué es Birdix (resumen para quien no tenga el contexto completo)

Birdix es una app de golf competitivo. El diferenciador de producto no es apuntar tarjetas
— es el **Rango Birdix** (progresión tipo Clash Royale / Chess.com: divisiones, ascensos,
descensos, prestigio) y las **cartas estratégicas** (12 cartas que se juegan durante una
partida real de golf, sin azar, sin romper las reglas oficiales — la habilidad está en
decidir *cuándo* jugarlas). El hándicap sigue existiendo pero no es protagonista.

Público: golfistas amateurs, 18-70 años. Barra de calidad de UX: Apple / Strava / Garmin /
Chess.com, no "otra app de golf". El documento completo de principios de producto vive en
`CLAUDE.md`, en la raíz de este mismo repo — léelo antes de diseñar o programar nada.

## 2. Por qué este documento existe

El prototipo actual (`src/App.jsx`, ~3400 líneas) se construyó rápido con ChatGPT +
Antigravity, todo en un único fichero: pantallas, componentes de UI, lógica de negocio
(ranking, hándicap, cartas) y datos falsos (`FAKE_RIVALS`, `COURSES`) mezclados sin
separación de capas. Sirvió para validar UX y para conectar Auth real contra Supabase, pero
no es la base sobre la que se debe seguir construyendo — se decidió reconstruir desde cero
con arquitectura limpia, usando este prototipo solo como referencia puntual.

Este documento recoge todo lo que ya se sabe y se decidió, para no perderlo en la
reconstrucción: el esquema real de Supabase (ya tiene 8 tablas bien diseñadas, vacías,
listas para usar), el inventario completo del prototipo, y las decisiones de producto ya
tomadas esta semana.

## 3. Stack decidido

- Frontend: **React + Vite + Tailwind CSS** (se mantiene — la UI del prototipo no es el
  problema, la organización del código sí).
- Backend: **Supabase** (Postgres + Auth + Storage + Realtime). Proyecto ya creado:
  `xwkuribptpppelhvajgc`, región `eu-central-1`.
- Filosofía de código: **ponytail activa** — la solución más simple que funcione, sin
  abstracciones no pedidas, sin scaffolding "por si acaso". Excepción explícita: los
  requisitos de escalabilidad de `CLAUDE.md` (auth real, DB pensada para crecer) cuentan
  como pedidos explícitamente, no se recortan.
- Proceso: Claude Code + **gstack** (`/office-hours` → `/plan-eng-review` o `/autoplan` →
  `/design-consultation` si hace falta pantalla nueva → build → `/review` → `/qa` →
  `/ship`), con git y ramas — no parches sueltos sin control de versiones.

## 4. Esquema real de Supabase (ya existe, no hay que diseñarlo desde cero)

Proyecto: `xwkuribptpppelhvajgc`. 8 tablas en `public`, todas con RLS activado, todas
vacías (0 filas) a día de hoy. Diseño ya pensado para partidas 1vs1 con Stableford neto y
cartas por hoyo (revelar → confirmar → aplicar), más fino que la lógica que hay hoy en
`App.jsx`.

### 4.1 `clubs`
| columna | tipo | notas |
|---|---|---|
| id | uuid, PK | `gen_random_uuid()` |
| name | text | |
| city | text | |
| logo_url | text | nullable |
| created_at | timestamptz | |

RLS: `clubs are viewable by everyone` (SELECT, public). Sin política de INSERT/UPDATE
todavía — decidir quién puede dar de alta clubes (¿admin panel? ¿alta libre?).

### 4.2 `profiles`
| columna | tipo | notas |
|---|---|---|
| id | uuid, PK | FK → `auth.users.id` |
| email | text | nullable |
| full_name | text | nullable |
| avatar_url | text | nullable |
| club_id | uuid | nullable, FK → `clubs.id` — **no es texto libre** |
| birdix_hcp | numeric | default 18.0 |
| points | integer | default 1000 (ranking Birdix) |
| wins / losses | integer | default 0 |
| win_streak / loss_streak | integer | default 0 |
| created_at | timestamptz | |

RLS: `profiles are viewable by everyone` (SELECT, public) — necesario para ver rivales;
`users can insert own profile` e `users can update own profile` solo para `auth.uid() = id`.

Trigger `on_auth_user_created` en `auth.users` (AFTER INSERT) → función
`handle_new_user()` (SECURITY DEFINER, EXECUTE revocado a public/anon/authenticated) crea
la fila en `profiles` automáticamente al registrarse. No depende de que haya sesión activa
en el cliente — funciona igual si la confirmación de email está activada o no. **No
reemplazar este patrón por un INSERT desde el cliente** salvo que se desactive la
confirmación de email, porque entonces el cliente no tiene `auth.uid()` todavía.

**Gap conocido:** ni `full_name` ni `birdix_hcp` cubren todo lo que el onboarding actual
pide, y `club_id` es una referencia real a `clubs`, no texto libre. Ver sección 6.

### 4.3 `courses`
id, `club_id` (FK → clubs, nullable), name, location, holes_count (default 18), created_at.
RLS: lectura pública.

### 4.4 `course_holes`
id, `course_id` (FK → courses), hole_number, par, stroke_index, meters (nullable),
created_at. RLS: lectura pública. Esto es lo que permite calcular hándicap por hoyo de
verdad (stroke index real de cada campo), algo que el prototipo simula con datos
hardcodeados en `COURSES`.

### 4.5 `matches`
| columna | notas |
|---|---|
| id | uuid PK |
| course_id | FK → courses |
| created_by | FK → profiles |
| status | CHECK: `pending / active / review / confirmed / cancelled / abandoned` |
| format | CHECK: **solo `'stableford_1v1'`** — sin soporte de 2v2 todavía |
| winner_id | FK → profiles, nullable |
| is_ranked | boolean, default true |
| suspicious_match / suspicious_reason | boolean / text — para detección de resultados raros |
| started_at / finished_at / duration_minutes | |

RLS: solo el creador o los jugadores del match pueden verlo; solo `authenticated` puede
crear (`created_by = auth.uid()`); solo el creador puede actualizar.

**Decisión ya tomada (4 ago 2026):** no se amplía el CHECK a 2v2 todavía. El formato 2 vs 2
se deja visible en la UI pero deshabilitado con badge "Próximamente" hasta que se diseñe
bien el modelo de equipos (¿tabla `match_teams`? ¿`side` con más de 2 valores en
`match_players`?) — no improvisar el esquema de 2v2 sin pasar por `/plan-eng-review`.

### 4.6 `match_players`
id, `match_id` (FK), `user_id` (FK → profiles), `side` (CHECK: `player_a` / `player_b`),
`points_before` (default 1000), `points_after` (nullable), `birdix_hcp_at_match`,
`total_stableford`, `confirmed`, `selected_cards` (array de text, default `{}`),
`deck_confirmed_at`, `created_at`, `accepted_at`.

Esto ya modela el mazo de cartas seleccionado por partida (`selected_cards`) — coincide con
el sistema de 12 cartas del prototipo.

### 4.7 `match_holes`
La tabla más completa: por hoyo guarda golpes de cada jugador (`player_a_strokes`,
`player_b_strokes`), golpes de hándicap aplicados, neto, puntos Stableford, y todo el ciclo
de vida de una carta jugada en ese hoyo: `player_a_card` / `player_b_card`,
`cards_revealed`, `*_card_confirmed`, `*_card_applied`, `*_card_cancelled_reason`, más
`*_hole_submitted` y `*_strokes_marker` (quién de los dos introdujo el resultado, para
detectar discrepancias). Este es el diseño de "revelar → confirmar → aplicar" mencionado en
`CLAUDE.md` para las cartas — más robusto que el `applyStablefordCardEffect` que hay hoy en
el prototipo (que aplica el efecto de la carta al vuelo, sin ciclo de confirmación).

### 4.8 `match_confirmations`
id, `match_id`, `user_id`, `confirmed_at`, `created_at`. Confirmación final del resultado
del match por cada jugador — evita que un jugador cierre una partida unilateralmente.

### Funciones y triggers
- `handle_new_user()` — SECURITY DEFINER, trigger en `auth.users`, crea perfil. EXECUTE
  revocado a roles públicos (solo lo dispara el trigger).
- `rls_auto_enable()` — event trigger SECURITY DEFINER que auto-activa RLS en tablas
  nuevas. EXECUTE revocado igual que arriba. Es utilidad interna del proyecto, no hace
  falta tocarla.
- Aviso de seguridad pendiente (no crítico, no bloquea nada): "leaked password protection"
  está desactivado en Supabase Auth — se puede activar desde el dashboard cuando se quiera
  endurecer el registro.

## 5. Inventario del prototipo actual (`src/App.jsx`)

Todo vive en un único fichero de ~3400 líneas, organizado por comentarios de sección (no
por ficheros):

0. Tokens del sistema visual (`BX` — colores de marca, incluye colores de las 6 divisiones)
   y logos.
1. Capa de persistencia (`storage` — wrapper sobre `window.storage` / `localStorage` /
   memoria). **Esto es lo que hay que sustituir por Supabase en el rebuild**, no llevarlo
   tal cual.
2. Constantes de dominio: `DIVISIONS` (Bronce, Plata, Oro, Platino, Élite, Leyenda — 6
   divisiones, **sin subdivisiones I/II/III todavía**, eso es la fase 1 del roadmap),
   `CARDS` (las 12 cartas reales: second-shot, block, shield, double, steal, safe-hole,
   no-driver, no-club, clean-point, pressure, birdix-prize, comeback — nombres, textos e
   iconos ya están bien y se pueden llevar tal cual al rebuild), `FAKE_RIVALS`, `FAKE_TOP`,
   `COURSES` (3 campos de Salamanca hardcodeados, con hoyos simulados — sustituir por
   `courses` + `course_holes` reales).
3. Helpers de negocio puros (buena noticia: son fáciles de testear y de llevar al rebuild
   casi sin cambios): `calculateStablefordPoints`, `normalizeBirdixHcp`,
   `getHandicapStrokesForHole`, `applyStablefordCardEffect`, `calculateRankingChange`,
   `calculateBirdixHcpAfterMatch`, `getDivision` / `getNextDivision`.
4. Estado global con `useReducer` (un reducer único para toda la app: sesión, user,
   profile, matches, ranking, position, selectedCards, activeMatch).
5. Componentes de UI reutilizables: `Logo`, `DivisionBadge`, `Pill`, `PrimaryButton` /
   `SecondaryButton`, `Field`, `SegmentedControl`, `ChoiceGrid`, `ProgressBar`,
   `EmptyState`, `Avatar`, `Card`, `BirdixCard` (la carta visual), `TabBar`, `Toast`. Estos
   son el design system real de Birdix — llevarlos al rebuild como carpeta
   `components/ui/`, prácticamente sin cambios de diseño.
6. Pantalla Auth (login/registro) — ya conectada a Supabase Auth real.
7. Pantalla Onboarding — ya reducida a 1 pantalla / 3 campos (nombre y apellidos, hándicap,
   campo habitual) tras la sesión de hoy. Ver gap del `club_id` en la sección 6.
8. Home (dashboard con ranking hero).
9. `MatchCard` (tarjeta de partida para historial y home).
10. Pantalla Matches (lista + creación + partida activa) — hoy usa `FAKE_RIVALS`, sin
    conexión a `matches`/`match_players`/`match_holes` todavía. Formato 2v2 ya marcado
    "Próximamente" y deshabilitado en el selector.
11. Pantalla Cards (mazo completo de las 12 cartas).
12. Pantalla Ranking.
13. Pantalla Profile.
14. Pantallas de juego: `MatchPlayScreen` (1v1) y `TeamStablefordScreen` (2v2 — funciona
    en local, sin persistencia real, coherente con que el formato esté deshabilitado de
    cara al usuario).
15. `BirdixApp` (root): hidrata sesión real desde Supabase, todo lo demás
    (profile/matches/ranking/cards) desde `storage` local; navegación por estado
    (`tab`, `playing`) sin router.

## 6. Gaps y decisiones ya tomadas (4 agosto 2026)

1. **2 vs 2**: se queda visible en la UI (onboarding ya no lo pregunta, pero el selector de
   formato al crear partida sí lo muestra) marcado como "Próximamente", deshabilitado. No
   se amplía el CHECK de `matches.format` todavía. Cuando se diseñe el modelo de equipos
   (parte de `/plan-eng-review`), quitar el `disabled: true` en el selector y ampliar el
   CHECK / esquema.
2. **Onboarding recortado**: de 5 pasos / 11 campos a 1 pantalla / 3 campos — nombre y
   apellidos, hándicap, campo habitual. Se comprobó en el código que edad, años jugando,
   frecuencia semanal, tipo de jugador y objetivo no se usaban en ninguna otra pantalla —
   no llevar esos campos al rebuild salvo que se diseñe explícitamente para qué se van a
   usar (recomendaciones, matchmaking, etc.).
3. **`club_id` vs texto libre**: el campo "campo en el que sueles jugar" del onboarding hoy
   es texto libre en local; en Supabase `profiles.club_id` es una referencia real a
   `clubs`. En el rebuild, ese campo debe ser un buscador/autocompletar contra `clubs`
   (crear el club si no existe, o dejarlo pendiente hasta tener un flujo de alta de clubes)
   y guardar el `club_id`, no un string.
4. **Perfil enriquecido**: hoy solo `full_name` y `birdix_hcp` se sincronizan con Supabase
   al terminar el onboarding. `points`, `wins`, `losses`, streaks ya existen como columnas
   con default — hay que decidir en el rebuild quién los actualiza (¿un trigger al cerrar
   partida? ¿un job?) en vez de escribirlos sueltos desde el cliente.
5. **`npm install`** no se pudo ejecutar desde Cowork (sandbox sin acceso a la registry de
   npm) — se hizo un hand-edit de `package.json` añadiendo `@supabase/supabase-js`. Hay que
   confirmar en el rebuild que las dependencias reales quedan instaladas de verdad (esto no
   debería ser un problema en Claude Code, que corre en la máquina local).

## 7. Estructura de carpetas propuesta (para discutir en `/plan-eng-review`, no dogma)

```
src/
  components/
    ui/            Design system: Button, Field, Card, Pill, Avatar, ProgressBar...
    cards/         BirdixCard y todo lo específico de la mecánica de cartas
  screens/
    auth/
    onboarding/
    home/
    matches/
    cards/
    ranking/
    profile/
  hooks/           useProfile, useMatches, useAuth... (envuelven Supabase, los componentes no llaman a supabase.from() directamente)
  lib/
    supabase.js    (ya existe)
    api/           una función por operación de negocio (createMatch, confirmHole, applyCard...), no queries sueltas en componentes
  domain/          helpers puros de negocio (ranking, hándicap, stableford) — los de la sección 3, son fáciles de testear, llevarlos con tests
  constants/       DIVISIONS, CARDS, tokens BX
  App.jsx          solo routing/layout, delgado
```

La regla de ponytail sigue aplicando: esto es una propuesta de partida, no hay que crear
carpetas vacías "por si acaso" — se crean según las pantallas que realmente se vayan
construyendo.

## 8. Próximos pasos recomendados

1. Abrir Claude Code en este repo, con gstack instalado (`~/.claude/skills/gstack` — pide
   Claude Code, Git y Bun).
2. Correr `/office-hours` con este documento y `CLAUDE.md` como contexto, para forzar las
   preguntas de producto que todavía faltan (empezar por: ¿qué pantallas del prototipo se
   reconstruyen primero — Auth+Onboarding+Home, o directo Matches con cartas?).
3. `/plan-eng-review` o `/autoplan` para cerrar la estructura de carpetas y la capa de datos
   antes de escribir código.
4. Reconstruir pantalla a pantalla, empezando por Auth + Onboarding (ya funcionan contra
   Supabase, es el trasplante más barato) y Home, antes de tocar Matches (que necesita el
   ciclo completo de cartas contra `match_holes`).
5. `/review` y `/qa` antes de dar cada pantalla por cerrada. `/ship` para abrir el PR.
