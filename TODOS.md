# TODOS

## Arquitectura

### Reestructuración completa (Approach B) + esquema de participantes en Supabase

**What:** Separar `src/App.jsx` (3400+ líneas) en `domain/`, `screens/`, `hooks/`, `lib/api/`, `constants/`, y cerrar el esquema de participantes por partida en Supabase (1vs1/2vs2, con validación explícita de que las políticas RLS funcionan igual con 2 y con 4 jugadores).

**Why:** Sin esto, cada cambio sigue tocando el mismo archivo único que ya se identificó como el problema de fondo del prototipo original, y no hay backend real conectado — bloquea escalar el núcleo pulido más allá del grupo del fundador.

**Context:** Aprobado como Approach B en `/office-hours` del 9 de agosto de 2026 (ver `~/.gstack/projects/birdix-app/usuario-unknown-design-20260809-000456.md`). El 10 de agosto, durante `/plan-eng-review` de reglas de mazo + fórmula del Rango, se decidió explícitamente separar este rebuild en su propia sesión en vez de mezclarlo con el cierre de reglas — para no combinar una reestructuración grande con un cambio de reglas de juego en el mismo PR. Debe cerrarse en su propio `/plan-eng-review` antes de tocar código de Matches.

**Effort:** XL
**Priority:** P1
**Depends on:** None

### Efecto real de Escudo, Bloqueo y Segundo Golpe

**What:** Implementar la lógica real de estas 3 cartas (hoy solo se registra que se jugaron, sin ningún efecto en el juego).

**Estado — T1 completado el 19 ago 2026:** la lógica de dominio ya existe en
`src/domain/cards.js` (`isCardPlayable` bloquea selección con
`ctx.alreadyPlayedThisHole`/`ctx.rivalShieldActive`; `applyStablefordCardEffect` anula
con `ctx.cancelledByBlock` y recalcula con `ctx.secondShotBase`), con tests exhaustivos
en `cards.test.js` (33/33 verde).

**Estado — T2 completado el 19 ago 2026:** `src/lib/matchSync.js` ya existe —
`queueMatchHoleWrite({matchId, holeNumber, patch})` escribe contra `match_holes`
(columnas reales verificadas en Supabase: `player_a_card`, `player_a_strokes`, etc.),
con outbox en `localStorage` (clave `matchId:holeNumber`, patches fusionados — dos
llamadas para el mismo hoyo nunca duplican), reintento automático en `online` + cada
`intervalMs` vía `initMatchSync()`, y guarda de en-vuelo (`inFlight`) para que un doble
tap o un tick solapado con `online` no disparen dos peticiones a la vez. 13/13 tests
(offline, reintento, doble pulsación, cola persistida al reabrir, arranque sin
`window`). **Sin probar manualmente con DevTools offline todavía** — el eng review pide
esa prueba además de los tests automáticos, y no hay wiring a la UI real para hacerlo
(ver más abajo).

**Estado — T3 completado el 19 ago 2026:** `src/hooks/useMatchRealtime.js` ya existe —
`subscribeToMatchHoles` (framework-free, igual que T1/T2) se suscribe a `match_holes`
vía Postgres Changes filtrado por `match_id`, y si el canal cae (`CHANNEL_ERROR` /
`TIMED_OUT` / `CLOSED`) lo tira y crea uno nuevo tras un delay — reconexión de verdad,
no solo la del socket que ya trae Supabase por debajo. Reporta `'connected'` /
`'reconnecting'` — exactamente el estado que pide el indicador de "Estado de conexión"
de `DESIGN.md`. `useMatchRealtime(matchId, {onChange})` es el envoltorio de React (ref
para el callback, para no resuscribir en cada render). 10/10 tests sobre
`subscribeToMatchHoles` (UPDATE recibido, reconexión en los 3 estados de fallo,
desmontaje limpio, doble desmontaje idempotente, no acumula reconexiones tras
desmontar). **El hook de React en sí no tiene test propio** — no hay
jsdom/@testing-library/react en el repo y añadirlas solo para esto no encajaba con
ponytail; toda la lógica real vive en la parte framework-free, que sí está probada.

**Estado — T4 completado el 19 ago 2026:** `src/domain/holeResolution.js` ya existe —
`resolveHoleCards({playerCard, playerChoiceMade, rivalCard, rivalChoiceMade})` decide
si ya toca resolver el hoyo (los dos han elegido) y calcula qué carta queda anulada por
Bloqueo, lista para pasar como `ctx.cancelledByBlock` a `applyStablefordCardEffect` de
cada lado. 12/12 tests, incluido exactamente el caso que pide el eng review ("A juega
Todo o Nada, B juega Bloqueo" → ninguna aplica), probado de extremo a extremo
encadenando con `cards.js` de verdad, no solo con la función aislada. También incluye
`resolveMatchHoleRow(row)`, un envoltorio sobre una fila real de `match_holes` —
**con una interpretación de los campos `*_card_confirmed`/`*_hole_submitted` que no
está verificada contra una partida real** (documentado en el propio archivo): al no
existir todavía la pantalla que confirma cartas contra Supabase, no hay forma de
comprobar que esa lectura de columnas es la que el resto del sistema espera. Revisar
esa función específicamente cuando se construya esa pantalla — `resolveHoleCards` en
sí (la parte sin Supabase) no depende de esta interpretación y no hace falta tocarla.

**Pendiente real — T1, T2, T3 y T4 están todos completos y probados, pero nada los
conecta todavía:** `MatchPlayScreen` (`App.jsx`) sigue con su lógica local de siempre,
sin llamar a `queueMatchHoleWrite`/`initMatchSync`, `useMatchRealtime`,
`resolveHoleCards`/`resolveMatchHoleRow`, ni a los nuevos campos de contexto de
`cards.js`. En la app real las 3 cartas, el guardado offline, Realtime y el indicador
de reconexión se comportan exactamente igual que antes de esta sesión hasta que se
haga ese wiring — que es, a propósito, el trabajo de la reestructuración completa
(Approach B, ver el TODO de arquitectura más arriba) y no algo que quepa bien en un
`MatchPlayScreen` de 3400+ líneas sin reestructurar primero.

**Why:** Son 3 de las 10 cartas del reglamento oficial y hoy no hacen nada más allá de aparecer en el marcador — necesitan que ambos jugadores vean la misma jugada en el mismo instante (Escudo bloquea cartas rivales ese hoyo, Bloqueo cancela una carta concreta, Segundo Golpe repite un golpe), lo cual requiere sincronización en tiempo real.

**Context:** Decidido en `/plan-eng-review` del 10 de agosto de 2026: "registrar la jugada, sin lógica de efecto" es la solución elegida para el lanzamiento al grupo del fundador, precisamente porque Supabase Realtime (fase 3 del roadmap) no está conectado todavía. Revertido en `/plan-eng-review` del 19 ago 2026 (Decision 4): con Realtime entrando en este mismo sprint, se implementa el efecto real antes del 10 sept — ver
`~/.gstack/projects/birdix-app/usuario-main-eng-review-20260819-120126.md`.

**Effort:** L (todo T1-T4 hecho y probado; lo que queda es el wiring real a
`MatchPlayScreen`, que depende de la reestructuración Approach B)
**Priority:** P1 (subida desde P2 — ya no depende de que Realtime "llegue", Realtime ya
está aquí; el bloqueante real ahora es la reestructuración de `App.jsx`)
**Depends on:** Reestructuración completa (Approach B) — ver TODO de arquitectura más arriba.

### Verificar reglas de cartas en 2vs2

**What:** Confirmar que el enfoque cerrado el 10 de agosto (registrar sin efecto para las 5 cartas no-puntuables, el gate de elegibilidad de Remontada) funciona igual de bien en `TeamStablefordScreen` (2vs2), que tiene su propio switch de efectos separado del de 1vs1.

**Why:** Esta sesión se centró en el núcleo pulido 1vs1 según `BIRDIX_DESIGN_BRIEF.md`, sin tocar la lógica 2vs2 — evita que ambos formatos se desincronicen silenciosamente en las reglas de cartas.

**Context:** `TeamStablefordScreen` (`src/App.jsx:2200`) duplica parte de la lógica de `applyStablefordCardEffect` para el caso de equipos. 2vs2 no tiene fecha de construcción decidida (premisa 5 del `/office-hours` del 9 de agosto: se decide tras ver cómo va el 1vs1 real con el grupo), así que esto es barato de revisar cuando 2vs2 vuelva a estar sobre la mesa.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Indicador visual de reconexión Realtime

**What:** Punto de 6px sin texto ambiental en el hueco de simetría ya reservado en la
cabecera de Hoyo N (`MatchPlayScreen`, `App.jsx:2763` — hoy `<div className="h-10 w-10" />`
vacío). Invisible online, `mist #9CA3AF` con pulso lento al reconectar, destello
`greenLight #2D8E5C` (~600ms) al recuperar conexión. Única excepción de texto: franja
inline breve ("Carta guardada — se sincroniza sola") cuando se juega una carta sin
conexión — los golpes apuntados sin conexión no llevan tratamiento adicional.

**Why:** Sin ningún indicador, el jugador no puede distinguir "la app está colgada" de
"no hay cobertura, ya se arreglará solo" — y sin el requisito de no-bloqueo, arriesga que
la partida se quede parada en medio del campo, justo lo que el fundador señaló como
inaceptable en el `/plan-eng-review` del 19 ago.

**Context:** Surge del `/plan-eng-review` del 19 ago 2026 (ver
`~/.gstack/projects/birdix-app/usuario-main-eng-review-20260819-120126.md`), al cerrar el
diseño del canal Realtime. El principio de no-bloqueo ya queda fijado en Architecture
Decision 2/3 de ese documento. **Patrón visual cerrado el 19 ago 2026 en
`/design-consultation`** (ver sección "Estado de conexión" en `DESIGN.md`) — este TODO
ya no está bloqueado en diseño. **T3 completado el 19 ago 2026:**
`useMatchRealtime(matchId, {onChange})` (`src/hooks/useMatchRealtime.js`) ya devuelve
exactamente el estado que este indicador necesita — `status: 'connected' |
'reconnecting'` — así que la fuente de datos ya existe. Pendiente real: nadie ha puesto
el punto de 6px en `App.jsx:2763` todavía ni ha llamado al hook desde `MatchPlayScreen`
— eso llega con T4, cuando esa pantalla empiece a usar Realtime de verdad.

**Effort:** XS
**Priority:** P2
**Depends on:** T3 del eng review del 19 ago (hook `useMatchRealtime.js`)

### SVG del isotipo antes del manifest de PWA

**What:** Conseguir el isotipo (`birdix-isotipo-ix.png`, hoy 500×500 sin canal alfa) en
SVG antes de construir los íconos de instalación del PWA.

**Why:** El PNG actual rinde bien en los usos de hoy dentro de la app (32-36px, muy
sobremuestreado), pero los íconos de instalación PWA necesitan hasta 1024×1024 (maskable)
y transparencia para componer sobre fondos distintos — el archivo actual no cubre ninguna
de las dos cosas.

**Context:** Detectado el 19 ago 2026 en `/design-consultation` al actualizar `DESIGN.md`
(sección "Uso del logo"). No bloquea nada hoy — no existe todavía manifest de PWA en el
repo — pero conviene resolverlo antes de que alguien lo descubra construyendo los íconos
la semana del lanzamiento.

**Effort:** XS
**Priority:** P3
**Depends on:** Ninguna — barato de resolver cuando convenga, antes de tocar el manifest de PWA.

### Migrar login a magic link

**What:** Sustituir el login actual de email+contraseña (`signInWithPassword`/`signUp`
en `App.jsx:3239-3288`) por magic link (`supabase.auth.signInWithOtp`), sin contraseñas.

**Why:** Era la decisión original del brief de negocio del 19 ago 2026 (menos fricción
de registro), pero se descubrió durante el `/plan-eng-review` del mismo día que el login
de contraseña ya está construido y funcionando de verdad contra Supabase — migrar ahora
añadía riesgo innecesario a un calendario ya ajustado para el lanzamiento del 10 sept, sin
necesidad real para un grupo cercano de amigos que ya sabe usar contraseñas.

**Context:** Ver Decision 5 en
`~/.gstack/projects/birdix-app/usuario-main-eng-review-20260819-120126.md`. Vale la pena
revisitar cuando Birdix se abra a más gente que el círculo cercano del fundador, donde la
fricción de contraseña empieza a pesar más.

**Effort:** S
**Priority:** P3
**Depends on:** Ninguna — se puede hacer cuando convenga tras el 10 sept.
